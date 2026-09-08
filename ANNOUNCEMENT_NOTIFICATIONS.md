# Announcement notification rollout

Apply `supabase/migrations/20260908_announcement_notifications.sql` once, after the batch-community migration. This has not been applied remotely.

New batch announcements notify verified batch members, excluding the author. New system announcements in Community management notify all verified accounts, excluding the author. Existing announcements are not backfilled. Pinning/refreshing does not generate another alert. Legacy news articles are not treated as system announcements.

Notifications carry an announcement ID and optional batch ID. Clicking opens the corresponding page and places the target announcement first, even when outside the latest 100 entries. Removed/inaccessible announcements show an unavailable message and remain protected by RLS.

The notification bell retains realtime subscriptions and polls every 15 seconds while visible as a fallback. No unread badge has been added to the megaphone icon.

Before production: publish from a president and administrator, check another eligible account receives exactly one alert, verify unrelated batches receive none, open both links, test a deleted announcement, and confirm a former member cannot read the original batch announcement. Run on staging first. Local static tests/build do not verify live trigger execution or delivery.
