# Community services — implementation and rollout

## Implemented in this change

- Community navigation retains the existing feed and adds announcements, groups, and help.
- Verified administrators can publish/pin official announcements and create school-approved groups.
- Verified alumni can join/leave groups and publish discussions/replies inside joined groups.
- Signed-in alumni can submit private requests, read replies, and check the current status.
- Administrators have a request queue, replies, and four request statuses.
- Responsive shared green/yellow styling, labelled fields, keyboard focus, validation, pending states, error messages, search, and explicit refresh.
- Database RLS restricts private requests and group discussions. Administrative authority checks role, verification, configured MFA, and session age in the database, not just navigation.
- Group author contact details are not exposed. Group replies currently say “Group member”; public display-name integration remains outstanding.

## Required before these features are usable

1. Back up your database and test on a staging project first.
2. Apply `supabase/migrations/20260907_community_services.sql` **once**, after your existing `schema.sql` has already been installed. Do not run both concurrently. This migration uses a five-second lock timeout and does not modify existing community data.
3. If the SQL transaction fails, roll it back before retrying; do not repeatedly run the full schema. The migration is intentionally not silently idempotent.
4. Build and deploy the client. Open Community → Announcements, groups & help. Administrators use Community & Requests in the admin sidebar.
5. Run the acceptance checks below before inviting alumni. No production migration or live browser verification has been performed by this change.

## Acceptance checks (staging, separate accounts)

- Administrator: create group, publish announcement, pin it. Alumni: refresh and see both.
- Alumni A: join group, publish discussion. Alumni B: cannot read the discussion until joining. Leaving removes access. Repeat using direct Supabase requests, not only the interface.
- Pending account: cannot join groups or publish announcements/discussions, but can submit an assistance request.
- Alumni A: submit request. Alumni B: cannot select it or its replies by UUID and cannot reply to it.
- Administrator: see request, reply, change status. Alumni A: refresh and see the reply/status.
- Alumni: direct attempts to change status, impersonate another author, or publish official announcements must fail.
- Staff: no new management rights; verified `admin` accounts only. Suspended administrators, expired sessions, and missing required MFA cannot manage these tables.
- Long text, small screens, keyboard navigation, failed network requests, and sign-out must not expose another account's data.

## Deliberately not complete yet

This is the first implementation slice, not the entire approved proposal. Still required: request assignment and immutable status history; scoped staff access; group moderators/member directory and reporting; targeted announcements; notification deep links and unread badges; event/group/gallery linking; profile privacy controls; gallery correction workflow; home-page action queues; broader existing-module reliability fixes; and live end-to-end permission tests.

The current list shows the latest 100 entries; search applies to those loaded entries. There are no realtime updates or automatic notifications yet. Add pagination, rate limits, and moderation before a large community launch. Existing news remains separate from the new official-announcement store; no automatic migration of old news has been attempted.

## Verification

The production client build and server tests are run locally. Static SQL tests are regression checks only; they do not establish that deployed Supabase RLS has been exercised. Keep the new services limited to staging until the account-by-account acceptance checks pass.
