Chat media and settings

Apply supabase/migrations/20260908_chat_media_settings.sql in Supabase SQL Editor after the community, batch community, batch message actions, and direct message actions migrations. This is an additive migration; existing messages remain intact. The client changes do not apply SQL automatically.

Both chat types have a three-dot menu with Images, Pinned messages, Chat name, Nicknames, and Cover photo. Settings are shared with conversation participants and refresh within five seconds. A blank name/nickname restores the default. Batch chat names are conversation titles, separate from the alumni batch directory name. Leaving a group uses the existing batch membership removal, so the UI explains that batch access is also removed.

Group chats can upload JPEG, PNG, WebP and animated GIF images (15 MB maximum), and select GIFs from the existing /api/gifs service. GIPHY requires the existing server configuration. Images and pins query the complete conversation in pages, independently of the latest 100-message window. Unsent messages are excluded. Private uploads use expiring signed URLs; reopen a chat or gallery to refresh links.

Validation: run npm.cmd --workspace client run build and npm.cmd --workspace server test. Live verification requires the migration and two verified accounts: send photos/GIFs in both chat types, open links, set and clear names/nicknames, upload covers, pin/unpin old and new messages, unsend media, and leave a group. Confirm a nonparticipant cannot read settings/media or pin a message and a departed member loses access. Previously issued signed URLs expire after one hour.
