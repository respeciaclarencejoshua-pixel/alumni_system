# Admin audit - 2026-09-22

Reviewed the admin dashboard, Members, Alumni Verification, Opportunities & Events, Social & News, Gallery, Analytics, Settings, Help & Support, and community/batch management code, together with their Express endpoints and relevant Supabase queries. This is a source and automated API audit, not a claim that every production workflow has been exercised.

## Changes made

| Area | Confirmed problem | Change |
| --- | --- | --- |
| Members | Auth metadata was taken from only the first 1,000 Auth accounts. Later accounts could show incorrect confirmation/lock information or fail email confirmation. | Fetch exact account IDs with bounded concurrency; confirmation also uses the exact ID. |
| Members | Community roles could hide an account's primary staff/admin role. | Include the primary role alongside community roles in list and detail responses. |
| Members | Advanced education filters checked only the first education record. | Return education records and match the selected criteria against the same record; include all records in filter choices. |
| Members | Last-active filtering actually checked only last sign-in. | Use the saved last-active timestamp, falling back to sign-in where absent. |
| Members | Secondary detail query errors silently appeared as missing education, verification, or activity. | Check every detail query result and surface failures. |
| Members | Creating privileged users attempted to insert staff/admin into a community-role table that permits only alumni/employer. | Only insert supported community roles and check errors. |
| Members | Role replacement ignored errors clearing old roles and accepted nonexistent targets. | Check the target and role-deletion results. |
| Members | The legacy status route could change profile identity without updating Auth. | Require identity/role edits through the validated member editor. |
| Members | An administrator could set their own account to pending and lose access. | Reject self-demotion through both member update routes. |
| Members | Suspension reason was accepted by the form but omitted from the profile update. | Persist or clear the reason with the selected status. |
| Members | String values such as `"false"` could lock or deactivate accounts. | Require actual boolean values. |
| Members | CSV values could be interpreted as spreadsheet formulas. | Neutralize formula prefixes and preserve CSV quoting. |
| Verification | Approval from the Members dialog omitted required safeguards. | Add the approval checklist and send strict boolean checks; gate review controls by verification permission. |
| Verification | Notes/checks could carry across automatically selected applicants. | Reset review state when the selected submission changes. |
| Verification | Truthy strings bypassed approval checks; completed decisions could be overwritten. | Require `true` for every safeguard and restrict updates to open review states. |
| Verification | Client-provided retention overrode system policy; approval could restore a suspended profile. | Use configured retention and only auto-promote pending profiles. |
| Verification | Evidence-access logging errors were ignored. | Check the access-log insert before returning the document URL. |
| Permissions | Staff dashboards failed when their role lacked analytics access. | Skip the analytics request for roles without that scope. |
| Permissions | Mixed Opportunities/Events and Feed/Gallery pages called and displayed unauthorized tools. | Request and render the sections allowed by assigned scopes. |
| Permissions | Audit logs fell through to the generic dashboard permission. | Require settings permission. |
| Authentication | The auth-state callback called session APIs before leaving the callback. | Defer the access check outside the auth callback to avoid the auth lock dependency. |
| Events | Editing a saved UTC timestamp as local time could shift the event schedule. | Convert UTC to local form values and local values back to UTC for saving. Apply the same handling to gallery schedules. |
| Events | Past events could not be edited because of the create-form minimum date. | Apply the current-date minimum only when creating events. |
| Events | Cancelled/waitlisted registrations could be checked in. | Restrict QR and attendance updates to eligible states; return a conflict for ineligible records. |
| Events | Missing coordinates became zero coordinates in public output. | Preserve missing latitude/longitude as null. |
| Events | Reminder notification/update errors were ignored. | Check both operations before reporting success. |
| Opportunities | Draft/published listings disappeared from the available lists; the editor omitted valid statuses. | Include those listings and all supported statuses. |
| Opportunities | Updates accepted malformed links, dates, counts, boolean values, and empty required text. | Add field-level update validation. |
| Gallery | Invalid ranks/dates and inverted feature schedules were accepted. | Validate inputs and the merged saved schedule; require an approved photo for curation. |
| Gallery | Scheduling changes could be logged as unfeature operations, and moderation-log failures were ignored. | Derive feature state from the updated record and check the log result. |
| Posts | Search only inspected the current ten loaded posts. | Apply safe quoted search expressions in the database before pagination. |
| Queries | Several lists and analytics inputs stopped at the database API row cap. | Read bounded, stably ordered pages for opportunities, generic resources, verification, gallery, and analytics. |
| Queries | Older requests could overwrite new post/verification filter results or analytics periods. | Ignore obsolete responses in those views. |
| Moderation | Reports were marked resolved before the target action succeeded. | Perform the action first, check errors, then conditionally update the report. Reject already reviewed reports. |
| Moderation | Unsupported member/gallery/message actions could report success without applying the advertised action. | Reject unsupported actions and hide those action buttons; keep/escalate remain available. |
| Settings | Initial request failures remained stuck on Loading settings. | Show the error and a Retry button. |
| API errors | Field-level validation errors were dropped by the client helper. | Preserve field errors; reject invalid JSON responses rather than treating them as empty success. |
| Analytics | Privacy-suppressed values appeared blank and stale data could be exported for another period. | Label suppressed values and clear/disable export while the selected period loads. |
| Support | Status/topic filters ran only after the recent-request limit. | Apply those filters to the database query before the limit. |
| Announcements | Pin updates could report success even if no row was changed. | Require a returned row. |

The profile-picture changes requested before this audit remain included in the working tree.

## Unsafe action disabled

The previous Revoke sessions endpoint called `updateUserById` with `ban_duration: '1s'` and wrote a timestamp into user metadata. It did not call a session-revocation operation and could replace a longer ban with a one-second ban. The button is disabled and the endpoint now returns `501 SESSION_REVOCATION_UNAVAILABLE`, without changing the account. Genuine targeted session revocation still requires a supported implementation and live verification. Suspension remains available for restricting access.

## Verification performed

- `npm.cmd --workspace server test`: **44 tests passed**, including **23 new regression tests**.
- New HTTP tests run against an isolated local Supabase fixture. They exercise real Express routes, authorization, validation, query construction, pagination, and failure behavior without writing to the real project.
- `npm.cmd --workspace client run build`: **passed**. The existing large JavaScript chunk warning remains.
- `node --check server/src/index.js`: passed.
- `git diff --check`: passed.
- Live Supabase Auth health check: **HTTP 200**. The earlier DNS failure was not present during this audit.
- **15 live read-only database probes passed**: member fields, community roles, education filters, verification joins, feed joins/counts, quoted post search, gallery fields, opportunities, registration joins, report joins, moderation history joins, settings, support requests, permissions, and incidents. No member details or keys were printed.
- No real member, post, event, verification, support request, or setting was changed by verification. No migrations were applied and nothing was deployed.

## Remaining limitations and follow-up

- Browser-control execution was unavailable in this session. Signed-in visual checks, real MFA/sign-in, email delivery, uploads, and complete user-driven write workflows were not exercised. Live query probes do not validate row-level security for every individual staff/alumni session.
- Multi-step operations spanning Auth, profile records, moderation, notifications, and audit logs are not transactional. Error detection is improved, but failures or simultaneous administrator actions can still leave partially applied operations. Transactional database functions and idempotency need a separate database-backed implementation/test pass.
- Member lists still load all pages for client-side filtering/export. Bulk lists now avoid common row-cap truncation, but very large datasets still need a server-side filtering/export design. Support text/name search is explicitly a search of loaded requests, and its Load older requests flow still depends on the project row cap.
- Genuine session revocation is intentionally unavailable as described above.
- Suspension expiry, enforcement against already-issued tokens across direct Supabase/RLS access, and Auth/profile consistency after provider failures require dedicated live integration testing; these checks should not be inferred from the passing mock tests.
