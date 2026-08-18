import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

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

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, curl requests)
      if (!origin) {
        return callback(null, true);
      }
      
      // Allow localhost in development
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      
      // Check configured origins for production
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin is not allowed by CORS'));
    },

    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  })
);

app.use(express.json({ limit: '1mb' }));

/* =========================================================
   BASIC STATUS
========================================================= */

app.get('/api/status', (req, res) =>
  res.json({
    status: 'ok',
    message: 'Alumni system backend is running',
  })
);

/* =========================================================
   EVENTS
========================================================= */

app.get('/api/events', async (req, res, next) => {
  if (!adminClient) {
    return res.json({
      events: [],
    });
  }

  try {
    const { data, error } = await adminClient
      .from('admin_resources')
      .select('*')
      .eq('resource_type', 'events')
      .order('created_at', {
        ascending: false,
      });

    if (error) {
      throw error;
    }

    // Try to get interest counts, but don't fail if the table doesn't exist
    let interestCounts = {};
    const resourceIds = (data || []).map((resource) => resource.id);
    
    if (resourceIds.length) {
      try {
        const { data: interests, error: interestsError } = await adminClient
          .from('event_interests')
          .select('event_id')
          .in('event_id', resourceIds);
        
        if (!interestsError) {
          interestCounts = (interests || []).reduce((counts, interest) => {
            counts[interest.event_id] = (counts[interest.event_id] || 0) + 1;
            return counts;
          }, {});
        }
      } catch (e) {
        // Silently ignore if event_interests table doesn't exist
        console.warn('event_interests table not available:', e.message);
      }
    }

    const events = (data || []).map((resource) => ({
      id: resource.id,
      ...resource.payload,
      interest_count: interestCounts[resource.id] || 0,
      created_at: resource.created_at,
    }));

    return res.json({
      events: events,
    });
  } catch (error) {
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
    return res.status(401).json({
      error: 'Sign in is required.',
    });
  }

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);

  if (userError || !user) {
    return res.status(401).json({
      error: 'Your session is invalid or expired.',
    });
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

  if (
    !profile ||
    !['admin', 'staff'].includes(
      String(profile.role).toLowerCase()
    )
  ) {
    return res.status(403).json({
      error: 'Administrator access is required.',
    });
  }

  req.admin = {
    id: user.id,
    email: user.email,
    profile,
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

adminRouter.use(
  requireAdminConfiguration,
  requireAdmin
);

/* =========================================================
   ADMIN PROFILE
========================================================= */

adminRouter.get('/me', (req, res) => {
  res.json({
    user: req.admin.profile,
  });
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
        'id, first_name, last_name, email, role, status, created_at',
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
  '/members/:id',
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

    try {
      const {
        data,
        error,
      } = await adminClient
        .from('profiles')
        .update({
          status,
        })
        .eq('id', req.params.id)
        .select(
          'id, email, status'
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
          status,
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
        'needs_information',
        'verified',
        'rejected',
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
            reviewer_note,
            created_at,
            profiles!alumni_verifications_user_id_fkey(
              first_name,
              last_name,
              email
            )
          `
        )
        .order('created_at', {
          ascending: false,
        });

      if (status !== 'all') {
        query = query.eq(
          'status',
          status
        );
      }

      const {
        data,
        error,
      } = await query;

      if (error) {
        throw error;
      }

      res.json({
        verifications: data,
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
        })
        .eq('id', req.params.id)
        .select(
          'id, user_id, status'
        )
        .single();

      if (verificationError) {
        throw verificationError;
      }

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
          reviewerNote,
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
  async (req, res, next) => {
    const allowedFields = [
      'institution_name',
      'contact_email',
      'allow_open_signups',
      'verify_domain',
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
  const editableFields = ['title', 'company_name', 'location', 'category', 'description', 'requirements'];
  const updates = Object.fromEntries(editableFields.filter((field) => typeof body[field] === 'string').map((field) => [field, body[field].trim()]));
  if (body.status !== undefined) {
    if (!['active', 'archived'].includes(body.status)) return res.status(400).json({ error: 'Status must be active or archived.' });
    updates.status = body.status;
  }
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
      // Normalize dates to ISO format for events
      const payload = { ...req.body };
      if (req.params.type === 'events') {
        // Convert datetime-local format to ISO 8601
        if (payload.date && typeof payload.date === 'string') {
          payload.date = new Date(payload.date).toISOString();
        }
        if (payload.endDate && typeof payload.endDate === 'string') {
          payload.endDate = new Date(payload.endDate).toISOString();
        }
      }

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
      // Normalize dates to ISO format for events
      const payload = { ...req.body };
      if (req.params.type === 'events') {
        // Convert datetime-local format to ISO 8601
        if (payload.date && typeof payload.date === 'string') {
          payload.date = new Date(payload.date).toISOString();
        }
        if (payload.endDate && typeof payload.endDate === 'string') {
          payload.endDate = new Date(payload.endDate).toISOString();
        }
      }

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

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (error, req, res, next) => {
    console.error(error);

    res.status(500).json({
      error:
        'The server could not complete this request.',
    });
  }
);

/* =========================================================
   SERVE FRONTEND
========================================================= */

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const clientDist = path.join(
  __dirname,
  '../../client/dist'
);

app.use(
  express.static(clientDist)
);

app.get(
  '*',
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

app.listen(
  port,
  () =>
    console.log(
      `Server listening on http://localhost:${port}`
    )
);
