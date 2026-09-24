-- Permit PDF/TXT attachments alongside the existing comment photos.
-- Existing folder ownership policies and 10 MB limit remain in place.
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','text/plain']
where id = 'feed-media';
