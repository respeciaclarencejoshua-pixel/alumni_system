import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.join(__dirname, '../.env'),
});

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

    // Try to get interest counts, but don't fail if the table doesn't exist
    let interestCounts = {};
    const resourceIds = (data || []).map((resource) => resource.id);
    
    if (resourceIds.length) {
      try {
        const { data: interests, error: interestsError } = await runSupabaseQuery(
          adminClient
            .from('event_interests')
            .select('event_id')
            .in('event_id', resourceIds)
        );
        
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

app.get('/api/gallery', async (req, res, next) => {
  if (!adminClient) return res.status(503).json({ error: 'Gallery data is not configured.' });
  try {
    const { data, error } = await runSupabaseQuery(adminClient.from('gallery_submissions').select('id, author_name, title, description, category, photo_date, batch_year, people_names, image_path, featured, created_at').eq('status', 'approved').order('featured', { ascending: false }).order('created_at', { ascending: false }));
    if (error) throw error;
    const photos = await Promise.all((data || []).map(async (photo) => {
      const { data: signed, error: signedError } = await adminClient.storage.from('gallery-media').createSignedUrl(photo.image_path, 3600);
      if (signedError) throw signedError;
      return { ...photo, url: signed.signedUrl };
    }));
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
    const { data, error } = await runSupabaseQuery(
      adminClient.from('feed_posts')
        .select('id, user_id, author_name, author_avatar_url, content, media_path, created_at, feed_comments(count), feed_reactions(count)')
        .order('created_at', { ascending: false }).limit(100)
    );
    if (error) throw error;
    const posts = await Promise.all((data || []).map(async (post) => {
      let mediaUrl = null;
      if (post.media_path) {
        const { data: publicData } = adminClient.storage.from('feed-media').getPublicUrl(post.media_path);
        mediaUrl = publicData?.publicUrl || null;
      }
      return { ...post, media_url: mediaUrl, comment_count: post.feed_comments?.[0]?.count || 0, reaction_count: post.feed_reactions?.[0]?.count || 0 };
    }));
    res.json({ posts });
  } catch (error) { next(error); }
});

adminRouter.delete('/community-content/:postId', async (req, res, next) => {
  try {
    const { data: post, error: findError } = await adminClient.from('feed_posts').select('id, media_path, author_name').eq('id', req.params.postId).maybeSingle();
    if (findError) throw findError;
    if (!post) return res.status(404).json({ error: 'Post not found.' });
    const { error } = await adminClient.from('feed_posts').delete().eq('id', post.id);
    if (error) throw error;
    if (post.media_path) await adminClient.storage.from('feed-media').remove([post.media_path]);
    await writeAuditLog({ actorId: req.admin.id, action: 'delete_community_post', targetType: 'feed_post', targetId: post.id, details: { author_name: post.author_name } });
    res.json({ success: true });
  } catch (error) { next(error); }
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

      const { data: roleRows, error: rolesError } = data.length
        ? await adminClient.from('profile_roles').select('profile_id, role').in('profile_id', data.map((profile) => profile.id))
        : { data: [], error: null };
      if (rolesError) throw rolesError;
      const rolesByProfile = (roleRows || []).reduce((map, item) => {
        if (!map[item.profile_id]) map[item.profile_id] = [];
        map[item.profile_id].push(item.role.toUpperCase());
        return map;
      }, {});

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

    res.status(error.status || 500).json({
      error: error.publicMessage ||
        'The server could not complete this request.',
    });
  }
);

adminRouter.post('/members', async (req, res, next) => {
  const firstName = String(req.body.first_name || '').trim();
  const lastName = String(req.body.last_name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = String(req.body.role || 'alumni').toLowerCase();
  const status = String(req.body.status || 'pending').toLowerCase();
  if (!firstName || !lastName || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ error: 'First name, last name, a valid email, and a password of at least 8 characters are required.' });
  if (!['alumni','employer','staff','admin'].includes(role) || !['pending','verified','suspended'].includes(status)) return res.status(400).json({ error: 'Invalid role or account status.' });
  let createdUser;
  try {
    const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: Boolean(req.body.email_confirmed), user_metadata: { first_name: firstName, last_name: lastName } });
    if (error) throw error;
    createdUser = data.user;
    const { error: profileError } = await adminClient.from('profiles').upsert({ id: createdUser.id, first_name: firstName, last_name: lastName, email, role, status });
    if (profileError) throw profileError;
    await writeAuditLog({ actorId: req.admin.id, action: 'member.created', targetType: 'profile', targetId: createdUser.id, details: { email, role, status } });
    res.status(201).json({ id: createdUser.id });
  } catch (error) { if (createdUser?.id) await adminClient.auth.admin.deleteUser(createdUser.id); next(error); }
});

adminRouter.get('/members/:id', async (req, res, next) => {
  try {
    const [{ data: profile, error }, { data: education }, { data: verification }, { data: authData, error: authError }] = await Promise.all([
      adminClient.from('profiles').select('*').eq('id', req.params.id).maybeSingle(),
      adminClient.from('education').select('*').eq('profile_id', req.params.id).order('created_at'),
      adminClient.from('alumni_verifications').select('id, graduation_name, graduation_year, graduation_date, batch_name, program, document_filename, status, reviewer_note, created_at, reviewed_at').eq('user_id', req.params.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      adminClient.auth.admin.getUserById(req.params.id),
    ]);
    if (error || authError) throw error || authError;
    if (!profile) return res.status(404).json({ error: 'Member not found.' });
    const authUser = authData.user;
    res.json({ member: { ...profile, education: education || [], verification: verification || null, email_confirmed: Boolean(authUser.email_confirmed_at), locked: Boolean(authUser.banned_until && new Date(authUser.banned_until) > new Date()), last_sign_in_at: authUser.last_sign_in_at } });
  } catch (error) { next(error); }
});

adminRouter.patch('/members/:id', async (req, res, next) => {
  const updates = {};
  for (const field of ['first_name','last_name','email']) if (req.body[field] !== undefined) updates[field] = String(req.body[field]).trim();
  if (req.body.role !== undefined) updates.role = String(req.body.role).toLowerCase();
  if (req.body.status !== undefined) updates.status = String(req.body.status).toLowerCase();
  if (!updates.first_name || !updates.last_name || !/^\S+@\S+\.\S+$/.test(updates.email || '')) return res.status(400).json({ error: 'A first name, last name, and valid email are required.' });
  if (!['alumni','employer','staff','admin'].includes(updates.role) || !['pending','verified','suspended'].includes(updates.status)) return res.status(400).json({ error: 'Invalid role or account status.' });
  if (req.params.id === req.admin.id && (updates.role !== req.admin.profile.role || updates.status === 'suspended')) return res.status(400).json({ error: 'You cannot demote or suspend your own administrator account.' });
  try {
    const { error: authError } = await adminClient.auth.admin.updateUserById(req.params.id, { email: updates.email, user_metadata: { first_name: updates.first_name, last_name: updates.last_name } });
    if (authError) throw authError;
    const { data, error } = await adminClient.from('profiles').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    await writeAuditLog({ actorId: req.admin.id, action: 'member.updated', targetType: 'profile', targetId: req.params.id, details: updates });
    res.json({ member: data });
  } catch (error) { next(error); }
});

adminRouter.patch('/members/:id/lock', async (req, res, next) => {
  const locked = Boolean(req.body.locked);
  if (req.params.id === req.admin.id && locked) return res.status(400).json({ error: 'You cannot lock your own administrator account.' });
  try {
    const { error } = await adminClient.auth.admin.updateUserById(req.params.id, { ban_duration: locked ? '876000h' : 'none' });
    if (error) throw error;
    await writeAuditLog({ actorId: req.admin.id, action: locked ? 'member.locked' : 'member.unlocked', targetType: 'profile', targetId: req.params.id });
    res.json({ locked });
  } catch (error) { next(error); }
});

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
