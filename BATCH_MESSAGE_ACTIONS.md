# Batch message actions

Apply `supabase/migrations/20260908_batch_message_actions.sql` once after the batch-community migration. It has not been applied remotely.

Adds reply references, one emoji reaction per member/message, and author-only unsend. Clicking the same emoji removes your reaction; selecting another replaces it. Unsend overwrites the original body with a marker and removes reactions. Reply previews read the referenced message instead of storing a second copy of its text. A new reply to an already-unsent message is rejected.

The chat shows names/photos for current batch members, including yourself. A departed/unavailable member uses the alumni placeholder. No private contact information is fetched.

Staging checks: two members send/reply/react; verify both accounts update, reactions toggle, another batch cannot access/react/reply, another member cannot unsend someone else's message, and unsending also removes the quote text in replies after refresh. Chat uses the existing five-second polling, so changes are not instantaneous. Previously read messages or screenshots cannot be recalled.

Local build/static tests do not replace live Supabase permissions and browser testing. These actions apply to batch chats only; direct-message functionality is unchanged.
