# Public/alumni concurrency assessment - 2026-09-22

Thousands of registered accounts are plausible for this architecture, but the repository and current tests do not establish reliable capacity for hundreds of active users. Simultaneous chat, media, notifications, and expensive queries matter more than the number of stored accounts. A deployment plan and a production-like staging test are still required.

## Architecture and observed bottlenecks

The browser calls Supabase directly for feed, directory, chat, notifications, and community functions. Express handles public data and admin APIs. Improving Express alone does not improve all alumni traffic or enforce limits on direct Supabase traffic.

- Batch chat originally made roughly five database/RPC requests every five seconds: membership, manager status, messages, member list, and reactions. At 300 open chats, that is about 300 requests/second before images, settings, new writes, or reply lookups.
- Direct chat combined Realtime with five-second full-history polling, repeated read-receipt updates, directory reloads, and signing the same attachments repeatedly.
- Notifications refreshed both tables every 15 seconds even when Realtime was also delivering events.
- Public home/events/gallery rebuilt identical responses for each visitor. Gallery signing used one Storage request per photo.
- A single IP-based API allowance could be consumed by unrelated people sharing campus Wi-Fi. The sensitive-action limiter also shared an IP bucket.
- Directory and chat-directory RPCs load the entire visible directory. The directory computes mutual-friend counts per person; chat aggregates message history across profiles. UI Load more is not database pagination.
- Feed pagination previously bounded posts but downloaded unbounded embedded comments/reactions. The follow-up below addresses this response-size problem.
- The earlier admin audit fixed truncated lists by reading additional pages. This improves correctness but does not make all-row admin filters/exports or analytics efficient at very large scale.

## Implemented in this pass

1. Added a bounded asynchronous cache that shares concurrent requests, expires results, drops errors, and supports safe invalidation while older loads finish.
2. Public home/events/gallery snapshots are cached for 15 seconds per server process. Concurrent cache misses share one fetch. Only those explicitly public responses use this cache; maintenance checks still run. Admin audit writes invalidate the snapshots. Browser responses remain `no-store`.
3. Concurrent settings-cache misses share one request, now with the existing database query timeout.
4. Gallery signatures are requested in batches of at most 100 instead of one request per photo, in both public and admin gallery endpoints.
5. Chat attachment URLs are cached for 55 minutes against one-hour signed URLs, bounded to 300 entries and cleared when the signed-in account changes. Concurrent requests for the same attachment share signing work.
6. Direct-chat refreshes cannot overlap for the same conversation. Realtime refresh bursts are debounced. Reconciliation polls run every 15 seconds when Realtime is connected, with a five-second fallback when it is unavailable. Only loaded unread incoming messages cause read-receipt writes.
7. Batch membership/permissions/member-list metadata is reused for 60 seconds instead of fetched every five seconds. RLS still authorizes data reads/writes on the server; the cached metadata only affects UI state. Membership-change events force refresh. The existing message/reaction polling remains.
8. Chat settings refresh every 30 seconds, skip hidden tabs, avoid overlap, and refresh on visibility changes.
9. Notification polling changes from 15 to 30 seconds, skips hidden tabs, avoids overlapping loads, and refreshes on returning to the page. Realtime remains enabled. The fallback remains important because not every notification table is enabled in the checked-in Realtime publication.
10. Sensitive action limits are keyed by the authenticated account. The configured admin request limit is also enforced per authenticated account. A separate, configurable shared-IP ingress limit defaults to 3,000 requests/minute via `PUBLIC_API_RATE_LIMIT_PER_MINUTE`. This is a starting configuration for shared networks, not a universal safe limit.
11. Prepared `supabase/migrations/20260922_scaling_indexes.sql` with candidate indexes for latest education lookups, incoming-message history, support queues, and member ordering. **Not applied.** Test on staging and execute each concurrent-index statement outside a transaction.

Approximate steady polling counts for 300 visible instances, excluding errors, mutations, Realtime-triggered reloads, images, initial loads, and reply lookups:

| Component | Before | After |
| --- | ---: | ---: |
| Batch chat data/metadata | 300 requests/sec | 135 requests/sec |
| Two notification tables | 40 requests/sec | 20 requests/sec |
| One chat-settings consumer | 60 requests/sec | 10 requests/sec |

These are code-derived estimates, not measured database throughput. Batch chat still needs further work for a heavy-chat audience.

## Validation and the failed larger burst

- All **51 tests pass**, including cache concurrency/expiry/error/eviction/invalidation tests, an authenticated-account rate-limit isolation test, and a public endpoint concurrency regression.
- Production client build passed. The existing roughly 587 KB main JavaScript chunk warning remains.
- `git diff --check` passed.
- **100 simultaneous localhost requests to the public events endpoint passed** with zero errors and two mock database reads total (one event read, one registration read). In the final full test run, p95 was approximately 140 ms and total burst time approximately 161 ms.
- A separate cache-unit test coalesced 300 concurrent callers into one loader.
- **The 300-HTTP-request localhost burst failed with connection refusals**, including when retried outside the sandbox with a larger listen backlog. The underlying local connection/environment limit was not established. The committed HTTP regression uses the passing 100-request workload; this does not convert the failed 300-request test into a success.
- Tests use a local mock Supabase service. They prove application behavior and reduced duplicate work, not live Postgres, RLS, Storage, Realtime, network, or hosting capacity. No production load test or production data mutations were performed.

## Requirements before claiming 200-300 active users

- Confirm actual app hosting and Supabase plan, compute, connection limits, message limits, and egress. Current Supabase documentation lists 200 Realtime connections on Free and 500 on standard Pro. Multiple tabs/devices can increase connection use; buying a plan alone does not prove database performance.
- Create a separate staging Supabase project and deployment with realistic synthetic data: several thousand profiles, substantial message history, posts with many comments/reactions, and gallery media. Do not seed or stress-test the real alumni project.
- Ramp distinct test users through 25, 50, 100, 200, then 300 active sessions. Include realistic pauses and a sudden arrival burst. Test public browsing, feed scrolling, directory filters, direct chat, batch chat, uploads, reconnects, and simultaneous admin work. Hold each stage for 10-15 minutes and the target stage for 30-60 minutes.
- Collect endpoint p50/p95/p99, error and unexpected 429 rates, DB CPU/memory/IO, slow-query plans, Realtime connections/message rates/lag, Storage requests, response sizes, and process memory/event-loop lag.
- Provisional acceptance targets: p95 ordinary reads below one second, fewer than 1% unexpected errors, no sustained resource saturation, no data-loss or authorization failures, and enough connection/throughput headroom for reconnect bursts. Tune these targets for the institution rather than treating them as product guarantees.
- Replace whole-directory downloads with server-side search/pagination; move heavy aggregate analytics to database aggregates; use cursor-based history loading and efficient change delivery for busy chat rooms. Measure before selecting indexes or increasing compute.
- Configure the shared rate-limit store described below for multiple Express instances. Public caches remain per instance with up to 15 seconds of staleness after a mutation elsewhere. The fixed `trust proxy` configuration must also match the deployment topology.
- Deploy the production build, with an appropriate static-asset/CDN strategy and monitoring. Do not use the Vite development server as the production host.

## Sources checked

- [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits)
- [Supabase Postgres Changes and scaling considerations](https://supabase.com/docs/guides/realtime/postgres-changes#database-instance-and-realtime-performance)
- [Supabase connection pooling and limits](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)
- [express-rate-limit configuration and shared stores](https://github.com/express-rate-limit/express-rate-limit/blob/main/readme.md)

## Follow-up: Vercel hosting and feed response sizes

Hosting is confirmed as **Vercel**; the Supabase plan and compute tier are still unknown.

- Added a Vercel function entry point and root configuration for the React build, API routing, and SPA navigation. Local environment files are excluded, and the server skips dotenv on Vercel. See `VERCEL_DEPLOYMENT.md` for setup and preview checks. Nothing has been deployed.
- Added an optional shared Redis REST rate-limit store. Independent Vercel instances use the same atomic counters when configured. Ingress, admin, sensitive-operation, and environment namespaces are distinct. Provider failures fail closed; secrets/provider error bodies are not logged. Local development still works without Redis, but that fallback cannot enforce a global production limit.
- Feed pages now fetch 10 posts plus one pagination sentinel, aggregate reaction/comment counts, and only the viewer's reaction/save records. Comments load on demand in batches of 20 plus one sentinel. This bounds transferred rows even when a post has thousands of interactions; aggregate computation still requires database work.
- Feed and comments use timestamp/ID cursors, deduplicate page merges, and preserve aggregate counts when the viewer switches/removes a reaction. Stale page/comment reads are ignored after an account change or unmount. Comment errors offer retry instead of falsely displaying an empty discussion.
- **58 tests pass** after this follow-up. New cases cover generated query bounds/cursors, reaction count updates, comment merging, cross-instance counter behavior against a mock Redis REST service, and provider/configuration failures. These do not execute Lua in a real Redis database.
- Three small **live read-only Supabase probes returned HTTP 200**: the new feed query, a subsequent cursor page, and a comments query. They used a server credential to validate schema/query compatibility; they do not validate authenticated-user RLS behavior or capacity. No user content was printed and no records were changed.
- Production client build passed (main JS approximately 589 KB; existing chunk-size warning remains). Latest 100-request local mock endpoint test had zero errors and two database reads total, with p95 approximately 114 ms. The earlier 300-request connection refusal remains unresolved and is not a production capacity result.

The remaining high-load risks are whole-directory RPCs, batch message/reaction polling and history size, all-row analytics/exports, and the unknown Supabase quotas/compute. Vercel can scale API execution, but it does not remove these database and direct-client request costs. A production-like staging test remains necessary before claiming support for hundreds of simultaneous users.
