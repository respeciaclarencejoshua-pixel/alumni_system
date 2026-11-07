-- Align gallery_submissions.category with the collections offered by the app.
-- Run in the Supabase SQL editor for databases created before these categories
-- were added to the gallery form.
alter table public.gallery_submissions
  drop constraint if exists gallery_submissions_category_check;

alter table public.gallery_submissions
  add constraint gallery_submissions_category_check
  check (category in (
    'Campus Memories',
    'Graduation',
    'Reunion',
    'Awards & Recognition',
    'Career Milestone',
    'Entrepreneurship',
    'Community Service',
    'University Event'
  ));
