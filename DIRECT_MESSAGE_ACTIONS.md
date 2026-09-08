# Normal chat actions

Apply `supabase/migrations/20260908_direct_message_actions.sql` once after the existing schema. It has not been applied remotely.

Normal chats use sender/recipient bubble alignment, incoming names/photos, hover/focus actions, touch-accessible controls, replies, emoji reactions, and author-only unsend. Existing image, GIF, and file rendering remains. Reaction changes are checked every five seconds while the tab is visible.

Unsend removes text and attachment references from the conversation and leaves a marker. It cannot revoke downloads, external GIF URLs, screenshots, or previously issued signed URLs. Stored attachment objects are not deleted by this migration.

Replies outside the latest 100 loaded messages display “Original message unavailable.” No stale quote copy is saved. Basic chat can still load before migration; new actions require migration. Unsend/reaction errors identify the migration when the RPC is missing.

Staging checks: verify reply/react/unsend between two users for text, images, GIFs and files; ensure a third user cannot act on messages; recipients cannot change message content; blocked accounts cannot react; scrolling older messages is not interrupted by polling. Local build/static tests do not verify live permissions or visual behavior.
