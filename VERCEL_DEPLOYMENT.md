# Deploying this repository on Vercel

The checked-in configuration builds React into `client/dist` and exposes the Express API through `api/index.mjs`. `/api/*` routes go to the function; application routes such as `/admin` go to the React entry point. Static assets are served from the build output. Local development remains `npm run dev`.

## Project settings

- Import the **repository root**, not just `client` or `server`.
- If logs show `Missing script: vercel:install` at `/vercel/path0/client`, installation is running in the client workspace. A forwarding script now handles installation there, but the Vercel Root Directory must still be the repository root to include the API and resolve `client/dist` correctly. Save the Root Directory change and deploy the latest commit.
- Use the checked-in `vercel.json`: framework preset Other, install `npm run vercel:install`, build `npm run build`, output `client/dist`.
- Keep these root npm scripts as the deployment entry points. Vercel's Node builder can invoke commands from `api/`; a direct `npm --workspace client run build` there fails with `No workspaces found`. `npm run` locates the root package and runs its script from that package's directory. The install script explicitly includes both workspaces and development dependencies needed by Vite.
- Choose a supported Node version satisfying Vite's engine requirement (Node 22.12+ in the 22 release line is suitable for the installed Vite version).
- Configure the function region near the Supabase project's region. The repository deliberately does not guess the database region.
- `maxDuration` is 60 seconds. Large exports/analytics must still be measured; increasing duration does not fix expensive queries.

## Environment variables

Set these through Vercel project settings. Keep preview and production environments separate, preferably using a staging Supabase project for previews.

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Browser Supabase project URL, required during build |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser-safe Supabase key, required during build |
| `VITE_TURNSTILE_SITE_KEY` | Browser CAPTCHA site key; authorize the deployed hostname in Cloudflare |
| `SUPABASE_URL` | Server project URL; use the same project as the client |
| `SUPABASE_PUBLISHABLE_KEY` | Server's publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged server credential; never give it a `VITE_` prefix |
| `CLIENT_ORIGIN` | Exact HTTPS website origin, without a trailing slash; comma-separated for additional authorized origins |
| `GIPHY_API_KEY` | Server GIF proxy key, if GIF search is enabled |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Shared rate-limit storage; both must be set together, server-only |
| `RATE_LIMIT_KEY_PREFIX` | Unique app/environment prefix, e.g. `nddu:production`; same value on all instances of that environment |
| `PUBLIC_API_RATE_LIMIT_PER_MINUTE` | Shared-IP ingress threshold; defaults to 3000 |
| `SUPABASE_QUERY_TIMEOUT_MS` | Existing server query timeout; defaults to 5000 |

Vercel supplies `VERCEL`/`VERCEL_ENV`. Local dotenv files are ignored on Vercel and excluded from deployment artifacts. Browser `VITE_*` values are embedded at build time: changing them requires a new build. Set Supabase Auth's site URL and permitted redirect URLs to the intended deployed URLs; configure CAPTCHA consistently in Supabase and Cloudflare.

## Shared limits and caches

The optional Redis REST store uses atomic Lua increments with expiry. The ingress, per-admin, and sensitive-action counters have separate namespaces. Without both Redis variables, limits are **per process only** and do not enforce a deployment-wide allowance. Partial configuration fails startup. A configured but unavailable Redis service returns an error rather than silently allowing unlimited requests. Account for the extra REST calls and monitor Redis availability/usage.

The 15-second public-data cache remains per warm instance. A mutation clears only that instance's snapshots; other instances can show the previous public snapshot until their short TTL expires. No authenticated/private responses are shared through this cache. Maintenance/settings checks also have a short per-instance cache. Browser-to-Supabase requests do not pass through Express's rate limiter; RLS and database/Realtime capacity still matter.

## Preview checks before production

1. Configure a preview against staging and verify `/`, `/login`, a direct `/admin` navigation, and a generated `/assets/*` URL.
2. Verify `/api/status` returns JSON, `/api/admin/me` without a token returns 401, and `/api/not-a-route` returns JSON 404, not the React HTML page.
3. Test login, CAPTCHA, confirmation/recovery redirects, refresh/sign-out, and authorized versus unauthorized admin accounts. Do not expose tokens in logs.
4. Test feed pagination/reaction counts/comments, chat reconnects, notifications, gallery images, and uploads. Uploads go directly to Supabase Storage.
5. Verify rate-limit headers and shared counters with controlled staging requests across instances. Keep preview and production Redis namespaces separate.
6. Run the staged workload in `SCALABILITY_REVIEW_2026-09-22.md` and inspect Vercel function errors/latency alongside Supabase metrics.

Local production build and application tests have passed. **No Vercel deployment/build or real Redis integration test has been performed.** Configuration alone is not evidence of hundreds of concurrent users working reliably.

References: [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js), [project configuration](https://vercel.com/docs/project-configuration/vercel-json), [rewrites](https://vercel.com/docs/routing/rewrites), [Upstash REST API](https://upstash.com/docs/redis/features/restapi).
