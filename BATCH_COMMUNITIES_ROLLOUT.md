# Batch communities

## Activation

Apply `supabase/migrations/20260908_batch_communities.sql` once, after `20260907_community_services.sql`. Back up and test on staging first. Do not run concurrently with the full schema. No remote database migration has been executed in this implementation.

The migration adds batch year, photo, president, rules, and a shared batch-entry table. Existing discussion titles/body and replies are copied to this table; replies are preserved as labelled discussion entries, not nested threads. Existing groups/memberships remain intact. Admins should fill in missing batch metadata; no guessed year or president is assigned.

## Using it

- Admin → Community & Requests → Alumni groups: create a batch, choose its president, upload a circular-display photo, or open a batch and edit its details.
- Alumni → Community feed → Alumni groups: search by batch name/year/president, open a card, and join the batch.
- Joining grants discussions, announcements, member directory, and group-chat access together. It also lists that batch in the chat widget. Leaving removes access to all four; previous messages are retained.
- Batch presidents and verified administrators can publish batch announcements. Members can publish discussions/chat messages and delete their own entries.
- Assigning a verified president adds that person to the batch. A president who leaves cannot publish announcements unless they rejoin. Only administrators can change the president.
- New chat messages are polled every five seconds while visible; no Supabase realtime publication change is necessary. The latest 100 entries are shown. Refresh does not discard an unsent draft.
- Photos are public; membership rosters and conversation content are restricted. Directory RPCs do not return email/phone/contact fields.

## Membership choice

Verified alumni explicitly join a batch, as requested. The system does not silently enroll everyone with a matching, self-edited graduation year. Year-based eligibility, membership approval, and alumni-office enrollment require a separate approved policy.

## Required staging checks

1. Admin creates Batch 2007 with a photo, year, and verified president. Alumni sees the card with those values and member count.
2. Member joins and immediately sees the batch in Chats. Send a message from another account and verify it appears within the polling interval.
3. Nonmember cannot select entries, obtain the member roster, or insert chat messages through direct API calls.
4. After leaving, a member cannot fetch/send batch entries. An already-open chat must stop showing entries on its next access check.
5. Member cannot publish an announcement, change the president, or upload a batch photo. President can announce only within their own joined batch. Global official announcements remain administrator-only.
6. Check account switch/sign-out, failed uploads, long text, narrow screens, keyboard navigation, and disabled/busy actions.
7. Verify copied legacy discussions/replies before retiring any old tables. This migration deletes no legacy content.

Local build and static regression tests are not a substitute for these live RLS/browser checks.

## Recommended next additions (not implemented)

Prioritize batch-linked reunion events/RSVPs, officer roles, membership approvals if needed, reporting/moderation, chat unread counts and mute controls, and pinned batch resources. A help/opportunity board can follow. Add pagination, server-enforced rate limits, and threaded discussion replies before a larger rollout. Avoid collecting dues/payment data in ordinary chat.
