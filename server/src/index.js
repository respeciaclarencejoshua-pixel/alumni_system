import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, '../.env'),
});
dotenv.config({ path: path.join(__dirname, '../../client/.env.local') });

const giphyApiKey = process.env.GIPHY_API_KEY || process.env.VITE_GIPHY_API_KEY;

const app = express();
const port = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';
const supabaseQueryTimeoutMs = Math.max(
  Number.parseInt(process.env.SUPABASE_QUERY_TIMEOUT_MS, 10) || 5000,
  1000
);

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const DEFAULT_SETTINGS = Object.freeze({
  allow_open_signups: true,
  verify_domain: false,
  approved_email_domains: [],
  session_timeout_minutes: 60,
  require_admin_mfa: false,
  maintenance_mode: false,
  captcha_enabled: true,
  rate_limit_per_minute: 60,
  upload_max_mb: 10,
  allowed_file_types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
});
let settingsCache = { value: DEFAULT_SETTINGS, expiresAt: 0 };

async function getSystemSettings({ fresh = false } = {}) {
  if (!fresh && settingsCache.expiresAt > Date.now()) return settingsCache.value;
  if (!adminClient) return DEFAULT_SETTINGS;
  const { data, error } = await adminClient.from('system_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  settingsCache = { value: { ...DEFAULT_SETTINGS, ...(data || {}) }, expiresAt: Date.now() + 30_000 };
  return settingsCache.value;
}

function publicError(res, status, code, message) {
  return res.status(status).json({ code, error: message });
}

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        error: 'Please correct the submitted fields.',
        fields: result.error.flatten().fieldErrors,
      });
    }
    req.body = result.data;
    return next();
  };
}

const memberCreateSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  role: z.enum(['alumni', 'employer', 'staff', 'admin']).default('alumni'),
  status: z.enum(['pending', 'verified', 'suspended']).default('pending'),
  email_confirmed: z.boolean().optional().default(false),
}).strict();

const memberUpdateSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.email().transform((value) => value.toLowerCase()),
  role: z.enum(['alumni', 'employer', 'staff', 'admin']),
  status: z.enum(['pending', 'verified', 'suspended']),
  password: z.string().max(128).optional(),
  suspension_reason: z.string().trim().max(1000).optional(),
  email_confirmed: z.boolean().optional(),
}).strip();

const settingsUpdateSchema = z.object({
  institution_name: z.string().trim().min(1).max(150).optional(),
  contact_email: z.email().optional(),
  allow_open_signups: z.boolean().optional(),
  verify_domain: z.boolean().optional(),
  approved_email_domains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+$/)).max(100).optional(),
  session_timeout_minutes: z.number().int().min(15).max(1440).optional(),
  require_admin_mfa: z.boolean().optional(),
  content_retention_days: z.number().int().min(1).max(365).optional(),
  maintenance_mode: z.boolean().optional(),
  captcha_provider: z.string().trim().max(50).optional(),
  captcha_enabled: z.boolean().optional(),
  upload_max_mb: z.number().int().min(1).max(50).optional(),
  allowed_file_types: z.array(z.string().trim().max(100)).max(30).optional(),
  verification_document_retention_days: z.number().int().min(1).max(3650).optional(),
  moderation_reasons: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  rate_limit_per_minute: z.number().int().min(10).max(1000).optional(),
  email_templates: z.record(z.string(), z.unknown()).optional(),
}).strip();

function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

function isAllowedDevelopmentOrigin(origin) {
  if (isProduction) {
    return false;
  }

  try {
    const { hostname, protocol } = new URL(origin);
    return (
      ['http:', 'https:'].includes(protocol) &&
      ['localhost', '127.0.0.1', '::1'].includes(hostname)
    );
  } catch {
    return false;
  }
}

function inputError(message) {
  return Object.assign(new Error(message), { status: 400, publicMessage: message });
}

function normalizeIsoDate(value, field, { required = false } = {}) {
  if (value === null || value === undefined || value === '') {
    if (required) throw inputError(`${field} is required.`);
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw inputError(`${field} must be a valid date and time.`);
  return parsed.toISOString();
}

function normalizeEventPayload(input) {
  const text = (key, maximum, { required = false } = {}) => {
    const value = String(input[key] ?? '').trim();
    if (required && !value) throw inputError(`${key} is required.`);
    if (value.length > maximum) throw inputError(`${key} must be ${maximum} characters or fewer.`);
    return value;
  };
  const title = text('title', 160, { required: true });
  const description = text('description', 5000, { required: true });
  const category = text('category', 80) || 'Networking';
  const location = text('location', 300, { required: true });
  const status = String(input.status || 'published').trim().toLowerCase();
  if (!['draft', 'published', 'archived', 'cancelled'].includes(status)) {
    throw inputError('status must be draft, published, archived, or cancelled.');
  }

  const date = normalizeIsoDate(input.date || input.startDate || input.start_date, 'date', { required: true });
  const endDate = normalizeIsoDate(input.endDate || input.end_date, 'endDate');
  const registrationDeadline = normalizeIsoDate(input.registrationDeadline || input.registration_deadline, 'registrationDeadline');
  if (endDate && new Date(endDate) <= new Date(date)) throw inputError('endDate must be later than the event start.');
  if (registrationDeadline && new Date(registrationDeadline) > new Date(date)) throw inputError('registrationDeadline cannot be after the event starts.');

  const capacityValue = input.capacity === '' || input.capacity === null || input.capacity === undefined
    ? null
    : Number(input.capacity);
  if (capacityValue !== null && (!Number.isInteger(capacityValue) || capacityValue < 1 || capacityValue > 100000)) {
    throw inputError('capacity must be a whole number between 1 and 100,000.');
  }

  const coordinate = (value, name, minimum, maximum) => {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum || number > maximum) throw inputError(`${name} is outside the valid range.`);
    return number;
  };
  const latitude = coordinate(input.latitude, 'latitude', -90, 90);
  const longitude = coordinate(input.longitude, 'longitude', -180, 180);
  if ((latitude === null) !== (longitude === null)) throw inputError('latitude and longitude must be supplied together.');

  const imageUrl = String(input.image_url || input.imageUrl || '').trim();
  if (imageUrl) {
    let parsed;
    try { parsed = new URL(imageUrl); } catch { throw inputError('image_url must be a valid web address.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || imageUrl.length > 2048) throw inputError('image_url must use HTTP or HTTPS and be 2,048 characters or fewer.');
  }

  return {
    title,
    description,
    category,
    status,
    date,
    endDate,
    registrationDeadline,
    location,
    city: text('city', 120) || null,
    latitude,
    longitude,
    capacity: capacityValue,
    image_url: imageUrl || null,
    featured: Boolean(input.featured),
    publishedAt: status === 'published'
      ? normalizeIsoDate(input.publishedAt, 'publishedAt') || new Date().toISOString()
      : null,
  };
}

function toPublicEvent(resource, interestCount = 0) {
  const payload = resource?.payload || {};
  return {
    id: resource.id,
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim(),
    category: String(payload.category || 'Networking').trim(),
    status: String(payload.status || 'published').trim().toLowerCase(),
    date: payload.date || payload.startDate || payload.start_date || null,
    endDate: payload.endDate || payload.end_date || null,
    registrationDeadline: payload.registrationDeadline || payload.registration_deadline || null,
    location: String(payload.location || '').trim(),
    city: String(payload.city || '').trim() || null,
    latitude: Number.isFinite(Number(payload.latitude)) ? Number(payload.latitude) : null,
    longitude: Number.isFinite(Number(payload.longitude)) ? Number(payload.longitude) : null,
    capacity: Number.isInteger(Number(payload.capacity)) && Number(payload.capacity) > 0 ? Number(payload.capacity) : null,
    image_url: payload.image_url || payload.imageUrl || null,
    featured: Boolean(payload.featured),
    publishedAt: payload.publishedAt || null,
    interest_count: interestCount,
    created_at: resource.created_at,
  };
}

async function runSupabaseQuery(query) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    supabaseQueryTimeoutMs
  );

  try {
    return await query.abortSignal(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}

const authClient =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          persistSession: false,
        },
      })
    : null;

const adminClient =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
        },
      })
    : null;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
      frameSrc: ["'self'", 'https://challenges.cloudflare.com'],
      connectSrc: ["'self'", supabaseUrl].filter(Boolean),
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:', 'https:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  } : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, curl requests)
      if (!origin) {
        return callback(null, true);
      }
      
      if (isAllowedDevelopmentOrigin(origin)) {
        return callback(null, true);
      }
      
      // Check configured origins for production
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      const corsError = new Error('Origin is not allowed by CORS');
      corsError.status = 403;
      corsError.publicMessage = 'Origin is not allowed by CORS.';
      return callback(corsError);
    },

    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  })
);

app.use(express.json({ limit: '1mb' }));

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: () => Math.min(Math.max(Number(settingsCache.value.rate_limit_per_minute) || 60, 10), 1000),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => publicError(res, 429, 'RATE_LIMITED', 'Too many requests. Please try again shortly.'),
});
app.use('/api', apiLimiter);

app.get('/api/config', async (_req, res, next) => {
  try {
    const settings = await getSystemSettings();
    res.json({
      allowOpenSignups: settings.allow_open_signups,
      maintenanceMode: settings.maintenance_mode,
      captchaEnabled: settings.captcha_enabled,
      uploadMaxMb: settings.upload_max_mb,
      allowedFileTypes: settings.allowed_file_types,
      institutionName: settings.institution_name,
      contactEmail: settings.contact_email,
    });
  } catch (error) { next(error); }
});

app.use('/api', async (req, res, next) => {
  if (req.path === '/status' || req.path === '/config' || req.path.startsWith('/admin')) return next();
  if (!['/events', '/gallery', '/home'].includes(req.path)) return next();
  try {
    if ((await getSystemSettings()).maintenance_mode) {
      return publicError(res, 503, 'MAINTENANCE_MODE', 'The alumni community is temporarily undergoing maintenance.');
    }
    return next();
  } catch (error) { return next(error); }
});

/* =========================================================
   BASIC STATUS
========================================================= */

app.get('/api/status', (req, res) =>
  res.json({
    status: 'ok',
    message: 'Alumni system backend is running',
  })
);

app.get('/api/ready', async (_req, res) => {
  if (!authClient || !adminClient) {
    return publicError(res, 503, 'BACKEND_NOT_CONFIGURED', 'Database credentials are not configured.');
  }
  try {
    const { error } = await runSupabaseQuery(adminClient.from('system_settings').select('id').limit(1));
    if (error) throw error;
    return res.json({ status: 'ready', database: 'connected' });
  } catch (error) {
    console.error('Readiness check failed:', error?.message || error);
    return publicError(res, 503, 'DATABASE_NOT_READY', 'The database connection or server credential is unavailable.');
  }
});

/* =========================================================
   EVENTS
========================================================= */

app.get('/api/events', async (req, res, next) => {
  if (!adminClient) {
    return res.status(503).json({
      error: 'Public event data is not configured.',
    });
  }

  try {
    const { data, error } = await runSupabaseQuery(
      adminClient
        .from('admin_resources')
        .select('*')
        .eq('resource_type', 'events')
        .order('created_at', {
          ascending: false,
        })
    );

    if (error) {
      throw error;
    }

    // Normalize legacy status capitalization while never exposing drafts.
    const publishableStatuses = new Set(['published', 'active', 'approved']);
    const publishedResources = (data || []).filter((resource) => {
      const status = String(resource.payload?.status || '').trim().toLowerCase();
      // Events created before publication statuses were introduced were public
      // by default. Keep those legacy records visible; explicit drafts remain private.
      return !status || publishableStatuses.has(status);
    });

    // Registration totals are public; attendee identities remain admin-only.
    let interestCounts = {};
    const resourceIds = publishedResources.map((resource) => resource.id);
    
    if (resourceIds.length) {
      try {
        const { data: interests, error: interestsError } = await runSupabaseQuery(
          adminClient
            .from('event_registrations')
            .select('event_id,status')
            .in('event_id', resourceIds)
            .neq('status','cancelled')
        );
        
        if (!interestsError) {
          interestCounts = (interests || []).reduce((counts, interest) => {
            counts[interest.event_id] = (counts[interest.event_id] || 0) + 1;
            return counts;
          }, {});
        }
      } catch (e) {
        console.warn('event_registrations table not available:', e.message);
      }
    }

    // Return a deliberate public shape so an accidentally stored internal
    // admin field can never leak through this endpoint.
    const events = publishedResources.map((resource) =>
      toPublicEvent(resource, interestCounts[resource.id] || 0)
    );

    return res.json({
      events: events,
    });
  } catch (error) {
    error.status = 503;
    error.publicMessage =
      'Public event data is temporarily unavailable. Check the Supabase connection and schema.';
    return next(error);
  }
});

/* =========================================================
   ADMIN AUTHENTICATION
========================================================= */

function requireAdminConfiguration(req, res, next) {
  if (!authClient || !adminClient) {
    return res.status(503).json({
      error:
        'Admin API is not configured. Set the server Supabase environment variables.',
    });
  }

  return next();
}

async function requireAdmin(req, res, next) {
  const token = req
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return publicError(res, 401, 'AUTH_REQUIRED', 'Sign in is required.');
  }

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return publicError(res, 401, 'SESSION_INVALID', 'Your session is invalid or expired.');
  }

  const {
    data: profile,
    error: profileError,
  } = await adminClient
    .from('profiles')
    .select(
      'id, first_name, last_name, email, role, status'
    )
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return next(profileError);
  }

  if (!profile || !['admin', 'staff'].includes(String(profile.role).toLowerCase())) {
    return publicError(res, 403, 'ADMIN_REQUIRED', 'Administrator access is required.');
  }
  if (profile.status !== 'verified') {
    return publicError(res, 403, 'ADMIN_NOT_VERIFIED', 'This administrator account is not verified or has been suspended.');
  }

  const settings = await getSystemSettings();
  const claims = decodeJwtPayload(token);
  const issuedAtMs = Number(claims.iat || 0) * 1000;
  const maxAgeMs = Math.min(Math.max(Number(settings.session_timeout_minutes) || 60, 15), 1440) * 60_000;
  if (!issuedAtMs || Date.now() - issuedAtMs > maxAgeMs) {
    return publicError(res, 401, 'SESSION_TOO_OLD', 'Your administrator session timed out. Please sign in again.');
  }
  if (settings.require_admin_mfa && claims.aal !== 'aal2') {
    return publicError(res, 403, 'MFA_REQUIRED', 'Multi-factor authentication is required for administrator access.');
  }

  req.admin = {
    id: user.id,
    email: user.email,
    profile,
    settings,
  };

  return next();
}

/* =========================================================
   AUDIT LOG
========================================================= */

async function writeAuditLog({
  actorId,
  action,
  targetType,
  targetId = null,
  details = {},
}) {
  const { error } = await adminClient
    .from('admin_audit_logs')
    .insert({
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
    });

  if (error) {
    throw error;
  }
}

/* =========================================================
   ADMIN ROUTER
========================================================= */

const adminRouter = express.Router();

const sensitiveAdminLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => publicError(res, 429, 'SENSITIVE_RATE_LIMITED', 'Too many sensitive operations. Please wait and try again.'),
});

app.get('/api/home', async (_req, res, next) => {
  if (!adminClient) return publicError(res, 503, 'PUBLIC_DATA_UNAVAILABLE', 'Public website data is not configured.');
  try {
    const count = async (table, configure = (query) => query) => {
      const { count: total, error } = await runSupabaseQuery(configure(adminClient.from(table).select('*', { count: 'exact', head: true })));
      if (error) throw error;
      return total || 0;
    };
    const [newsResult, alumni, photos, opportunities, eventResult] = await Promise.all([
      runSupabaseQuery(adminClient.from('admin_resources').select('id,payload,created_at').eq('resource_type', 'news').eq('payload->>status', 'published').order('created_at', { ascending: false }).limit(4)),
      count('profiles', (query) => query.eq('role', 'alumni').eq('status', 'verified')),
      count('gallery_submissions', (query) => query.eq('status', 'approved')),
      count('opportunities', (query) => query.eq('status', 'active')),
      runSupabaseQuery(adminClient.from('admin_resources').select('id,payload,created_at').eq('resource_type', 'events')),
    ]);
    if (newsResult.error || eventResult.error) throw newsResult.error || eventResult.error;
    const publishableStatuses = new Set(['published', 'active', 'approved']);
    const publishedEvents = (eventResult.data || [])
      .filter((item) => {
        const status = String(item.payload?.status || '').trim().toLowerCase();
        return !status || publishableStatuses.has(status);
      })
      .map((item) => toPublicEvent(item))
      .sort((a, b) => new Date(a.date || a.created_at) - new Date(b.date || b.created_at));
    const news = (newsResult.data || []).map((item) => ({
      id: item.id,
      title: String(item.payload?.title || '').trim(),
      description: String(item.payload?.description || item.payload?.text || '').trim(),
      category: String(item.payload?.category || 'University News').trim(),
      image_url: item.payload?.image_url || null,
      created_at: item.created_at,
    }));
    res.json({
      news,
      events: publishedEvents.filter((item) => !item.date || new Date(item.date) >= new Date()).slice(0, 4),
      metrics: { alumni, photos, opportunities, events: publishedEvents.length },
    });
  } catch (error) { next(error); }
});

adminRouter.use(
  requireAdminConfiguration,
  requireAdmin
);

/* =========================================================
   ADMIN PROFILE
========================================================= */

adminRouter.get('/me', async (req, res, next) => {
  try {
    const allScopes = ['dashboard','members','verification','opportunities','events','moderation','gallery','analytics','settings'];
    let permission = { admin_role: 'super_admin', scopes: allScopes };
    if (req.admin.profile.role !== 'admin') {
      const { data, error } = await adminClient.from('admin_permissions').select('scopes,admin_role').eq('profile_id', req.admin.id).maybeSingle();
      if (error) throw error;
      permission = data || { admin_role: 'analyst', scopes: ['dashboard', 'analytics'] };
    }
    res.json({ user: req.admin.profile, permission });
  } catch (error) { next(error); }
});

function requiredAdminScope(pathname) {
  if (pathname.startsWith('/members') || pathname.startsWith('/users')) return 'members';
  if (pathname.startsWith('/verifications')) return 'verification';
  if (pathname.startsWith('/opportunities') || pathname.startsWith('/opportunity-analytics') || pathname.startsWith('/resources/jobs')) return 'opportunities';
  if (pathname.startsWith('/events') || pathname.startsWith('/resources/events')) return 'events';
  if (pathname.startsWith('/moderation') || pathname.startsWith('/community-content') || pathname.startsWith('/resources/news')) return 'moderation';
  if (pathname.startsWith('/gallery-submissions')) return 'gallery';
  if (pathname.startsWith('/analytics') || pathname.startsWith('/resources/reports')) return 'analytics';
  if (pathname.startsWith('/settings') || pathname.startsWith('/permissions') || pathname.startsWith('/resources/surveys')) return 'settings';
  return 'dashboard';
}

adminRouter.use(async (req, res, next) => {
  if (req.admin.profile.role === 'admin') return next();
  try {
    const { data, error } = await adminClient.from('admin_permissions').select('scopes,admin_role').eq('profile_id', req.admin.id).maybeSingle();
    if (error) throw error;
    const needed = requiredAdminScope(req.path);
    const scopes = data?.scopes || ['dashboard', 'analytics'];
    if (!scopes.includes(needed)) return publicError(res, 403, 'ADMIN_SCOPE_REQUIRED', `Your ${data?.admin_role || 'staff'} role does not include ${needed} access.`);
    req.admin.permission = data;
    return next();
  } catch (error) { return next(error); }
});

async function requireMemberMutationAuthority(req, res, next) {
  try {
    const { data, error } = await adminClient.from('profiles').select('id,role,status').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return publicError(res, 404, 'MEMBER_NOT_FOUND', 'Member not found.');
    if (req.admin.profile.role !== 'admin' && ['admin', 'staff'].includes(data.role)) {
      return publicError(res, 403, 'SUPER_ADMIN_REQUIRED', 'Only a super administrator can manage another privileged account.');
    }
    req.targetMember = data;
    return next();
  } catch (error) { return next(error); }
}

app.get('/api/gallery', async (req, res, next) => {
  if (!adminClient) return res.status(503).json({ error: 'Gallery data is not configured.' });
  try {
    const { data, error } = await runSupabaseQuery(adminClient.from('gallery_submissions').select('id,author_name,title,description,category,photo_date,batch_year,batch_name,people_names,image_path,featured,featured_rank,featured_starts_at,featured_ends_at,created_at').eq('status', 'approved').order('featured', { ascending: false }).order('featured_rank', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }));
    if (error) throw error;
    const now = Date.now();
    const eligible = (data || []).map(photo => ({...photo, featured: Boolean(photo.featured && (!photo.featured_starts_at || new Date(photo.featured_starts_at).getTime() <= now) && (!photo.featured_ends_at || new Date(photo.featured_ends_at).getTime() >= now))}));
    const photos = (await Promise.all(eligible.map(async (photo) => {
      const { data: signed, error: signedError } = await adminClient.storage.from('gallery-media').createSignedUrl(photo.image_path, 3600);
      if (signedError) {
        console.warn(`Skipping gallery item ${photo.id}:`, signedError.message);
        return null;
      }
      return { ...photo, url: signed.signedUrl };
    }))).filter(Boolean);
    res.json({ photos });
  } catch (error) { next(error); }
});

/* =========================================================
   LIVE ADMIN OVERVIEW
========================================================= */

adminRouter.get('/overview', async (req, res, next) => {
  const count = async (table, configure = (query) => query) => {
    const { count: total, error } = await runSupabaseQuery(
      configure(adminClient.from(table).select('*', { count: 'exact', head: true }))
    );
    if (error) throw error;
    return total || 0;
  };

  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [totalAlumni, verifiedAlumni, newRegistrations, pendingApprovals, posts,
      galleryPhotos, opportunities, events, eventResponses, messages, recentPosts,
      recentOpportunities, recentEvents] = await Promise.all([
      count('profiles', (q) => q.eq('role', 'alumni')),
      count('profiles', (q) => q.eq('role', 'alumni').eq('status', 'verified')),
      count('profiles', (q) => q.gte('created_at', since)),
      count('alumni_verifications', (q) => q.eq('status', 'pending')),
      count('feed_posts'),
      count('gallery_submissions', (q) => q.eq('status', 'approved')),
      count('opportunities', (q) => q.eq('status', 'active')),
      count('admin_resources', (q) => q.eq('resource_type', 'events')),
      count('event_interests'),
      count('direct_messages'),
      runSupabaseQuery(adminClient.from('feed_posts').select('id, author_name, content, created_at').order('created_at', { ascending: false }).limit(4)),
      runSupabaseQuery(adminClient.from('opportunities').select('id, author_name, title, created_at').order('created_at', { ascending: false }).limit(4)),
      runSupabaseQuery(adminClient.from('admin_resources').select('id, payload, created_at').eq('resource_type', 'events').order('created_at', { ascending: false }).limit(4)),
    ]);

    const queryResults = [recentPosts, recentOpportunities, recentEvents];
    const queryError = queryResults.find((result) => result.error)?.error;
    if (queryError) throw queryError;

    const [educationResult, rolesResult, profilesResult, contributionsResult, commentsResult, reactionsResult] = await Promise.all([
      runSupabaseQuery(adminClient.from('education').select('profile_id, course, department, graduation_year, batch_name')),
      runSupabaseQuery(adminClient.from('profile_roles').select('profile_id, role')),
      runSupabaseQuery(adminClient.from('profiles').select('id, first_name, last_name, email, role')),
      runSupabaseQuery(adminClient.from('feed_posts').select('user_id')),
      runSupabaseQuery(adminClient.from('feed_comments').select('user_id')),
      runSupabaseQuery(adminClient.from('feed_reactions').select('user_id')),
    ]);
    const analyticsError = [educationResult, rolesResult, profilesResult, contributionsResult, commentsResult, reactionsResult].find((result) => result.error)?.error;
    if (analyticsError) throw analyticsError;

    const rankedCounts = (items, key) => Object.entries((items || []).reduce((counts, item) => {
      const value = item[key] || 'Not specified'; counts[value] = (counts[value] || 0) + 1; return counts;
    }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

    const rolesByUser = (rolesResult.data || []).reduce((map, item) => {
      if (!map[item.profile_id]) map[item.profile_id] = new Set();
      map[item.profile_id].add(item.role);
      return map;
    }, {});
    (profilesResult.data || []).forEach((profile) => {
      if (!rolesByUser[profile.id]) rolesByUser[profile.id] = new Set([profile.role || 'alumni']);
    });
    const roleCounts = { alumni: 0, employer: 0, dual: 0 };
    Object.values(rolesByUser).forEach((roles) => {
      if (roles.has('alumni')) roleCounts.alumni += 1;
      if (roles.has('employer')) roleCounts.employer += 1;
      if (roles.has('alumni') && roles.has('employer')) roleCounts.dual += 1;
    });

    const scores = {};
    const addScore = (rows, points, field) => (rows || []).forEach((item) => {
      if (!scores[item.user_id]) scores[item.user_id] = { score: 0, posts: 0, comments: 0, reactions: 0 };
      scores[item.user_id].score += points; scores[item.user_id][field] += 1;
    });
    addScore(contributionsResult.data, 3, 'posts'); addScore(commentsResult.data, 2, 'comments'); addScore(reactionsResult.data, 1, 'reactions');
    const profilesById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));
    const mostActive = Object.entries(scores).map(([id, detail]) => {
      const profile = profilesById.get(id) || {};
      return { id, name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || 'Member', ...detail };
    }).sort((a, b) => b.score - a.score).slice(0, 5);

    const activity = [
      ...(recentPosts.data || []).map((item) => ({ id: item.id, type: 'Feed post', title: item.content?.slice(0, 90) || 'Photo shared', actor: item.author_name, created_at: item.created_at })),
      ...(recentOpportunities.data || []).map((item) => ({ id: item.id, type: 'Opportunity', title: item.title, actor: item.author_name, created_at: item.created_at })),
      ...(recentEvents.data || []).map((item) => ({ id: item.id, type: 'Event', title: item.payload?.title || 'Community event', actor: 'Administrator', created_at: item.created_at })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);

    res.json({
      metrics: { totalAlumni, verifiedAlumni, newRegistrations, pendingApprovals, posts, galleryPhotos, opportunities, events, eventResponses, messages, employers: roleCounts.employer, dualRole: roleCounts.dual },
      demographics: {
        departments: rankedCounts(educationResult.data, 'department'),
        courses: rankedCounts(educationResult.data, 'course'),
        graduationYears: rankedCounts(educationResult.data, 'graduation_year'),
        batchNames: rankedCounts(educationResult.data, 'batch_name'),
        roles: [{ label: 'Alumni', value: roleCounts.alumni }, { label: 'Employer', value: roleCounts.employer }, { label: 'Alumni + Employer', value: roleCounts.dual }],
        mostActive,
      },
      activity,
    });
  } catch (error) { next(error); }
});

adminRouter.get('/community-content', async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 10, 1), 50);
    const from = (page - 1) * pageSize;
    let query = adminClient.from('feed_posts')
      .select('id,user_id,author_name,author_avatar_url,content,media_path,created_at,moderation_status,comments_locked,reactions_disabled,deleted_at,deletion_reason,profiles!feed_posts_user_id_fkey(status,warnings_count),feed_comments(count),feed_reactions(count)', { count: 'exact' });
    const status = String(req.query.status || 'published');
    if (status !== 'all') query = query.eq('moderation_status', status);
    if (req.query.type === 'text') query = query.is('media_path', null);
    if (req.query.type === 'photo') query = query.not('media_path', 'is', null);
    if (req.query.author) query = query.ilike('author_name', `%${String(req.query.author).slice(0, 100)}%`);
    if (req.query.from) query = query.gte('created_at', String(req.query.from));
    if (req.query.to) query = query.lte('created_at', String(req.query.to));
    const ascending = req.query.sort === 'oldest';
    query = query.order('created_at', { ascending }).range(from, from + pageSize - 1);
    const { data, error, count } = await runSupabaseQuery(query);
    if (error) throw error;
    const posts = await Promise.all((data || []).map(async (post) => {
      let mediaUrl = null;
      if (post.media_path) {
        const { data: publicData } = adminClient.storage.from('feed-media').getPublicUrl(post.media_path);
        mediaUrl = publicData?.publicUrl || null;
      }
      return { ...post, media_url: mediaUrl, comment_count: post.feed_comments?.[0]?.count || 0, reaction_count: post.feed_reactions?.[0]?.count || 0 };
    }));
    res.json({ posts, total: count || 0, page, pageSize });
  } catch (error) { next(error); }
});

adminRouter.get('/community-content/:postId', async (req, res, next) => {
  try {
    const { data: post, error: findError } = await adminClient.from('feed_posts').select('*,profiles!feed_posts_user_id_fkey(id,first_name,last_name,email,status,warnings_count,locked_until),feed_comments(*),feed_reactions(*)').eq('id', req.params.postId).maybeSingle();
    if (findError) throw findError;
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    const [{ data: reports, error: reportError }, { data: history, error: historyError }] = await Promise.all([
      adminClient.from('content_reports').select('*').eq('target_type','feed_post').eq('target_id',post.id).order('created_at',{ascending:false}),
      adminClient.from('moderation_actions').select('*').eq('target_type','feed_post').eq('target_id',post.id).order('created_at',{ascending:false}),
    ]);
    if (reportError) throw reportError; if (historyError) throw historyError;
    let mediaUrl = null; if (post.media_path) mediaUrl = adminClient.storage.from('feed-media').getPublicUrl(post.media_path).data?.publicUrl || null;
    res.json({ post: { ...post, media_url: mediaUrl }, reports: reports || [], history: history || [] });
  } catch (error) { next(error); }
});

async function assertCanRestrictMember(targetId, actorRole) {
  if (actorRole === 'admin') return;
  const { data, error } = await adminClient.from('profiles').select('role').eq('id', targetId).maybeSingle();
  if (error) throw error;
  if (['admin', 'staff'].includes(data?.role)) {
    throw Object.assign(new Error('Only a super administrator can restrict a privileged account.'), {
      status: 403,
      publicMessage: 'Only a super administrator can restrict a privileged account.',
    });
  }
}

async function moderateFeedPost({ postId, action, reason, actorId, actorRole, reportId = null }) {
  const { data: post, error: findError } = await adminClient.from('feed_posts').select('id,user_id,moderation_status,comments_locked,reactions_disabled').eq('id',postId).maybeSingle();
  if (findError) throw findError; if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 });
  const updates = {};
  if (action === 'keep' || action === 'restore') Object.assign(updates,{moderation_status:'published',deleted_at:null,deletion_reason:null,deleted_by:null});
  if (action === 'hide') updates.moderation_status = 'hidden';
  if (action === 'remove') Object.assign(updates,{moderation_status:'removed',deleted_at:new Date().toISOString(),deletion_reason:reason,deleted_by:actorId});
  if (action === 'lock_comments') updates.comments_locked = true;
  if (action === 'unlock_comments') updates.comments_locked = false;
  if (action === 'disable_reactions') updates.reactions_disabled = true;
  if (action === 'enable_reactions') updates.reactions_disabled = false;
  if (Object.keys(updates).length) { const { error } = await adminClient.from('feed_posts').update(updates).eq('id',postId); if (error) throw error; }
  if (action === 'warn') { const { data: profile, error } = await adminClient.from('profiles').select('warnings_count').eq('id',post.user_id).single(); if(error) throw error; const {error:updateError}=await adminClient.from('profiles').update({warnings_count:(profile.warnings_count||0)+1}).eq('id',post.user_id); if(updateError) throw updateError; }
  if (action === 'suspend') { await assertCanRestrictMember(post.user_id,actorRole); const {error}=await adminClient.from('profiles').update({status:'suspended',suspension_reason:reason}).eq('id',post.user_id); if(error) throw error; }
  const { error: actionError } = await adminClient.from('moderation_actions').insert({report_id:reportId,target_type:'feed_post',target_id:postId,action,reason,actor_id:actorId,reversible_until:['hide','remove'].includes(action)?new Date(Date.now()+30*86400000).toISOString():null});
  if (actionError) throw actionError;
  await writeAuditLog({actorId,action:`moderation.${action}`,targetType:'feed_post',targetId:postId,details:{reason,reportId}});
}

async function moderateFeedComment({commentId,action,reason,actorId,actorRole,reportId=null}){
  const {data:comment,error}=await adminClient.from('feed_comments').select('id,user_id').eq('id',commentId).maybeSingle();if(error)throw error;if(!comment)throw Object.assign(new Error('Comment not found.'),{status:404});
  const updates={};if(action==='keep'||action==='restore')Object.assign(updates,{moderation_status:'published',deleted_at:null,deletion_reason:null});if(action==='hide')updates.moderation_status='hidden';if(action==='remove')Object.assign(updates,{moderation_status:'removed',deleted_at:new Date().toISOString(),deletion_reason:reason});
  if(Object.keys(updates).length){const{error:updateError}=await adminClient.from('feed_comments').update(updates).eq('id',commentId);if(updateError)throw updateError;}
  if(action==='warn'){const{data:profile,error:profileError}=await adminClient.from('profiles').select('warnings_count').eq('id',comment.user_id).single();if(profileError)throw profileError;const{error:updateError}=await adminClient.from('profiles').update({warnings_count:(profile.warnings_count||0)+1}).eq('id',comment.user_id);if(updateError)throw updateError;}
  if(action==='suspend'){await assertCanRestrictMember(comment.user_id,actorRole);const{error:suspendError}=await adminClient.from('profiles').update({status:'suspended',suspension_reason:reason}).eq('id',comment.user_id);if(suspendError)throw suspendError;}
  const{error:actionError}=await adminClient.from('moderation_actions').insert({report_id:reportId,target_type:'feed_comment',target_id:commentId,action,reason,actor_id:actorId,reversible_until:['hide','remove'].includes(action)?new Date(Date.now()+30*86400000).toISOString():null});if(actionError)throw actionError;
  await writeAuditLog({actorId,action:`moderation.${action}`,targetType:'feed_comment',targetId:commentId,details:{reason,reportId}});
}

adminRouter.patch('/community-content/:postId/moderate', async (req,res,next) => {
  const action=String(req.body.action||''); const reason=String(req.body.reason||'').trim();
  const allowed=['keep','hide','restore','remove','warn','lock_comments','unlock_comments','disable_reactions','enable_reactions','suspend'];
  if(!allowed.includes(action)) return res.status(400).json({error:'Invalid moderation action.'});
  if(!reason) return res.status(400).json({error:'A reason or internal note is required.'});
  try { await moderateFeedPost({postId:req.params.postId,action,reason,actorId:req.admin.id,actorRole:req.admin.profile.role}); res.json({success:true}); } catch(error){next(error);}
});

adminRouter.delete('/community-content/:postId', async (req,res,next) => {
  const reason=String(req.body?.reason||'Removed by administrator').trim();
  try { await moderateFeedPost({postId:req.params.postId,action:'remove',reason,actorId:req.admin.id,actorRole:req.admin.profile.role}); res.json({success:true,recoverableUntil:new Date(Date.now()+30*86400000).toISOString()}); } catch(error){next(error);}
});

adminRouter.get('/gallery-submissions', async (req, res, next) => {
  try {
    const { data, error } = await adminClient.from('gallery_submissions').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const submissions = await Promise.all((data || []).map(async (item) => {
      const { data: signed } = await adminClient.storage.from('gallery-media').createSignedUrl(item.image_path, 900);
      return { ...item, url: signed?.signedUrl || null };
    }));
    res.json({ submissions });
  } catch (error) { next(error); }
});

adminRouter.patch('/gallery-submissions/:id', async (req, res, next) => {
  const status = String(req.body.status || '').toLowerCase();
  if (!['needs_information','approved','rejected'].includes(status)) return res.status(400).json({ error: 'Choose a valid gallery decision.' });
  const reviewerNote = String(req.body.reviewerNote || '').trim() || null;
  if (status !== 'approved' && !reviewerNote) return res.status(400).json({ error: 'A reviewer note is required for this decision.' });
  try {
    const { data, error } = await adminClient.from('gallery_submissions').update({ status, reviewer_note: reviewerNote, reviewed_by: req.admin.id, reviewed_at: new Date().toISOString(), featured: status === 'approved' && Boolean(req.body.featured) }).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    await writeAuditLog({ actorId: req.admin.id, action: `gallery.${status}`, targetType: 'gallery_submission', targetId: data.id, details: { reviewerNote, featured: data.featured } });
    res.json({ submission: data });
  } catch (error) { next(error); }
});

adminRouter.patch('/gallery-submissions/:id/curate', async(req,res,next)=>{
  const updates={};
  if(typeof req.body.featured==='boolean') updates.featured=req.body.featured;
  if(req.body.featuredRank!==undefined) updates.featured_rank=req.body.featuredRank===''?null:Number(req.body.featuredRank);
  if(req.body.featuredStartsAt!==undefined) updates.featured_starts_at=req.body.featuredStartsAt||null;
  if(req.body.featuredEndsAt!==undefined) updates.featured_ends_at=req.body.featuredEndsAt||null;
  if(req.body.status==='archived') Object.assign(updates,{status:'archived',featured:false,archived_at:new Date().toISOString()});
  if(!Object.keys(updates).length) return res.status(400).json({error:'No curation changes supplied.'});
  try { const {data,error}=await adminClient.from('gallery_submissions').update(updates).eq('id',req.params.id).select('*').single(); if(error)throw error; const action=updates.status==='archived'?'archive':updates.featured?'feature':'unfeature'; await adminClient.from('moderation_actions').insert({target_type:'gallery_submission',target_id:data.id,action,reason:String(req.body.reason||'Gallery curation updated'),actor_id:req.admin.id}); await writeAuditLog({actorId:req.admin.id,action:`gallery.${action}`,targetType:'gallery_submission',targetId:data.id,details:updates}); res.json({submission:data}); } catch(error){next(error);}
});

/* =========================================================
   MEMBERS
========================================================= */

adminRouter.get(
  '/members',
  async (req, res, next) => {
    const page = Math.max(
      Number.parseInt(req.query.page, 10) || 1,
      1
    );

    const pageSize = Math.min(
      Math.max(
        Number.parseInt(req.query.pageSize, 10) || 20,
        1
      ),
      100
    );

    const from = (page - 1) * pageSize;

    let query = adminClient
      .from('profiles')
      .select(
        'id, first_name, last_name, email, role, status, created_at, locked_until, suspension_reason, suspension_expires_at, deactivated_at, account_source, last_active_at, warnings_count',
        {
          count: 'exact',
        }
      )
      .order('created_at', {
        ascending: false,
      })
      .range(
        from,
        from + pageSize - 1
      );

    if (req.query.role) {
      query = query.eq(
        'role',
        String(req.query.role).toLowerCase()
      );
    }

    if (req.query.status) {
      query = query.eq(
        'status',
        String(req.query.status).toLowerCase()
      );
    }

    if (req.query.search) {
      const term = String(req.query.search).replace(
        /[,()%]/g,
        ''
      );

      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`
      );
    }

    try {
      const {
        data,
        count,
        error,
      } = await query;

      if (error) {
        throw error;
      }

      const { data: roleRows, error: rolesError } = data.length
        ? await adminClient.from('profile_roles').select('profile_id, role').in('profile_id', data.map((profile) => profile.id))
        : { data: [], error: null };
      if (rolesError) throw rolesError;
      const rolesByProfile = (roleRows || []).reduce((map, item) => {
        if (!map[item.profile_id]) map[item.profile_id] = [];
        map[item.profile_id].push(item.role.toUpperCase());
        return map;
      }, {});
      const [{data:educationRows,error:educationError},{data:employerRows,error:employerError}]=data.length?await Promise.all([
        adminClient.from('education').select('profile_id,department,course,graduation_year,batch_name').in('profile_id',data.map(x=>x.id)),
        adminClient.from('employer_profiles').select('profile_id,organization,job_title').in('profile_id',data.map(x=>x.id)),
      ]):[{data:[],error:null},{data:[],error:null}];
      if(educationError||employerError)throw educationError||employerError;
      const educationByProfile=(educationRows||[]).reduce((m,x)=>{(m[x.profile_id]??=[]).push(x);return m;},{});
      const employerByProfile=Object.fromEntries((employerRows||[]).map(x=>[x.profile_id,x]));

      /*
       * Get Supabase Auth users so we can determine
       * whether their email has been confirmed.
       */
      const {
        data: authUsersData,
        error: authUsersError,
      } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (authUsersError) {
        throw authUsersError;
      }

      const authUsers = authUsersData?.users || [];

      const authUsersById = new Map(
        authUsers.map((authUser) => [
          authUser.id,
          authUser,
        ])
      );

      const members = data.map((profile) => {
        const authUser = authUsersById.get(
          profile.id
        );

        return {
          id: profile.id,

          name:
            [
              profile.first_name,
              profile.last_name,
            ]
              .filter(Boolean)
              .join(' ') || profile.email,

          email: profile.email,

          role: String(
            profile.role || 'alumni'
          ).toUpperCase(),

          roles: rolesByProfile[profile.id]?.length
            ? rolesByProfile[profile.id]
            : [String(profile.role || 'alumni').toUpperCase()],

          status: String(
            profile.status || 'pending'
          ).replace(/^./, (letter) =>
            letter.toUpperCase()
          ),

          joined: profile.created_at,

          /*
           * This is what Members.jsx uses.
           */
          emailConfirmed:
            Boolean(
              authUser?.email_confirmed_at
            ),
          locked: Boolean(authUser?.banned_until && new Date(authUser.banned_until) > new Date()),
          lastSignInAt: authUser?.last_sign_in_at || null,
          department: educationByProfile[profile.id]?.[0]?.department || '',
          course: educationByProfile[profile.id]?.[0]?.course || '',
          graduationYear: educationByProfile[profile.id]?.[0]?.graduation_year || '',
          batchName: educationByProfile[profile.id]?.[0]?.batch_name || '',
          organization: employerByProfile[profile.id]?.organization || '',
          suspensionExpiresAt: profile.suspension_expires_at,
          deactivated: Boolean(profile.deactivated_at),
          warnings: profile.warnings_count || 0,
        };
      });

      res.json({
        members,
        page,
        pageSize,
        total: count || 0,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   CONFIRM USER EMAIL
========================================================= */

adminRouter.patch(
  '/users/:id/confirm-email',
  sensitiveAdminLimiter,
  requireMemberMutationAuthority,
  async (req, res, next) => {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({
        error: 'User ID is required.',
      });
    }

    try {
      /*
       * First find the Auth user.
       */
      const {
        data: authUsersData,
        error: authUsersError,
      } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (authUsersError) {
        throw authUsersError;
      }

      const authUser = authUsersData.users.find(
        (user) => user.id === userId
      );

      if (!authUser) {
        return res.status(404).json({
          error:
            'The Supabase Auth user could not be found.',
        });
      }

      /*
       * Confirm the user's email using the
       * Supabase service-role key.
       */
      const {
        data: updatedUser,
        error: updateError,
      } = await adminClient.auth.admin.updateUserById(
        userId,
        {
          email_confirm: true,
        }
      );

      if (updateError) {
        throw updateError;
      }

      /*
       * Record the administrative action.
       */
      await writeAuditLog({
        actorId: req.admin.id,
        action: 'user.email_confirmed',
        targetType: 'user',
        targetId: userId,
        details: {
          email: authUser.email,
        },
      });

      return res.json({
        success: true,
        message: 'User email has been confirmed.',
        user: {
          id: updatedUser.user.id,
          email: updatedUser.user.email,
          emailConfirmed:
            Boolean(
              updatedUser.user
                .email_confirmed_at
            ),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   UPDATE MEMBER STATUS
========================================================= */

adminRouter.patch(
  '/members/:id/status',
  sensitiveAdminLimiter,
  requireMemberMutationAuthority,
  async (req, res, next) => {
    const status = String(
      req.body.status || ''
    ).toLowerCase();

    if (
      ![
        'pending',
        'verified',
        'suspended',
      ].includes(status)
    ) {
      return res.status(400).json({
        error:
          'A valid member status is required.',
      });
    }
    if (req.params.id === req.admin.id && status === 'suspended') return res.status(400).json({ error: 'You cannot suspend your own administrator account.' });
    const role = String(req.body.role || '').toLowerCase();
    if (role && !['alumni','employer','staff','admin'].includes(role)) return res.status(400).json({ error: 'Choose a valid member role.' });
    if (role && role !== req.targetMember.role && req.admin.profile.role !== 'admin') {
      return publicError(res, 403, 'SUPER_ADMIN_REQUIRED', 'Only a super administrator can change account roles.');
    }
    const updates = { status };
    for (const field of ['first_name','last_name','email']) if (typeof req.body[field] === 'string') updates[field] = req.body[field].trim();
    if (role) updates.role = role;
    updates.suspension_reason = status === 'suspended' ? String(req.body.suspension_reason || '').trim() || 'Administrative restriction' : null;

    try {
      const {
        data,
        error,
      } = await adminClient
        .from('profiles')
        .update(updates)
        .eq('id', req.params.id)
        .select(
          'id, email, role, status, suspension_reason'
        )
        .single();

      if (error) {
        throw error;
      }

      await writeAuditLog({
        actorId: req.admin.id,
        action:
          'member.status_updated',
        targetType: 'profile',
        targetId: data.id,
        details: {
          status, role: data.role, suspensionReason: data.suspension_reason,
        },
      });

      res.json({
        member: data,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   ALUMNI VERIFICATIONS
========================================================= */

adminRouter.get(
  '/verifications',
  async (req, res, next) => {
    const status = String(
      req.query.status || 'pending'
    ).toLowerCase();

    if (
      ![
        'pending',
        'under_review',
        'needs_information',
        'verified',
        'rejected',
        'expired',
        'all',
      ].includes(status)
    ) {
      return res.status(400).json({
        error:
          'A valid verification status is required.',
      });
    }

    try {
      let query = adminClient
        .from('alumni_verifications')
        .select(
          `
            id,
            user_id,
            graduation_name,
            graduation_year,
            program,
            document_path,
            document_filename,
            status,
            reviewer_note, assigned_to, priority, expires_at, retention_delete_at, document_deleted_at, scan_status, file_size_bytes, mime_type, reviewed_at,
            created_at,
            profiles!alumni_verifications_user_id_fkey(
              first_name,
              last_name,
              email
            )
          `
        )
        .order('created_at', {
          ascending: req.query.sort === 'oldest',
        });

      if (status !== 'all') {
        query = query.eq(
          'status',
          status
        );
      }
      if(req.query.search){const term=String(req.query.search).replace(/[,()%]/g,'');query=/^\d{4}$/.test(term)?query.eq('graduation_year',Number(term)):query.or(`graduation_name.ilike.%${term}%,program.ilike.%${term}%`);}

      const {
        data,
        error,
      } = await query;

      if (error) {
        throw error;
      }

      res.json({
        verifications: (data||[]).map(x=>({...x,submission_age_days:Math.floor((Date.now()-new Date(x.created_at))/86400000)})),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   APPROVE / REJECT ALUMNI VERIFICATION
========================================================= */

adminRouter.patch(
  '/verifications/:id',
  async (req, res, next) => {
    const status = String(
      req.body.status || ''
    ).toLowerCase();

    const reviewerNote =
      typeof req.body.reviewerNote ===
      'string'
        ? req.body.reviewerNote.trim() ||
          null
        : null;

    if (
      ![
        'under_review',
        'needs_information',
        'verified',
        'rejected',
      ].includes(status)
    ) {
      return res.status(400).json({
        error:
          'Choose a valid verification decision.',
      });
    }

    if(['needs_information','rejected'].includes(status)&&!reviewerNote)return res.status(400).json({error:'A decision reason is required.'});
    if(status==='verified'&&!['name','program','year','readable','authentic'].every(key=>req.body.checks?.[key]))return res.status(400).json({error:'Complete every approval safeguard before verifying.'});
    try {
      const {
        data: verification,
        error: verificationError,
      } = await adminClient
        .from('alumni_verifications')
        .update({
          status,
          reviewer_note:
            reviewerNote,
          reviewed_by: req.admin.id,
          reviewed_at:
            new Date().toISOString(),
          assigned_to:req.admin.id,
          retention_delete_at:status==='verified'?new Date(Date.now()+(Number(req.body.retentionDays)||30)*86400000).toISOString():null,
        })
        .eq('id', req.params.id)
        .select(
          'id, user_id, status'
        )
        .single();

      if (verificationError) {
        throw verificationError;
      }

      const messages={under_review:['Verification under review','An alumni officer has started reviewing your submission.'],needs_information:['More information required',reviewerNote],verified:['Alumni verification approved','Your alumni account has been verified.'],rejected:['Verification was not approved',reviewerNote]};
      if(messages[status])await adminClient.from('account_notifications').insert({recipient_id:verification.user_id,kind:`verification_${status}`,subject:messages[status][0],message:messages[status][1]});

      /*
       * If alumni verification is approved,
       * also mark the profile as verified.
       */
      if (status === 'verified') {
        const {
          error: profileError,
        } = await adminClient
          .from('profiles')
          .update({
            status: 'verified',
          })
          .eq(
            'id',
            verification.user_id
          );

        if (profileError) {
          throw profileError;
        }
      }

      await writeAuditLog({
        actorId: req.admin.id,
        action:
          `alumni_verification.${status}`,
        targetType:
          'alumni_verification',
        targetId: verification.id,
        details: {
          reviewerNote,checks:req.body.checks||null,
        },
      });

      res.json({
        verification,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   VERIFICATION DOCUMENT
========================================================= */

adminRouter.get(
  '/verifications/:id/document',
  async (req, res, next) => {
    try {
      const {
        data: verification,
        error,
      } = await adminClient
        .from('alumni_verifications')
        .select('document_path')
        .eq(
          'id',
          req.params.id
        )
        .single();

      if (error) {
        throw error;
      }

      const {
        data,
        error: signedUrlError,
      } = await adminClient.storage
        .from(
          'verification-documents'
        )
        .createSignedUrl(
          verification.document_path,
          60
        );

      if (signedUrlError) {
        throw signedUrlError;
      }
      await adminClient.from('verification_document_accesses').insert({verification_id:req.params.id,accessed_by:req.admin.id,action:'view'});

      res.json({
        url: data.signedUrl,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   SETTINGS
========================================================= */

adminRouter.get(
  '/settings',
  async (req, res, next) => {
    try {
      const {
        data,
        error,
      } = await adminClient
        .from('system_settings')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) {
        throw error;
      }

      res.json({
        settings: data,
      });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.put(
  '/settings',
  sensitiveAdminLimiter,
  validateBody(settingsUpdateSchema),
  async (req, res, next) => {
    if (req.admin.profile.role !== 'admin') {
      return publicError(res, 403, 'SUPER_ADMIN_REQUIRED', 'Super administrator access is required.');
    }
    const allowedFields = [
      'institution_name',
      'contact_email',
      'allow_open_signups',
      'verify_domain',
      'session_timeout_minutes',
      'require_admin_mfa',
      'content_retention_days',
      'maintenance_mode',
      'approved_email_domains','captcha_provider','captcha_enabled','upload_max_mb','allowed_file_types','verification_document_retention_days','moderation_reasons','rate_limit_per_minute','email_templates',
    ];

    const updates = Object.fromEntries(
      Object.entries(req.body).filter(
        ([key]) =>
          allowedFields.includes(key)
      )
    );

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        error:
          'No editable settings were supplied.',
      });
    }

    try {
      const {
        data,
        error,
      } = await adminClient
        .from('system_settings')
        .update({
          ...updates,
          updated_at:
            new Date().toISOString(),
          updated_by: req.admin.id,
        })
        .eq('id', 1)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      await writeAuditLog({
        actorId: req.admin.id,
        action:
          'settings.updated',
        targetType:
          'system_settings',
        targetId: '1',
        details: updates,
      });

      settingsCache = { value: { ...DEFAULT_SETTINGS, ...data }, expiresAt: Date.now() + 30_000 };

      res.json({
        settings: data,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   ADMIN RESOURCES
========================================================= */

adminRouter.get('/opportunities', async (req, res, next) => {
  try {
    const { data, error } = await adminClient
      .from('opportunities')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ opportunities: data || [] });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch('/opportunities/:id', async (req, res, next) => {
  const body = req.body || {};
  const editableFields = ['title','company_name','location','category','description','requirements','employment_type','work_arrangement','salary_range','reviewer_note','required_experience','required_course','required_department','contact_person','contact_email','application_url','industry'];
  const updates = Object.fromEntries(editableFields.filter((field) => typeof body[field] === 'string').map((field) => [field, body[field].trim()]));
  if (body.status !== undefined) {
    if (!['draft','submitted','under_review','needs_changes','approved','published','active','paused','expired','archived','rejected'].includes(body.status)) return res.status(400).json({ error: 'Choose a valid opportunity status.' });
    if (['needs_changes','rejected'].includes(body.status) && !String(body.reviewer_note||'').trim()) return res.status(400).json({ error: 'A reviewer note is required for this decision.' });
    updates.status = body.status;
    updates.reviewed_by = req.admin.id;
    updates.reviewed_at = new Date().toISOString();
    if(['published','active'].includes(body.status))updates.published_at=new Date().toISOString();
  }
  if (body.application_deadline !== undefined) updates.application_deadline = body.application_deadline || null;
  if (body.featured !== undefined) updates.featured = Boolean(body.featured);
  if(body.openings!==undefined)updates.openings=body.openings?Number(body.openings):null;
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Provide at least one valid opportunity field.' });
  try {
    const { data, error } = await adminClient
      .from('opportunities')
      .update(updates)
      .eq('id', req.params.id)
      .select('id, title, status')
      .single();
    if (error) throw error;
    await writeAuditLog({ actorId: req.admin.id, action: updates.status ? `opportunity.${updates.status}` : 'opportunity.updated', targetType: 'opportunity', targetId: data.id, details: { title: data.title, fields: Object.keys(updates) } });
    res.json({ opportunity: data });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/events/:id/interests', async (req, res, next) => {
  try {
    const { data, error } = await adminClient
      .from('event_interests')
      .select('user_id, created_at, profiles!event_interests_user_id_fkey(first_name, last_name, email)')
      .eq('event_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ interests: (data || []).map((item) => ({ user_id: item.user_id, created_at: item.created_at, name: [item.profiles?.first_name, item.profiles?.last_name].filter(Boolean).join(' ') || 'Alumni', email: item.profiles?.email || '' })) });
  } catch (error) {
    next(error);
  }
});

const resourceTypes = new Set([
  'jobs',
  'events',
  'news',
  'reports',
  'surveys',
]);

function validResourceType(
  req,
  res,
  next
) {
  if (
    !resourceTypes.has(
      req.params.type
    )
  ) {
    return res.status(404).json({
      error:
        'Unknown admin resource.',
    });
  }

  return next();
}

adminRouter.get(
  '/resources/:type',
  validResourceType,
  async (req, res, next) => {
    try {
      const {
        data,
        error,
      } = await adminClient
        .from('admin_resources')
        .select('*')
        .eq(
          'resource_type',
          req.params.type
        )
        .order('created_at', {
          ascending: false,
        });

      if (error) {
        throw error;
      }

      res.json({
        resources: data,
      });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.post(
  '/resources/:type',
  validResourceType,
  async (req, res, next) => {
    if (
      !req.body ||
      typeof req.body !==
        'object' ||
      Array.isArray(req.body)
    ) {
      return res.status(400).json({
        error:
          'A JSON resource payload is required.',
      });
    }

    try {
      const payload = req.params.type === 'events'
        ? normalizeEventPayload(req.body)
        : { ...req.body };

      const {
        data,
        error,
      } = await adminClient
        .from('admin_resources')
        .insert({
          resource_type:
            req.params.type,
          payload: payload,
          created_by:
            req.admin.id,
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      await writeAuditLog({
        actorId: req.admin.id,
        action:
          `${req.params.type}.created`,
        targetType:
          req.params.type,
        targetId: data.id,
        details: req.body,
      });

      res.status(201).json({
        resource: data,
      });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.patch(
  '/resources/:type/:id',
  validResourceType,
  async (req, res, next) => {
    if (
      !req.body ||
      typeof req.body !==
        'object' ||
      Array.isArray(req.body)
    ) {
      return res.status(400).json({
        error:
          'A JSON resource payload is required.',
      });
    }

    try {
      const payload = req.params.type === 'events'
        ? normalizeEventPayload(req.body)
        : { ...req.body };

      const {
        data,
        error,
      } = await adminClient
        .from('admin_resources')
        .update({
          payload: payload,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          req.params.id
        )
        .eq(
          'resource_type',
          req.params.type
        )
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      await writeAuditLog({
        actorId: req.admin.id,
        action:
          `${req.params.type}.updated`,
        targetType:
          req.params.type,
        targetId: data.id,
        details: req.body,
      });

      res.json({
        resource: data,
      });
    } catch (error) {
      next(error);
    }
  }
);

adminRouter.delete(
  '/resources/:type/:id',
  validResourceType,
  async (req, res, next) => {
    try {
      if (req.params.type === 'events') {
        try {
          await adminClient
            .from('event_interests')
            .delete()
            .eq('event_id', req.params.id);
        } catch (interestError) {
          console.warn('Unable to clear event interests before deletion:', interestError.message);
        }
      }

      const { error } = await adminClient
        .from('admin_resources')
        .delete()
        .eq('id', req.params.id)
        .eq('resource_type', req.params.type);

      if (error) {
        throw error;
      }

      await writeAuditLog({
        actorId: req.admin.id,
        action: `${req.params.type}.deleted`,
        targetType: req.params.type,
        targetId: req.params.id,
        details: { deleted: true },
      });

      res.json({ success: true, deletedId: req.params.id });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   AUDIT LOGS
========================================================= */

adminRouter.get('/attention', async (req, res, next) => {
  const count = async (table, configure) => {
    const { count: total, error } = await runSupabaseQuery(configure(adminClient.from(table).select('*',{count:'exact',head:true})));
    if (error) throw error; return total || 0;
  };
  try {
    const now = new Date().toISOString();
    const [verifications,gallery,reports,opportunities,locked,eventRows] = await Promise.all([
      count('alumni_verifications',q=>q.in('status',['pending','needs_information'])),
      count('gallery_submissions',q=>q.in('status',['pending','needs_information'])),
      count('content_reports',q=>q.in('status',['open','under_review'])),
      count('opportunities',q=>q.in('status',['submitted','under_review','needs_changes'])),
      count('profiles',q=>q.or(`status.eq.suspended,locked_until.gt.${now}`)),
      runSupabaseQuery(adminClient.from('admin_resources').select('id,payload').eq('resource_type','events')),
    ]);
    if(eventRows.error)throw eventRows.error;
    const incompleteEvents=(eventRows.data||[]).filter(x=>!x.payload?.location||!(x.payload?.image_url||x.payload?.imageUrl)).length;
    res.json({items:[
      {key:'verifications',label:'Alumni verifications',count:verifications,page:'Alumni Verification',tone:'warning'},
      {key:'gallery',label:'Gallery submissions',count:gallery,page:'Social & News',tone:'warning'},
      {key:'reports',label:'Content reports',count:reports,page:'Social & News',tone:'danger'},
      {key:'opportunities',label:'Opportunity reviews',count:opportunities,page:'Opportunities & Events',tone:'warning'},
      {key:'accounts',label:'Restricted accounts',count:locked,page:'Members',tone:'neutral'},
      {key:'events',label:'Events missing details',count:incompleteEvents,page:'Opportunities & Events',tone:'warning'},
    ]});
  } catch(error){ next(error); }
});

adminRouter.post('/opportunities/:id/duplicate',async(req,res,next)=>{try{const{data:source,error}=await adminClient.from('opportunities').select('*').eq('id',req.params.id).single();if(error)throw error;delete source.id;delete source.created_at;Object.assign(source,{title:`${source.title} (Copy)`,status:'draft',reviewed_by:null,reviewed_at:null,published_at:null,featured:false});const{data,error:insertError}=await adminClient.from('opportunities').insert(source).select('*').single();if(insertError)throw insertError;await writeAuditLog({actorId:req.admin.id,action:'opportunity.duplicated',targetType:'opportunity',targetId:data.id,details:{sourceId:req.params.id}});res.status(201).json({opportunity:data});}catch(error){next(error);}});
adminRouter.post('/opportunities/:id/report-employer',async(req,res,next)=>{const reason=String(req.body.reason||'').trim();if(!reason)return res.status(400).json({error:'A fraud concern is required.'});try{const{data,error}=await adminClient.from('opportunities').update({status:'paused',fraud_reported_at:new Date().toISOString(),reviewer_note:reason}).eq('id',req.params.id).select('id,user_id').single();if(error)throw error;await adminClient.from('content_reports').insert({reporter_id:req.admin.id,target_type:'member',target_id:data.user_id,reason:'scam',details:reason});await writeAuditLog({actorId:req.admin.id,action:'opportunity.employer_reported',targetType:'opportunity',targetId:data.id,details:{reason}});res.json({success:true});}catch(error){next(error);}});
adminRouter.get('/opportunity-analytics',async(req,res,next)=>{try{const[{data:items,error},{data:responses,error:responseError}]=await Promise.all([adminClient.from('opportunities').select('id,industry,required_course,view_count,user_id,status'),adminClient.from('opportunity_applications').select('opportunity_id,response')]);if(error||responseError)throw error||responseError;const byId=(responses||[]).reduce((m,x)=>{const row=m[x.opportunity_id]??={interested:0,applied:0};row[x.response]=(row[x.response]||0)+1;return m;},{});const totalViews=(items||[]).reduce((n,x)=>n+(x.view_count||0),0),applications=(responses||[]).filter(x=>x.response==='applied').length;res.json({summary:{views:totalViews,interested:(responses||[]).filter(x=>x.response==='interested').length,applications,conversion:totalViews?Math.round(applications/totalViews*1000)/10:0},industries:(items||[]).reduce((m,x)=>({...m,[x.industry||'Unspecified']:(m[x.industry||'Unspecified']||0)+1}),{}),courses:(items||[]).reduce((m,x)=>({...m,[x.required_course||'Any course']:(m[x.required_course||'Any course']||0)+1}),{}),performance:(items||[]).map(x=>({id:x.id,views:x.view_count||0,...(byId[x.id]||{interested:0,applied:0})}))});}catch(error){next(error);}});

adminRouter.get('/system-health',async(req,res,next)=>{try{const configured=Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);const checks=[{key:'database',label:'Database',status:configured?'operational':'configuration_required'},{key:'email',label:'Authentication email',status:configured?'configured':'configuration_required'},{key:'storage',label:'File storage',status:configured?'configured':'configuration_required'},{key:'giphy',label:'GIF provider',status:process.env.GIPHY_API_KEY?'configured':'optional_not_configured'}];const{data,error}=await adminClient.from('system_incidents').select('id,service,summary,created_at').is('resolved_at',null).order('created_at',{ascending:false}).limit(8);if(error)throw error;res.json({checkedAt:new Date().toISOString(),checks,incidents:[...checks.filter(x=>x.status==='configuration_required'),...(data||[])]});}catch(error){next(error);}});

adminRouter.get('/analytics', async (req,res,next) => {
  try {
    const sinceDays = Math.min(Math.max(Number(req.query.days)||30,7),365);
    const since = new Date(Date.now()-sinceDays*86400000).toISOString();
    const previousSince = new Date(Date.now()-sinceDays*2*86400000).toISOString();
    const [profiles,verifications,posts,reports,registrations,applications,comments,gallery,education] = await Promise.all([
      runSupabaseQuery(adminClient.from('profiles').select('id,role,status,created_at').gte('created_at',previousSince)),
      runSupabaseQuery(adminClient.from('alumni_verifications').select('status,created_at,reviewed_at').gte('created_at',since)),
      runSupabaseQuery(adminClient.from('feed_posts').select('id,user_id,created_at').gte('created_at',since)),
      runSupabaseQuery(adminClient.from('content_reports').select('status,created_at,resolved_at').gte('created_at',since)),
      runSupabaseQuery(adminClient.from('event_registrations').select('status,created_at').gte('created_at',since)),
      runSupabaseQuery(adminClient.from('opportunity_applications').select('response,created_at').gte('created_at',since)),
      runSupabaseQuery(adminClient.from('feed_comments').select('id,user_id,created_at').gte('created_at',since)),
      runSupabaseQuery(adminClient.from('gallery_submissions').select('status,created_at,reviewed_at').gte('created_at',since)),
      runSupabaseQuery(adminClient.from('education').select('profile_id,department,course,graduation_year,batch_name')),
    ]);
    const failed=[profiles,verifications,posts,reports,registrations,applications,comments,gallery,education].find(x=>x.error); if(failed) throw failed.error;
    const averageHours=(rows,end)=>{const done=rows.filter(x=>x[end]);return done.length?Math.round(done.reduce((n,x)=>n+(new Date(x[end])-new Date(x.created_at))/3600000,0)/done.length*10)/10:0;};
    const group=(rows,key)=>rows.reduce((a,x)=>{const k=x[key]||'unknown';a[k]=(a[k]||0)+1;return a;},{});
    const currentProfiles=profiles.data.filter(x=>x.created_at>=since);const previousProfiles=profiles.data.filter(x=>x.created_at<since);const trend=(current,previous)=>previous?Math.round((current-previous)/previous*1000)/10:current?100:0;const timeline=Array.from({length:Math.min(sinceDays,30)},(_,index)=>{const day=new Date(Date.now()-(Math.min(sinceDays,30)-1-index)*86400000).toISOString().slice(0,10);return{day,registrations:currentProfiles.filter(x=>x.created_at.slice(0,10)===day).length,posts:posts.data.filter(x=>x.created_at.slice(0,10)===day).length};});
    const threshold=Math.max(Number(req.query.privacyThreshold)||3,1);const suppress=obj=>Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,v<threshold?null:v]));const verifiedCount=verifications.data.filter(x=>x.status==='verified').length;const reviewedCount=verifications.data.filter(x=>['verified','rejected'].includes(x.status)).length;const galleryReviewed=gallery.data.filter(x=>['approved','rejected'].includes(x.status));
    res.json({days:sinceDays,privacyThreshold:threshold,definitions:{registrations:'Accounts created during the selected period.',verificationRate:'Verified decisions divided by all final verification decisions.',monthlyActive:'Distinct members who posted or commented during the period.',conversion:'Applied responses divided by opportunity views.',moderationHours:'Average hours from report creation to resolution.'},metrics:{registrations:currentProfiles.length,verified:verifiedCount,verificationRate:reviewedCount?Math.round(verifiedCount/reviewedCount*1000)/10:0,posts:posts.data.length,comments:comments.data.length,monthlyActive:new Set([...posts.data.map(x=>x.user_id),...comments.data.map(x=>x.user_id)]).size,galleryApprovalRate:galleryReviewed.length?Math.round(galleryReviewed.filter(x=>x.status==='approved').length/galleryReviewed.length*1000)/10:0,reports:reports.data.length,eventRegistrations:registrations.data.filter(x=>x.status!=='cancelled').length,eventAttendance:registrations.data.filter(x=>x.status==='attended').length,applications:applications.data.filter(x=>x.response==='applied').length,employerParticipation:currentProfiles.filter(x=>x.role==='employer').length,suspensions:currentProfiles.filter(x=>x.status==='suspended').length,verificationHours:averageHours(verifications.data,'reviewed_at'),moderationHours:averageHours(reports.data,'resolved_at')},trends:{registrations:trend(currentProfiles.length,previousProfiles.length)},timeline,breakdowns:{verification:suppress(group(verifications.data,'status')),reports:suppress(group(reports.data,'status')),attendance:suppress(group(registrations.data,'status')),opportunities:suppress(group(applications.data,'response')),departments:suppress(group(education.data,'department')),courses:suppress(group(education.data,'course')),batches:suppress(group(education.data,'batch_name'))}});
  } catch(error){next(error);}
});

adminRouter.get('/moderation/reports', async(req,res,next)=>{
  try { const status=String(req.query.status||'open'); let q=adminClient.from('content_reports').select('*, profiles!content_reports_reporter_id_fkey(first_name,last_name,email)').order('created_at',{ascending:false}).limit(100); if(status!=='all') q=q.eq('status',status); const {data,error}=await q;if(error)throw error;const reports=await Promise.all((data||[]).map(async report=>{let target=null;if(report.target_type==='feed_post'){const r=await adminClient.from('feed_posts').select('author_name,content,media_path,moderation_status').eq('id',report.target_id).maybeSingle();target=r.data;}if(report.target_type==='feed_comment'){const r=await adminClient.from('feed_comments').select('author_name,content,post_id,moderation_status').eq('id',report.target_id).maybeSingle();target=r.data;}return{...report,target};}));res.json({reports}); } catch(error){next(error);}
});

adminRouter.patch('/moderation/reports/:id', async(req,res,next)=>{
  const status=String(req.body.status||''); const action=String(req.body.action||'keep'); const reason=String(req.body.reason||'').trim();
  if(!['under_review','resolved','dismissed'].includes(status)||!['keep','hide','restore','remove','warn','lock_comments','unlock_comments','disable_reactions','enable_reactions','suspend','escalate'].includes(action)) return res.status(400).json({error:'Invalid moderation decision.'});
  if(!reason) return res.status(400).json({error:'A moderation reason is required.'});
  try { const {data:report,error}=await adminClient.from('content_reports').update({status,resolution:reason,resolved_by:status==='under_review'?null:req.admin.id,resolved_at:status==='under_review'?null:new Date().toISOString(),assigned_to:req.admin.id}).eq('id',req.params.id).select('*').single();if(error)throw error;
    if(report.target_type==='feed_post' && action!=='escalate') await moderateFeedPost({postId:report.target_id,action,reason,actorId:req.admin.id,actorRole:req.admin.profile.role,reportId:report.id});
    else if(report.target_type==='feed_comment' && action!=='escalate') await moderateFeedComment({commentId:report.target_id,action,reason,actorId:req.admin.id,actorRole:req.admin.profile.role,reportId:report.id});
    else { await adminClient.from('moderation_actions').insert({report_id:report.id,target_type:report.target_type,target_id:report.target_id,action,reason,actor_id:req.admin.id,reversible_until:['hide','remove'].includes(action)?new Date(Date.now()+30*86400000).toISOString():null}); await writeAuditLog({actorId:req.admin.id,action:`moderation.${action}`,targetType:report.target_type,targetId:report.target_id,details:{reason,reportId:report.id}}); }
    res.json({report}); } catch(error){next(error);}
});

adminRouter.get('/moderation/summary',async(req,res,next)=>{
  const count=async(table,configure=q=>q)=>{const {count:errorCount,error}=await runSupabaseQuery(configure(adminClient.from(table).select('*',{count:'exact',head:true})));if(error)throw error;return errorCount||0;};
  try { const today=new Date();today.setHours(0,0,0,0); const since=today.toISOString(); const [waiting,reports,approvedToday,needsChanges,hidden,featured,repeatOffenders,resolved] = await Promise.all([
    count('gallery_submissions',q=>q.eq('status','pending')),count('content_reports',q=>q.in('status',['open','under_review'])),count('gallery_submissions',q=>q.eq('status','approved').gte('reviewed_at',since)),count('gallery_submissions',q=>q.eq('status','needs_information')),count('feed_posts',q=>q.eq('moderation_status','hidden')),count('gallery_submissions',q=>q.eq('featured',true).eq('status','approved')),count('profiles',q=>q.gte('warnings_count',2)),runSupabaseQuery(adminClient.from('content_reports').select('created_at,resolved_at').not('resolved_at','is',null).limit(500))]);
    if(resolved.error)throw resolved.error; const avg=resolved.data.length?Math.round(resolved.data.reduce((sum,x)=>sum+(new Date(x.resolved_at)-new Date(x.created_at))/3600000,0)/resolved.data.length*10)/10:0;
    res.json({metrics:{waiting,reports,approvedToday,needsChanges,hidden,featured,averageReviewHours:avg,repeatOffenders}});
  }catch(error){next(error);}
});

adminRouter.get('/moderation/trash',async(req,res,next)=>{try{const {data,error}=await adminClient.from('feed_posts').select('id,user_id,author_name,content,media_path,created_at,deleted_at,deletion_reason').eq('moderation_status','removed').order('deleted_at',{ascending:false}).limit(100);if(error)throw error;res.json({items:data||[]});}catch(error){next(error);}});
adminRouter.patch('/moderation/trash/:id/restore',async(req,res,next)=>{const reason=String(req.body.reason||'Restored from trash').trim();try{await moderateFeedPost({postId:req.params.id,action:'restore',reason,actorId:req.admin.id,actorRole:req.admin.profile.role});res.json({success:true});}catch(error){next(error);}});
adminRouter.get('/moderation/history',async(req,res,next)=>{try{let q=adminClient.from('moderation_actions').select('*,profiles!moderation_actions_actor_id_fkey(first_name,last_name,email)').order('created_at',{ascending:false}).limit(200);if(req.query.action&&req.query.action!=='all')q=q.eq('action',String(req.query.action));if(req.query.targetType&&req.query.targetType!=='all')q=q.eq('target_type',String(req.query.targetType));const{data,error}=await q;if(error)throw error;res.json({actions:data||[]});}catch(error){next(error);}});

adminRouter.get('/events/:id/registrations',async(req,res,next)=>{try{const {data,error}=await adminClient.from('event_registrations').select('*, profiles!event_registrations_user_id_fkey(first_name,last_name,email)').eq('event_id',req.params.id).order('created_at',{ascending:false});if(error)throw error;res.json({registrations:data||[]});}catch(error){next(error);}});
adminRouter.patch('/events/:eventId/registrations/:id',async(req,res,next)=>{const status=String(req.body.status||'');if(!['registered','waitlisted','cancelled','attended','no_show'].includes(status))return res.status(400).json({error:'Invalid attendance status.'});try{const {data,error}=await adminClient.from('event_registrations').update({status,checked_in_at:status==='attended'?new Date().toISOString():null,checked_in_by:status==='attended'?req.admin.id:null}).eq('id',req.params.id).eq('event_id',req.params.eventId).select('*').single();if(error)throw error;await writeAuditLog({actorId:req.admin.id,action:`event_registration.${status}`,targetType:'event_registration',targetId:data.id});res.json({registration:data});}catch(error){next(error);}});
adminRouter.post('/events/:id/check-in',sensitiveAdminLimiter,async(req,res,next)=>{const token=String(req.body?.qrToken||'').trim();if(!/^[a-f0-9]{32}$/i.test(token))return publicError(res,400,'INVALID_CHECK_IN_TOKEN','The check-in code is invalid.');try{const{data,error}=await adminClient.from('event_registrations').update({status:'attended',checked_in_at:new Date().toISOString(),checked_in_by:req.admin.id}).eq('event_id',req.params.id).eq('qr_token',token).select('*').single();if(error)throw error;await writeAuditLog({actorId:req.admin.id,action:'event.qr_check_in',targetType:'event_registration',targetId:data.id});res.json({registration:data});}catch(error){next(error);}});
adminRouter.post('/events/:id/duplicate',async(req,res,next)=>{try{const{data:source,error}=await adminClient.from('admin_resources').select('*').eq('id',req.params.id).eq('resource_type','events').single();if(error)throw error;const payload={...source.payload,title:`${source.payload.title} (Copy)`,status:'draft',date:'',endDate:'',publishedAt:null};const{data,error:insertError}=await adminClient.from('admin_resources').insert({resource_type:'events',payload,created_by:req.admin.id}).select('*').single();if(insertError)throw insertError;await writeAuditLog({actorId:req.admin.id,action:'event.duplicated',targetType:'event',targetId:data.id,details:{sourceId:req.params.id}});res.status(201).json({event:data});}catch(error){next(error);}});
adminRouter.post('/events/:id/reminders',sensitiveAdminLimiter,async(req,res,next)=>{try{const{data,error}=await adminClient.from('event_registrations').select('id,user_id').eq('event_id',req.params.id).in('status',['registered','waitlisted']);if(error)throw error;if(data.length){await adminClient.from('account_notifications').insert(data.map(x=>({recipient_id:x.user_id,kind:'event_reminder',subject:'Upcoming alumni event',message:'Reminder: an event you registered for is coming up.'})));await adminClient.from('event_registrations').update({reminder_sent_at:new Date().toISOString()}).in('id',data.map(x=>x.id));}await writeAuditLog({actorId:req.admin.id,action:'event.reminders_sent',targetType:'event',targetId:req.params.id,details:{recipients:data.length}});res.json({sent:data.length});}catch(error){next(error);}});

adminRouter.get('/permissions',async(req,res,next)=>{try{const {data,error}=await adminClient.from('admin_permissions').select('*, profiles(first_name,last_name,email,role)');if(error)throw error;res.json({permissions:data||[]});}catch(error){next(error);}});
adminRouter.put('/permissions/:profileId',sensitiveAdminLimiter,async(req,res,next)=>{if(req.admin.profile.role!=='admin')return res.status(403).json({error:'Super administrator access is required.'});const allowed=['dashboard','members','verification','opportunities','events','moderation','gallery','analytics','settings'];const templates={super_admin:allowed,alumni_officer:['dashboard','members','verification'],content_moderator:['dashboard','moderation','gallery'],career_officer:['dashboard','opportunities'],events_officer:['dashboard','events'],analyst:['dashboard','analytics']};const adminRole=String(req.body?.adminRole||'analyst');if(!templates[adminRole])return res.status(400).json({error:'Choose a valid administrative role.'});if(req.body?.scopes!==undefined&&!Array.isArray(req.body.scopes))return publicError(res,400,'INVALID_SCOPES','Permission scopes must be a list.');const scopes=[...new Set((req.body?.scopes||templates[adminRole]).map(String).filter(x=>allowed.includes(x)))];try{const {data,error}=await adminClient.from('admin_permissions').upsert({profile_id:req.params.profileId,scopes,admin_role:adminRole,updated_by:req.admin.id,updated_at:new Date().toISOString()}).select('*').single();if(error)throw error;await writeAuditLog({actorId:req.admin.id,action:'permissions.updated',targetType:'profile',targetId:req.params.profileId,details:{adminRole,scopes}});res.json({permission:data});}catch(error){next(error);}});

adminRouter.get(
  '/audit-logs',
  async (req, res, next) => {
    try {
      const {
        data,
        error,
      } = await adminClient
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', {
          ascending: false,
        })
        .limit(100);

      if (error) {
        throw error;
      }

      res.json({
        logs: data,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   MOUNT ADMIN ROUTER
========================================================= */

app.use(
  '/api/admin',
  adminRouter
);

app.get('/api/gifs', async (req, res, next) => {
  try {
    if (!giphyApiKey) return publicError(res, 503, 'GIFS_NOT_CONFIGURED', 'GIF search is not configured. Add GIPHY_API_KEY to server/.env and restart the server.');
    const parsed = z.object({ q: z.string().trim().max(80).optional() }).safeParse(req.query);
    if (!parsed.success) return publicError(res, 400, 'INVALID_GIF_QUERY', 'GIF search must be 80 characters or fewer.');
    const query = parsed.data.q;
    const endpoint = query ? 'search' : 'trending';
    const params = new URLSearchParams({ api_key: giphyApiKey, limit: '12', rating: 'g' });
    if (query) params.set('q', query);
    const response = await fetch(`https://api.giphy.com/v1/gifs/${endpoint}?${params}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return publicError(res, 502, 'GIF_PROVIDER_ERROR', 'GIFs are temporarily unavailable.');
    res.json({ gifs: Array.isArray(payload.data) ? payload.data : [] });
  } catch (_error) {
    return publicError(res, 502, 'GIF_PROVIDER_ERROR', 'GIFs are temporarily unavailable. Please try again.');
  }
});

app.use('/api', (_req, res) => publicError(res, 404, 'API_NOT_FOUND', 'API endpoint not found.'));

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (error, req, res, next) => {
    console.error(error);
    if(adminClient&&(error.status||500)>=500){adminClient.from('system_incidents').insert({service:'api',summary:`${req.method} ${req.path} failed`,details:'An internal request failed. Review protected server logs for diagnostic details.'}).then(({error:logError})=>{if(logError)console.warn('Could not record system incident:',logError.message);});}

    res.status(error.status || 500).json({
      error: error.publicMessage ||
        'The server could not complete this request.',
    });
  }
);

adminRouter.post('/members', sensitiveAdminLimiter, validateBody(memberCreateSchema), async (req, res, next) => {
  const firstName = String(req.body.first_name || '').trim();
  const lastName = String(req.body.last_name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = String(req.body.role || 'alumni').toLowerCase();
  const status = String(req.body.status || 'pending').toLowerCase();
  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ error: 'First name, last name, a valid email, and a password of at least 8 characters are required.' });
  if (!['alumni','employer','staff','admin'].includes(role) || !['pending','verified','suspended'].includes(status)) return res.status(400).json({ error: 'Invalid role or account status.' });
  if (['staff', 'admin'].includes(role) && req.admin.profile.role !== 'admin') return publicError(res, 403, 'SUPER_ADMIN_REQUIRED', 'Only a super administrator can create privileged accounts.');
  let createdUser;
  try {
    const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: Boolean(req.body.email_confirmed), user_metadata: { first_name: firstName, last_name: lastName } });
    if (error) throw error;
    createdUser = data.user;
    const { error: profileError } = await adminClient.from('profiles').upsert({ id: createdUser.id, first_name: firstName, last_name: lastName, email, role, status, account_source:'admin_created' });
    if (profileError) throw profileError;
    await adminClient.from('profile_roles').upsert({profile_id:createdUser.id,role});
    await writeAuditLog({ actorId: req.admin.id, action: 'member.created', targetType: 'profile', targetId: createdUser.id, details: { email, role, status } });
    res.status(201).json({ id: createdUser.id });
  } catch (error) { if (createdUser?.id) await adminClient.auth.admin.deleteUser(createdUser.id); next(error); }
});

adminRouter.get('/members/:id', async (req, res, next) => {
  try {
    const [{ data: profile, error }, { data: education }, { data: verification }, { data: authData, error: authError },{data:roles},{data:employer},{data:verificationHistory},{count:posts},{count:comments},{count:eventRegistrations},{count:opportunities},{data:moderationHistory}] = await Promise.all([
      adminClient.from('profiles').select('*').eq('id', req.params.id).maybeSingle(),
      adminClient.from('education').select('*').eq('profile_id', req.params.id).order('created_at'),
      adminClient.from('alumni_verifications').select('id, graduation_name, graduation_year, graduation_date, batch_name, program, document_filename, status, reviewer_note, created_at, reviewed_at').eq('user_id', req.params.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      adminClient.auth.admin.getUserById(req.params.id),
      adminClient.from('profile_roles').select('role').eq('profile_id',req.params.id),
      adminClient.from('employer_profiles').select('*').eq('profile_id',req.params.id).maybeSingle(),
      adminClient.from('alumni_verifications').select('id,status,reviewer_note,created_at,reviewed_at').eq('user_id',req.params.id).order('created_at',{ascending:false}),
      adminClient.from('feed_posts').select('*',{count:'exact',head:true}).eq('user_id',req.params.id),
      adminClient.from('feed_comments').select('*',{count:'exact',head:true}).eq('user_id',req.params.id),
      adminClient.from('event_registrations').select('*',{count:'exact',head:true}).eq('user_id',req.params.id),
      adminClient.from('opportunities').select('*',{count:'exact',head:true}).eq('user_id',req.params.id),
      adminClient.from('moderation_actions').select('action,reason,created_at').eq('target_type','member').eq('target_id',req.params.id).order('created_at',{ascending:false}).limit(20),
    ]);
    if (error || authError) throw error || authError;
    if (!profile) return res.status(404).json({ error: 'Member not found.' });
    const authUser = authData.user;
    res.json({ member: { ...profile, roles:(roles||[]).map(x=>x.role), education: education || [], employer:employer||null, verification: verification || null, verification_history:verificationHistory||[], activity:{posts:posts||0,comments:comments||0,events:eventRegistrations||0,opportunities:opportunities||0}, moderation_history:moderationHistory||[], email_confirmed: Boolean(authUser.email_confirmed_at), locked: Boolean(authUser.banned_until && new Date(authUser.banned_until) > new Date()), last_sign_in_at: authUser.last_sign_in_at, account_source:profile.account_source||authUser.app_metadata?.provider||'self_registration' } });
  } catch (error) { next(error); }
});

adminRouter.patch('/members/:id', sensitiveAdminLimiter, requireMemberMutationAuthority, validateBody(memberUpdateSchema), async (req, res, next) => {
  const updates = {};
  for (const field of ['first_name','last_name','email']) if (req.body[field] !== undefined) updates[field] = String(req.body[field]).trim();
  if (req.body.role !== undefined) updates.role = String(req.body.role).toLowerCase();
  if (req.body.status !== undefined) updates.status = String(req.body.status).toLowerCase();
  if (!updates.first_name || !updates.last_name || !/^\S+@\S+\.\S+$/.test(updates.email || '')) return res.status(400).json({ error: 'A first name, last name, and valid email are required.' });
  if (!['alumni','employer','staff','admin'].includes(updates.role) || !['pending','verified','suspended'].includes(updates.status)) return res.status(400).json({ error: 'Invalid role or account status.' });
  if (updates.role !== undefined && ['staff', 'admin'].includes(updates.role) && req.admin.profile.role !== 'admin') return publicError(res, 403, 'SUPER_ADMIN_REQUIRED', 'Only a super administrator can assign privileged roles.');
  if (req.admin.profile.role !== 'admin' && updates.role !== req.targetMember.role) return publicError(res, 403, 'SUPER_ADMIN_REQUIRED', 'Staff members cannot change account roles.');
  if (req.params.id === req.admin.id && (updates.role !== req.admin.profile.role || updates.status === 'suspended')) return res.status(400).json({ error: 'You cannot demote or suspend your own administrator account.' });
  try {
    const { error: authError } = await adminClient.auth.admin.updateUserById(req.params.id, { email: updates.email, user_metadata: { first_name: updates.first_name, last_name: updates.last_name } });
    if (authError) throw authError;
    const { data, error } = await adminClient.from('profiles').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    if (updates.role !== req.targetMember.role) {
      const { error: clearRoleError } = await adminClient.from('profile_roles').delete().eq('profile_id', req.params.id);
      if (clearRoleError) throw clearRoleError;
      if (['alumni', 'employer'].includes(updates.role)) {
        const { error: roleError } = await adminClient.from('profile_roles').insert({ profile_id: req.params.id, role: updates.role });
        if (roleError) throw roleError;
      }
    }
    await writeAuditLog({ actorId: req.admin.id, action: 'member.updated', targetType: 'profile', targetId: req.params.id, details: updates });
    res.json({ member: data });
  } catch (error) { next(error); }
});

adminRouter.patch('/members/:id/lock', sensitiveAdminLimiter, requireMemberMutationAuthority, async (req, res, next) => {
  const locked = Boolean(req.body.locked);
  if (req.params.id === req.admin.id && locked) return res.status(400).json({ error: 'You cannot lock your own administrator account.' });
  try {
    const { error } = await adminClient.auth.admin.updateUserById(req.params.id, { ban_duration: locked ? '876000h' : 'none' });
    if (error) throw error;
    await writeAuditLog({ actorId: req.admin.id, action: locked ? 'member.locked' : 'member.unlocked', targetType: 'profile', targetId: req.params.id });
    res.json({ locked });
  } catch (error) { next(error); }
});

adminRouter.post('/members/:id/send-password-reset',sensitiveAdminLimiter,requireMemberMutationAuthority,async(req,res,next)=>{try{const{data:userData,error:userError}=await adminClient.auth.admin.getUserById(req.params.id);if(userError)throw userError;const{error}=await adminClient.auth.resetPasswordForEmail(userData.user.email);if(error)throw error;await writeAuditLog({actorId:req.admin.id,action:'member.password_reset_sent',targetType:'profile',targetId:req.params.id});res.json({success:true});}catch(error){next(error);}});
adminRouter.post('/members/:id/resend-confirmation',sensitiveAdminLimiter,requireMemberMutationAuthority,async(req,res,next)=>{try{const{data:userData,error:userError}=await adminClient.auth.admin.getUserById(req.params.id);if(userError)throw userError;const{error}=await adminClient.auth.resend({type:'signup',email:userData.user.email});if(error)throw error;await writeAuditLog({actorId:req.admin.id,action:'member.confirmation_resent',targetType:'profile',targetId:req.params.id});res.json({success:true});}catch(error){next(error);}});
adminRouter.put('/members/:id/roles',sensitiveAdminLimiter,async(req,res,next)=>{if(req.admin.profile.role!=='admin')return publicError(res,403,'SUPER_ADMIN_REQUIRED','Only a super administrator can change account roles.');if(!Array.isArray(req.body?.roles))return publicError(res,400,'INVALID_ROLES','Account roles must be a list.');const roles=[...new Set(req.body.roles.map(x=>String(x).toLowerCase()).filter(x=>['alumni','employer','staff','admin'].includes(x)))];if(!roles.length)return res.status(400).json({error:'Select at least one role.'});if(req.params.id===req.admin.id&&!roles.includes('admin'))return res.status(400).json({error:'You cannot remove your own administrator role.'});try{const communityRoles=roles.filter(role=>['alumni','employer'].includes(role));const{error:updateError}=await adminClient.from('profiles').update({role:roles.includes('admin')?'admin':roles.includes('staff')?'staff':communityRoles[0]}).eq('id',req.params.id);if(updateError)throw updateError;await adminClient.from('profile_roles').delete().eq('profile_id',req.params.id);if(communityRoles.length){const{error}=await adminClient.from('profile_roles').insert(communityRoles.map(role=>({profile_id:req.params.id,role})));if(error)throw error;}await writeAuditLog({actorId:req.admin.id,action:'member.roles_updated',targetType:'profile',targetId:req.params.id,details:{roles}});res.json({roles});}catch(error){next(error);}});
adminRouter.patch('/members/:id/suspension',sensitiveAdminLimiter,requireMemberMutationAuthority,async(req,res,next)=>{if(req.params.id===req.admin.id)return res.status(400).json({error:'You cannot suspend your own administrator account.'});const reason=String(req.body.reason||'').trim();const until=req.body.until?new Date(req.body.until):null;if(!reason||!until||Number.isNaN(until.getTime())||until<=new Date())return res.status(400).json({error:'A reason and future suspension expiration are required.'});const seconds=Math.max(60,Math.ceil((until-Date.now())/1000));try{const{error:authError}=await adminClient.auth.admin.updateUserById(req.params.id,{ban_duration:`${seconds}s`});if(authError)throw authError;const{error}=await adminClient.from('profiles').update({status:'suspended',suspension_reason:reason,suspension_expires_at:until.toISOString(),locked_until:until.toISOString()}).eq('id',req.params.id);if(error)throw error;await adminClient.from('moderation_actions').insert({target_type:'member',target_id:req.params.id,action:'suspend',reason,actor_id:req.admin.id,reversible_until:until.toISOString()});await writeAuditLog({actorId:req.admin.id,action:'member.suspended',targetType:'profile',targetId:req.params.id,details:{reason,until}});res.json({success:true});}catch(error){next(error);}});
adminRouter.patch('/members/:id/deactivation',sensitiveAdminLimiter,requireMemberMutationAuthority,async(req,res,next)=>{if(req.params.id===req.admin.id)return res.status(400).json({error:'You cannot deactivate your own administrator account.'});const deactivate=Boolean(req.body.deactivate);const reason=String(req.body.reason||'Administrative deactivation').trim();try{const{error:authError}=await adminClient.auth.admin.updateUserById(req.params.id,{ban_duration:deactivate?'876000h':'none'});if(authError)throw authError;const{error}=await adminClient.from('profiles').update({deactivated_at:deactivate?new Date().toISOString():null,status:deactivate?'suspended':'pending',suspension_reason:deactivate?reason:null,suspension_expires_at:null}).eq('id',req.params.id);if(error)throw error;await adminClient.from('moderation_actions').insert({target_type:'member',target_id:req.params.id,action:deactivate?'suspend':'restore',reason,actor_id:req.admin.id});await writeAuditLog({actorId:req.admin.id,action:deactivate?'member.deactivated':'member.restored',targetType:'profile',targetId:req.params.id,details:{reason}});res.json({success:true});}catch(error){next(error);}});
adminRouter.post('/members/:id/revoke-sessions',sensitiveAdminLimiter,requireMemberMutationAuthority,async(req,res,next)=>{if(req.params.id===req.admin.id)return res.status(400).json({error:'Use sign out to end your own administrator session.'});try{const{error}=await adminClient.auth.admin.updateUserById(req.params.id,{ban_duration:'1s',user_metadata:{sessions_revoked_at:new Date().toISOString()}});if(error)throw error;await writeAuditLog({actorId:req.admin.id,action:'member.sessions_revoked',targetType:'profile',targetId:req.params.id});res.json({success:true});}catch(error){next(error);}});

/* =========================================================
   SERVE FRONTEND
========================================================= */

const clientDist = path.join(
  __dirname,
  '../../client/dist'
);

app.use(
  express.static(clientDist)
);

app.get(
  '/{*splat}',
  (req, res) =>
    res.sendFile(
      path.join(
        clientDist,
        'index.html'
      )
    )
);

/* =========================================================
   START SERVER
========================================================= */

export { app, normalizeEventPayload, requiredAdminScope, toPublicEvent };

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  app.listen(
    port,
    () => console.log(`Server listening on http://localhost:${port}`)
  );
}
