# Production operations

## Deployment checklist

- Apply `supabase/schema.sql` and retain the SQL execution record.
- Configure exact HTTPS origins in `CLIENT_ORIGIN`; set `NODE_ENV=production`.
- Use separate Supabase projects and credentials for development and production.
- Enable leaked-password protection, email confirmation, MFA enrollment for all
  administrators, database backups, point-in-time recovery, and storage logs.
- Enable `require_admin_mfa` only after every administrator has enrolled a
  verified factor. Test with a staff and super-admin account.
- Run the server tests, production client build, and dependency audit.
- Smoke-test login, verification review, role restrictions, published events,
  moderation, gallery approval, and logout.

## Backup and restore

Use managed Supabase backups and keep an encrypted off-site logical backup on
the institution's retention schedule. Quarterly, restore the latest backup into
an isolated project, confirm row counts and storage references, run smoke tests,
and record recovery time and recovery point results. Never test restoration over
the production project.

## Rollback

Keep the previous application artifact deployable. If a release fails, restore
that artifact first. Database migrations must be additive and backward-compatible;
prepare and review a separate corrective migration instead of editing production
data manually.

## Incidents and secrets

Revoke and rotate exposed Supabase, Turnstile, and provider keys immediately.
Review admin audit logs, Auth logs, and hosting logs; preserve evidence and notify
the institutional privacy/security owner. Incident records must not contain
access tokens, passwords, document contents, or raw database errors.
