-- ============================================================
-- NDDU Alumni Management System
-- Current Supabase Database Schema
-- ============================================================

-- ============================================================
-- 1. PROFILES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  email text not null,
  role text not null default 'alumni'
    check (role in ('alumni', 'employer', 'staff', 'admin')),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'suspended')),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Security helpers are owned by the database and bypass profile RLS. Keeping
-- these checks in functions avoids recursive profile policy evaluation.
create or replace function public.is_verified_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'verified'
  );
$$;

create or replace function public.is_verified_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'verified'
      and role in ('admin', 'staff')
  );
$$;

revoke all on function public.is_verified_user() from public;
revoke all on function public.is_verified_admin() from public;
grant execute on function public.is_verified_user() to authenticated;
grant execute on function public.is_verified_admin() to authenticated;

-- Existing profile policies
drop policy if exists "Users can view their own profile"
on public.profiles;

drop policy if exists "Users can create their own profile"
on public.profiles;

drop policy if exists "Users can view own profile"
on public.profiles;

drop policy if exists "Users can create own profile"
on public.profiles;

drop policy if exists "Users can update own profile"
on public.profiles;

-- Users can view their own profile
create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

-- Users can create their own profile
create policy "Users can create own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

-- Profile edits go through update_own_profile so role, status, email, and all
-- other privileged fields cannot be changed directly by a client.
create or replace function public.update_own_profile(
  p_first_name text,
  p_last_name text,
  p_avatar_url text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
  normalized_first_name text := trim(coalesce(p_first_name, ''));
  normalized_last_name text := trim(coalesce(p_last_name, ''));
  normalized_avatar_url text := nullif(trim(coalesce(p_avatar_url, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if char_length(normalized_first_name) not between 1 and 100
    or char_length(normalized_last_name) not between 1 and 100 then
    raise exception 'First and last names must be between 1 and 100 characters.';
  end if;

  if normalized_avatar_url is not null and (
    char_length(normalized_avatar_url) > 2048
    or position(
      '/profile-avatars/' || auth.uid()::text || '/'
      in normalized_avatar_url
    ) = 0
  ) then
    raise exception 'The avatar must be uploaded to your profile-avatars folder.';
  end if;

  update public.profiles
  set first_name = normalized_first_name,
      last_name = normalized_last_name,
      avatar_url = normalized_avatar_url
  where id = auth.uid()
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Profile not found.';
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.update_own_profile(text, text, text) from public;
grant execute on function public.update_own_profile(text, text, text) to authenticated;

-- Verified alumni can view verified profiles
drop policy if exists "Verified users can view verified profiles"
on public.profiles;

create policy "Verified users can view verified profiles"
on public.profiles
for select
to authenticated
using (
  status = 'verified'
  and public.is_verified_user()
);


-- ============================================================
-- 2. EDUCATION
-- ============================================================

create table if not exists public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('alumni', 'employer')),
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);
alter table public.profile_roles enable row level security;
drop policy if exists "Users can view own community roles" on public.profile_roles;
create policy "Users can view own community roles" on public.profile_roles for select to authenticated using (profile_id = auth.uid());

create table if not exists public.employer_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  organization text not null,
  job_title text not null,
  company_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.employer_profiles enable row level security;
drop policy if exists "Users can view own employer profile" on public.employer_profiles;
create policy "Users can view own employer profile" on public.employer_profiles for select to authenticated using (profile_id = auth.uid());

create table if not exists public.education (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  degree text,
  course text,
  department text,
  graduation_year integer,
  honors text,
  batch_name text,
  created_at timestamptz not null default now()
);

alter table public.education add column if not exists batch_name text;

alter table public.education enable row level security;

drop policy if exists "Users can view own education"
on public.education;

drop policy if exists "Users can insert own education"
on public.education;

drop policy if exists "Users can update own education"
on public.education;

drop policy if exists "Users can delete own education"
on public.education;

create policy "Users can view own education"
on public.education
for select
to authenticated
using (profile_id = auth.uid());

create policy "Users can insert own education"
on public.education
for insert
to authenticated
with check (profile_id = auth.uid());

create policy "Users can update own education"
on public.education
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy "Users can delete own education"
on public.education
for delete
to authenticated
using (profile_id = auth.uid());


-- ============================================================
-- 3. ALUMNI VERIFICATIONS
-- ============================================================

create table if not exists public.alumni_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  graduation_name text not null,
  graduation_year smallint not null
    check (graduation_year between 1900 and 2100),
  graduation_date date,
  batch_name text,
  program text not null,
  document_path text not null,
  document_filename text not null,
  status text not null default 'pending'
    check (status in (
      'pending',
      'needs_information',
      'verified',
      'rejected'
    )),
  reviewer_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists alumni_verifications_user_created_at_idx
on public.alumni_verifications (user_id, created_at desc);

create index if not exists alumni_verifications_status_created_at_idx
on public.alumni_verifications (status, created_at);

alter table public.alumni_verifications enable row level security;

drop policy if exists "Users can view own verification"
on public.alumni_verifications;

drop policy if exists "Users can submit own verification"
on public.alumni_verifications;

create policy "Users can view own verification"
on public.alumni_verifications
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can submit own verification"
on public.alumni_verifications
for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
);


-- ============================================================
-- 4. COMMUNITY FEED
-- ============================================================

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  author_avatar_url text,
  content text not null default '',
  media_path text,
  created_at timestamptz not null default now(),

  check (char_length(content) <= 2000),

  check (
    char_length(trim(content)) > 0
    or media_path is not null
  )
);

create index if not exists feed_posts_created_at_idx
on public.feed_posts (created_at desc);

alter table public.feed_posts enable row level security;

drop policy if exists "Authenticated users can view feed posts"
on public.feed_posts;

drop policy if exists "Users can publish their own feed posts"
on public.feed_posts;

create policy "Authenticated users can view feed posts"
on public.feed_posts
for select
to authenticated
using (true);

create policy "Users can publish their own feed posts"
on public.feed_posts
for insert
to authenticated
with check (auth.uid() = user_id);

create table if not exists public.feed_reactions (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'celebrate', 'support')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists feed_reactions_post_id_idx
on public.feed_reactions (post_id);

alter table public.feed_reactions enable row level security;
drop policy if exists "Authenticated users can view feed reactions" on public.feed_reactions;
drop policy if exists "Users can add their own feed reactions" on public.feed_reactions;
drop policy if exists "Users can update their own feed reactions" on public.feed_reactions;
drop policy if exists "Users can remove their own feed reactions" on public.feed_reactions;
create policy "Authenticated users can view feed reactions" on public.feed_reactions for select to authenticated using (true);
create policy "Users can add their own feed reactions" on public.feed_reactions for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own feed reactions" on public.feed_reactions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can remove their own feed reactions" on public.feed_reactions for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null check (char_length(trim(author_name)) between 1 and 150),
  content text not null check (char_length(trim(content)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists feed_comments_post_created_at_idx
on public.feed_comments (post_id, created_at);

alter table public.feed_comments enable row level security;
drop policy if exists "Authenticated users can view feed comments" on public.feed_comments;
drop policy if exists "Users can add their own feed comments" on public.feed_comments;
drop policy if exists "Users can update their own feed comments" on public.feed_comments;
drop policy if exists "Users can remove their own feed comments" on public.feed_comments;
create policy "Authenticated users can view feed comments" on public.feed_comments for select to authenticated using (true);
create policy "Users can add their own feed comments" on public.feed_comments for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update their own feed comments" on public.feed_comments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can remove their own feed comments" on public.feed_comments for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.feed_saved_posts (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists feed_saved_posts_user_id_idx
on public.feed_saved_posts (user_id, created_at desc);

alter table public.feed_saved_posts enable row level security;
drop policy if exists "Users can view their own saved posts" on public.feed_saved_posts;
drop policy if exists "Users can save posts" on public.feed_saved_posts;
drop policy if exists "Users can remove their own saved posts" on public.feed_saved_posts;
create policy "Users can view their own saved posts" on public.feed_saved_posts for select to authenticated using (auth.uid() = user_id);
create policy "Users can save posts" on public.feed_saved_posts for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can remove their own saved posts" on public.feed_saved_posts for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  kind text not null check (kind in ('reaction', 'comment')),
  reaction text check (reaction is null or reaction in ('like', 'celebrate', 'support')),
  actor_name text not null,
  source_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, source_key)
);

create index if not exists notifications_recipient_created_at_idx
on public.notifications (recipient_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
on public.notifications (recipient_id, created_at desc)
where read_at is null;

alter table public.notifications enable row level security;
drop policy if exists "Users can view their own notifications" on public.notifications;
drop policy if exists "Users can mark their own notifications as read" on public.notifications;
create policy "Users can view their own notifications" on public.notifications for select to authenticated using (auth.uid() = recipient_id);
create policy "Users can mark their own notifications as read" on public.notifications for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);
revoke update on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.notify_feed_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_owner uuid;
  display_name text;
begin
  select user_id into post_owner from public.feed_posts where id = new.post_id;
  if post_owner is null or post_owner = new.user_id then
    return new;
  end if;

  select coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), 'An alumnus')
  into display_name from public.profiles where id = new.user_id;

  insert into public.notifications (recipient_id, actor_id, post_id, kind, reaction, actor_name, source_key)
  values (post_owner, new.user_id, new.post_id, 'reaction', new.reaction, coalesce(display_name, 'An alumnus'), new.post_id::text || ':' || new.user_id::text)
  on conflict (kind, source_key) do update
  set reaction = excluded.reaction,
      actor_name = excluded.actor_name,
      read_at = null,
      created_at = now();
  return new;
end;
$$;

create or replace function public.remove_feed_reaction_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where kind = 'reaction' and source_key = old.post_id::text || ':' || old.user_id::text;
  return old;
end;
$$;

create or replace function public.notify_feed_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_owner uuid;
begin
  select user_id into post_owner from public.feed_posts where id = new.post_id;
  if post_owner is null or post_owner = new.user_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, post_id, kind, actor_name, source_key)
  values (post_owner, new.user_id, new.post_id, 'comment', new.author_name, new.id::text)
  on conflict (kind, source_key) do nothing;
  return new;
end;
$$;

create or replace function public.remove_feed_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications where kind = 'comment' and source_key = old.id::text;
  return old;
end;
$$;

drop trigger if exists feed_reaction_notification_inserted on public.feed_reactions;
drop trigger if exists feed_reaction_notification_updated on public.feed_reactions;
drop trigger if exists feed_reaction_notification_deleted on public.feed_reactions;
create trigger feed_reaction_notification_inserted after insert on public.feed_reactions for each row execute function public.notify_feed_reaction();
create trigger feed_reaction_notification_updated after update of reaction on public.feed_reactions for each row execute function public.notify_feed_reaction();
create trigger feed_reaction_notification_deleted after delete on public.feed_reactions for each row execute function public.remove_feed_reaction_notification();

drop trigger if exists feed_comment_notification_inserted on public.feed_comments;
drop trigger if exists feed_comment_notification_deleted on public.feed_comments;
create trigger feed_comment_notification_inserted after insert on public.feed_comments for each row execute function public.notify_feed_comment();
create trigger feed_comment_notification_deleted after delete on public.feed_comments for each row execute function public.remove_feed_comment_notification();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- ============================================================
-- 11. CURATED ALUMNI GALLERY
-- ============================================================

create table if not exists public.gallery_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 10 and 1500),
  category text not null check (category in ('Campus Memories','Graduation','Reunion','Alumni Achievement','University Event','Community Service')),
  photo_date date,
  batch_year smallint check (batch_year is null or batch_year between 1953 and 2100),
  people_names text,
  image_path text not null,
  status text not null default 'pending' check (status in ('pending','needs_information','approved','rejected')),
  reviewer_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  featured boolean not null default false,
  ownership_confirmed boolean not null check (ownership_confirmed),
  consent_confirmed boolean not null check (consent_confirmed),
  created_at timestamptz not null default now()
);
create index if not exists gallery_submissions_status_created_idx on public.gallery_submissions(status, created_at desc);
alter table public.gallery_submissions enable row level security;
drop policy if exists "Users can view own gallery submissions" on public.gallery_submissions;
drop policy if exists "Verified users can submit gallery photos" on public.gallery_submissions;
create policy "Users can view own gallery submissions" on public.gallery_submissions for select to authenticated using (user_id = auth.uid());
create policy "Verified users can submit gallery photos" on public.gallery_submissions for insert to authenticated with check (user_id = auth.uid() and status = 'pending' and public.is_verified_user());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('gallery-media','gallery-media',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Users can upload own gallery media" on storage.objects;
drop policy if exists "Users can view own gallery media" on storage.objects;
create policy "Users can upload own gallery media" on storage.objects for insert to authenticated with check (bucket_id='gallery-media' and (storage.foldername(name))[1]=auth.uid()::text and public.is_verified_user());
create policy "Users can view own gallery media" on storage.objects for select to authenticated using (bucket_id='gallery-media' and (storage.foldername(name))[1]=auth.uid()::text);


-- ============================================================
-- 5. OPPORTUNITIES
-- ============================================================

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  category text not null check (category in ('jobs', 'internships', 'scholarships', 'freelance')),
  title text not null check (char_length(trim(title)) between 2 and 180),
  company_name text not null check (char_length(trim(company_name)) between 2 and 180),
  location text not null,
  description text not null check (char_length(trim(description)) between 10 and 4000),
  requirements text not null default '' check (char_length(requirements) <= 4000),
  tags text[] not null default '{}',
  application_url text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists opportunities_active_created_at_idx on public.opportunities (status, created_at desc);
alter table public.opportunities enable row level security;
drop policy if exists "Authenticated users can view opportunities" on public.opportunities;
drop policy if exists "Users can post opportunities" on public.opportunities;
create policy "Authenticated users can view opportunities" on public.opportunities for select to authenticated using (true);
create policy "Users can post opportunities" on public.opportunities for insert to authenticated with check (auth.uid() = user_id);

create table if not exists public.opportunity_applications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check (response in ('applied', 'interested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, user_id)
);
create index if not exists opportunity_applications_opportunity_idx on public.opportunity_applications (opportunity_id);
alter table public.opportunity_applications enable row level security;
drop policy if exists "Users can view own opportunity responses" on public.opportunity_applications;
drop policy if exists "Users can add own opportunity responses" on public.opportunity_applications;
drop policy if exists "Users can update own opportunity responses" on public.opportunity_applications;
create policy "Users can view own opportunity responses" on public.opportunity_applications for select to authenticated using (auth.uid() = user_id);
create policy "Users can add own opportunity responses" on public.opportunity_applications for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own opportunity responses" on public.opportunity_applications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace view public.opportunity_application_counts as
select opportunity_id, count(*) filter (where response = 'applied')::integer as applicant_count,
  count(*) filter (where response = 'interested')::integer as interested_count
from public.opportunity_applications group by opportunity_id;
grant select on public.opportunity_application_counts to authenticated;

-- ============================================================
-- 6. SYSTEM SETTINGS
-- ============================================================

create table if not exists public.system_settings (
  id smallint primary key default 1
    check (id = 1),

  institution_name text not null default 'NDDU AlumniConnect',

  contact_email text not null default 'admin@example.edu',

  allow_open_signups boolean not null default true,

  verify_domain boolean not null default false,

  updated_at timestamptz not null default now(),

  updated_by uuid references public.profiles(id)
);

insert into public.system_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.system_settings enable row level security;


-- ============================================================
-- 6. ADMIN RESOURCES
-- ============================================================

create table if not exists public.admin_resources (
  id uuid primary key default gen_random_uuid(),

  resource_type text not null
    check (
      resource_type in (
        'jobs',
        'events',
        'news',
        'reports',
        'surveys'
      )
    ),

  payload jsonb not null default '{}'::jsonb,

  created_by uuid not null references public.profiles(id),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);

create index if not exists admin_resources_type_created_at_idx
on public.admin_resources (resource_type, created_at desc);

alter table public.admin_resources enable row level security;

-- Allow authenticated users to read all events (publicly viewable resource)
drop policy if exists "Anyone can view events" on public.admin_resources;

create policy "Anyone can view events"
on public.admin_resources
for select
to authenticated
using (resource_type = 'events');

-- Allow admins to create resources
drop policy if exists "Admins can create resources" on public.admin_resources;

create policy "Admins can create resources"
on public.admin_resources
for insert
to authenticated
with check (auth.uid() = created_by);

-- Allow admins to update their own resources
drop policy if exists "Admins can update resources" on public.admin_resources;

create policy "Admins can update resources"
on public.admin_resources
for update
to authenticated
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

-- Event responses are kept separately so attendee identities remain private
-- from alumni while administrators can manage engagement.
create table if not exists public.event_interests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.admin_resources(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index if not exists event_interests_event_id_idx on public.event_interests (event_id);
alter table public.event_interests enable row level security;
drop policy if exists "Users can view own event interests" on public.event_interests;
drop policy if exists "Users can add own event interests" on public.event_interests;
drop policy if exists "Users can remove own event interests" on public.event_interests;
create policy "Users can view own event interests" on public.event_interests for select to authenticated using (auth.uid() = user_id);
create policy "Users can add own event interests" on public.event_interests for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can remove own event interests" on public.event_interests for delete to authenticated using (auth.uid() = user_id);


-- ============================================================
-- 7. ADMIN AUDIT LOGS
-- ============================================================

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,

  actor_id uuid not null references public.profiles(id),

  action text not null,

  target_type text not null,

  target_id text,

  details jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
on public.admin_audit_logs (created_at desc);

alter table public.admin_audit_logs enable row level security;

-- ============================================================
-- 14. CONNECTED ADMIN OPERATIONS
-- Additive workflow tables used by moderation, events, permissions,
-- recovery, and the unified administrative attention queue.
-- ============================================================

alter table public.profiles add column if not exists locked_until timestamptz;
alter table public.profiles add column if not exists suspension_reason text;
alter table public.profiles add column if not exists deactivated_at timestamptz;
alter table public.profiles add column if not exists suspension_expires_at timestamptz;
alter table public.profiles add column if not exists account_source text not null default 'self_registration';
alter table public.profiles add column if not exists last_active_at timestamptz;

alter table public.alumni_verifications drop constraint if exists alumni_verifications_status_check;
alter table public.alumni_verifications add constraint alumni_verifications_status_check check(status in ('pending','under_review','needs_information','verified','rejected','expired'));
alter table public.alumni_verifications add column if not exists assigned_to uuid references public.profiles(id);
alter table public.alumni_verifications add column if not exists priority text not null default 'normal' check(priority in ('low','normal','high','urgent'));
alter table public.alumni_verifications add column if not exists expires_at timestamptz;
alter table public.alumni_verifications add column if not exists retention_delete_at timestamptz;
alter table public.alumni_verifications add column if not exists document_deleted_at timestamptz;
alter table public.alumni_verifications add column if not exists scan_status text not null default 'pending' check(scan_status in ('pending','clean','flagged','failed'));
alter table public.alumni_verifications add column if not exists file_size_bytes bigint;
alter table public.alumni_verifications add column if not exists mime_type text;

create table if not exists public.verification_document_accesses(id uuid primary key default gen_random_uuid(),verification_id uuid not null references public.alumni_verifications(id) on delete cascade,accessed_by uuid not null references public.profiles(id),action text not null check(action in ('view','replace','delete')),created_at timestamptz not null default now());
create index if not exists verification_document_access_idx on public.verification_document_accesses(verification_id,created_at desc);
alter table public.verification_document_accesses enable row level security;

create table if not exists public.account_notifications(id uuid primary key default gen_random_uuid(),recipient_id uuid not null references public.profiles(id) on delete cascade,kind text not null,subject text not null,message text not null,read_at timestamptz,created_at timestamptz not null default now());
create index if not exists account_notifications_recipient_idx on public.account_notifications(recipient_id,created_at desc);
alter table public.account_notifications enable row level security;
drop policy if exists "Users view own account notifications" on public.account_notifications;
create policy "Users view own account notifications" on public.account_notifications for select to authenticated using(recipient_id=auth.uid());
create or replace function public.notify_verification_received() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.account_notifications(recipient_id,kind,subject,message) values(new.user_id,'verification_received','Verification received','Your graduation evidence was received and is waiting for review.');return new;end;$$;
drop trigger if exists verification_received_notification on public.alumni_verifications;
create trigger verification_received_notification after insert on public.alumni_verifications for each row execute function public.notify_verification_received();
drop policy if exists "Users replace own verification document" on public.alumni_verifications;
create policy "Users replace own verification document" on public.alumni_verifications for update to authenticated using(user_id=auth.uid() and status='needs_information') with check(user_id=auth.uid() and status='pending');

alter table public.opportunities drop constraint if exists opportunities_status_check;
alter table public.opportunities add constraint opportunities_status_check check (status in ('draft','submitted','under_review','needs_changes','approved','active','paused','expired','archived','rejected'));
alter table public.opportunities alter column status set default 'submitted';
alter table public.opportunities add column if not exists employment_type text;
alter table public.opportunities add column if not exists work_arrangement text;
alter table public.opportunities add column if not exists salary_range text;
alter table public.opportunities add column if not exists application_deadline date;
alter table public.opportunities add column if not exists reviewer_note text;
alter table public.opportunities add column if not exists reviewed_by uuid references public.profiles(id);
alter table public.opportunities add column if not exists reviewed_at timestamptz;
alter table public.opportunities add column if not exists featured boolean not null default false;
alter table public.opportunities drop constraint if exists opportunities_status_check;
alter table public.opportunities add constraint opportunities_status_check check(status in ('draft','submitted','under_review','needs_changes','approved','published','active','paused','expired','archived','rejected'));
alter table public.opportunities add column if not exists required_experience text;
alter table public.opportunities add column if not exists required_course text;
alter table public.opportunities add column if not exists required_department text;
alter table public.opportunities add column if not exists contact_person text;
alter table public.opportunities add column if not exists contact_email text;
alter table public.opportunities add column if not exists openings integer check(openings is null or openings>0);
alter table public.opportunities add column if not exists industry text;
alter table public.opportunities add column if not exists view_count integer not null default 0;
alter table public.opportunities add column if not exists published_at timestamptz;
alter table public.opportunities add column if not exists fraud_reported_at timestamptz;

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('feed_post','feed_comment','gallery_submission','direct_message','member')),
  target_id text not null,
  reason text not null check (reason in ('spam','harassment','inappropriate','misinformation','privacy','copyright','scam','other')),
  details text,
  status text not null default 'open' check (status in ('open','under_review','resolved','dismissed')),
  assigned_to uuid references public.profiles(id),
  resolution text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists content_reports_status_created_idx on public.content_reports(status,created_at desc);
alter table public.content_reports enable row level security;
drop policy if exists "Users can create reports" on public.content_reports;
drop policy if exists "Users can view own reports" on public.content_reports;
create policy "Users can create reports" on public.content_reports for insert to authenticated with check (reporter_id=auth.uid());
create policy "Users can view own reports" on public.content_reports for select to authenticated using (reporter_id=auth.uid());

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.content_reports(id) on delete set null,
  target_type text not null,
  target_id text not null,
  action text not null check (action in ('keep','hide','restore','remove','warn','lock_comments','suspend','escalate')),
  reason text not null,
  actor_id uuid not null references public.profiles(id),
  reversible_until timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists moderation_actions_target_idx on public.moderation_actions(target_type,target_id,created_at desc);
alter table public.moderation_actions enable row level security;

-- Moderation lifecycle and recoverable content removal.
alter table public.feed_posts add column if not exists moderation_status text not null default 'published';
alter table public.feed_posts drop constraint if exists feed_posts_moderation_status_check;
alter table public.feed_posts add constraint feed_posts_moderation_status_check check (moderation_status in ('published','hidden','removed'));
alter table public.feed_posts add column if not exists comments_locked boolean not null default false;
alter table public.feed_posts add column if not exists reactions_disabled boolean not null default false;
alter table public.feed_posts add column if not exists deleted_at timestamptz;
alter table public.feed_posts add column if not exists deletion_reason text;
alter table public.feed_posts add column if not exists deleted_by uuid references public.profiles(id);
create index if not exists feed_posts_moderation_status_idx on public.feed_posts(moderation_status,created_at desc);
alter table public.feed_comments add column if not exists moderation_status text not null default 'published';
alter table public.feed_comments drop constraint if exists feed_comments_moderation_status_check;
alter table public.feed_comments add constraint feed_comments_moderation_status_check check (moderation_status in ('published','hidden','removed'));
alter table public.feed_comments add column if not exists deleted_at timestamptz;
alter table public.feed_comments add column if not exists deletion_reason text;

alter table public.profiles add column if not exists warnings_count integer not null default 0;

alter table public.gallery_submissions drop constraint if exists gallery_submissions_status_check;
alter table public.gallery_submissions add constraint gallery_submissions_status_check check (status in ('pending','needs_information','approved','rejected','archived'));
alter table public.gallery_submissions add column if not exists batch_name text;
alter table public.gallery_submissions add column if not exists featured_rank integer;
alter table public.gallery_submissions add column if not exists featured_starts_at timestamptz;
alter table public.gallery_submissions add column if not exists featured_ends_at timestamptz;
alter table public.gallery_submissions add column if not exists archived_at timestamptz;

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in ('keep','hide','restore','remove','warn','lock_comments','unlock_comments','disable_reactions','enable_reactions','suspend','escalate','feature','unfeature','archive'));

-- Enforce moderation restrictions at the database boundary, not only in the UI.
drop policy if exists "Users can add their own feed reactions" on public.feed_reactions;
drop policy if exists "Users can update their own feed reactions" on public.feed_reactions;
create policy "Users can add their own feed reactions" on public.feed_reactions for insert to authenticated
with check (auth.uid()=user_id and exists(select 1 from public.feed_posts p where p.id=post_id and p.moderation_status='published' and not p.reactions_disabled));
create policy "Users can update their own feed reactions" on public.feed_reactions for update to authenticated
using (auth.uid()=user_id) with check (auth.uid()=user_id and exists(select 1 from public.feed_posts p where p.id=post_id and p.moderation_status='published' and not p.reactions_disabled));
drop policy if exists "Users can add their own feed comments" on public.feed_comments;
create policy "Users can add their own feed comments" on public.feed_comments for insert to authenticated
with check (auth.uid()=user_id and exists(select 1 from public.feed_posts p where p.id=post_id and p.moderation_status='published' and not p.comments_locked));
drop policy if exists "Authenticated users can view feed comments" on public.feed_comments;
create policy "Authenticated users can view feed comments" on public.feed_comments for select to authenticated
using (moderation_status='published' or user_id=auth.uid());
drop policy if exists "Authenticated users can view feed posts" on public.feed_posts;
create policy "Authenticated users can view feed posts" on public.feed_posts for select to authenticated
using ((moderation_status='published' and deleted_at is null) or user_id=auth.uid());

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.admin_resources(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered','waitlisted','cancelled','attended','no_show')),
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(event_id,user_id)
);
alter table public.event_registrations add column if not exists qr_token uuid not null default gen_random_uuid();
alter table public.event_registrations add column if not exists feedback_rating smallint check(feedback_rating between 1 and 5);
alter table public.event_registrations add column if not exists feedback_text text;
alter table public.event_registrations add column if not exists reminder_sent_at timestamptz;

create table if not exists public.system_incidents (
  id uuid primary key default gen_random_uuid(),
  service text not null check(service in ('api','email','upload','database','storage','external')),
  summary text not null,
  details text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists system_incidents_open_idx on public.system_incidents(resolved_at,created_at desc);
alter table public.system_incidents enable row level security;
create index if not exists event_registrations_event_status_idx on public.event_registrations(event_id,status);
alter table public.event_registrations enable row level security;
drop policy if exists "Users manage own event registrations" on public.event_registrations;
create policy "Users manage own event registrations" on public.event_registrations for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create or replace function public.apply_event_capacity() returns trigger language plpgsql security definer set search_path=public as $$ declare maximum integer; active_count integer; begin select nullif(payload->>'capacity','')::integer into maximum from public.admin_resources where id=new.event_id and resource_type='events';if maximum is not null then select count(*) into active_count from public.event_registrations where event_id=new.event_id and status in('registered','attended');if active_count>=maximum then new.status:='waitlisted';end if;end if;return new;end;$$;
drop trigger if exists event_capacity_waitlist on public.event_registrations;
create trigger event_capacity_waitlist before insert on public.event_registrations for each row execute function public.apply_event_capacity();
create or replace function public.notify_event_registration() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.account_notifications(recipient_id,kind,subject,message) values(new.user_id,'event_registration','Event registration received',case when new.status='waitlisted' then 'The event is full and you have been added to the waitlist.' else 'Your event registration is confirmed.' end);return new;end;$$;
drop trigger if exists event_registration_notification on public.event_registrations;
create trigger event_registration_notification after insert on public.event_registrations for each row execute function public.notify_event_registration();

create table if not exists public.admin_permissions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  scopes text[] not null default '{}',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.admin_permissions enable row level security;

alter table public.system_settings add column if not exists session_timeout_minutes integer not null default 60;
alter table public.system_settings add column if not exists require_admin_mfa boolean not null default false;
alter table public.system_settings add column if not exists content_retention_days integer not null default 30;
alter table public.system_settings add column if not exists maintenance_mode boolean not null default false;
alter table public.system_settings add column if not exists approved_email_domains text[] not null default '{}';
alter table public.system_settings add column if not exists captcha_provider text default 'turnstile';
alter table public.system_settings add column if not exists captcha_enabled boolean not null default true;
alter table public.system_settings add column if not exists upload_max_mb integer not null default 10;
alter table public.system_settings add column if not exists allowed_file_types text[] not null default array['image/jpeg','image/png','image/webp','application/pdf'];
alter table public.system_settings add column if not exists verification_document_retention_days integer not null default 30;
alter table public.system_settings add column if not exists moderation_reasons text[] not null default array['spam','harassment','inappropriate','misinformation','privacy','copyright','scam','other'];
alter table public.system_settings add column if not exists rate_limit_per_minute integer not null default 60;
alter table public.system_settings add column if not exists email_templates jsonb not null default '{}'::jsonb;
alter table public.system_settings add column if not exists backup_status text default 'not_configured';
alter table public.system_settings add column if not exists storage_usage_bytes bigint not null default 0;
alter table public.admin_permissions add column if not exists admin_role text not null default 'analyst' check(admin_role in ('super_admin','alumni_officer','content_moderator','career_officer','events_officer','analyst'));


-- ============================================================
-- 8. AUTOMATIC PROFILE CREATION
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin

  insert into public.profiles (
    id,
    first_name,
    last_name,
    email,
    role
  )

  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.email,
    case
      when coalesce(new.raw_user_meta_data -> 'roles', '[]'::jsonb) ? 'alumni' then 'alumni'
      when coalesce(new.raw_user_meta_data -> 'roles', '[]'::jsonb) ? 'employer' then 'employer'
      else 'alumni'
    end
  )

  on conflict (id) do update set
    first_name = coalesce(
      public.profiles.first_name,
      excluded.first_name
    ),

    last_name = coalesce(
      public.profiles.last_name,
      excluded.last_name
    ),

    email = excluded.email;

  insert into public.profile_roles (profile_id, role)
  select new.id, selected_role
  from jsonb_array_elements_text(coalesce(new.raw_user_meta_data -> 'roles', '["alumni"]'::jsonb)) as selected_role
  where selected_role in ('alumni', 'employer')
  on conflict (profile_id, role) do nothing;

  if coalesce(new.raw_user_meta_data -> 'roles', '[]'::jsonb) ? 'employer' then
    insert into public.employer_profiles (profile_id, organization, job_title, company_email)
    values (
      new.id,
      nullif(trim(new.raw_user_meta_data ->> 'organization'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'job_title'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'company_email'), '')
    );
  end if;

  if nullif(new.raw_user_meta_data ->> 'course', '') is not null then
    insert into public.education (
      profile_id, degree, course, department, graduation_year, honors, batch_name
    ) values (
      new.id,
      nullif(new.raw_user_meta_data ->> 'degree', ''),
      nullif(new.raw_user_meta_data ->> 'course', ''),
      nullif(new.raw_user_meta_data ->> 'department', ''),
      case
        when (new.raw_user_meta_data ->> 'graduation_year') ~ '^\d{4}$'
          then (new.raw_user_meta_data ->> 'graduation_year')::integer
        else null
      end,
      nullif(new.raw_user_meta_data ->> 'honors', ''),
      nullif(new.raw_user_meta_data ->> 'batch_name', '')
    );
  end if;

  return new;

end;
$$;


drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();


-- ============================================================
-- 9. STORAGE BUCKETS AND POLICIES
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-avatars', 'profile-avatars', true, 2097152,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('feed-media', 'feed-media', true, 10485760,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-documents', 'verification-documents', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png']),
  ('event-images', 'event-images', true, 10485760,
    array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view profile avatars" on storage.objects;
drop policy if exists "Users can upload own profile avatars" on storage.objects;
drop policy if exists "Users can update own profile avatars" on storage.objects;
drop policy if exists "Users can delete own profile avatars" on storage.objects;
create policy "Public can view profile avatars" on storage.objects
for select to public using (bucket_id = 'profile-avatars');
create policy "Users can upload own profile avatars" on storage.objects
for insert to authenticated with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Users can update own profile avatars" on storage.objects
for update to authenticated using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Users can delete own profile avatars" on storage.objects
for delete to authenticated using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Public can view feed media" on storage.objects;
drop policy if exists "Users can upload own feed media" on storage.objects;
drop policy if exists "Users can update own feed media" on storage.objects;
drop policy if exists "Users can delete own feed media" on storage.objects;
create policy "Public can view feed media" on storage.objects
for select to public using (bucket_id = 'feed-media');
create policy "Users can upload own feed media" on storage.objects
for insert to authenticated with check (
  bucket_id = 'feed-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Users can update own feed media" on storage.objects
for update to authenticated using (
  bucket_id = 'feed-media'
  and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'feed-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Users can delete own feed media" on storage.objects
for delete to authenticated using (
  bucket_id = 'feed-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can view own verification documents" on storage.objects;
drop policy if exists "Users can upload own verification documents" on storage.objects;
drop policy if exists "Users can delete own verification documents" on storage.objects;
create policy "Users can view own verification documents" on storage.objects
for select to authenticated using (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Users can upload own verification documents" on storage.objects
for insert to authenticated with check (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Users can delete own verification documents" on storage.objects
for delete to authenticated using (
  bucket_id = 'verification-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Public can view event images" on storage.objects;
drop policy if exists "Admins can upload event images" on storage.objects;
drop policy if exists "Admins can update event images" on storage.objects;
drop policy if exists "Admins can delete event images" on storage.objects;
create policy "Public can view event images" on storage.objects
for select to public using (bucket_id = 'event-images');
create policy "Admins can upload event images" on storage.objects
for insert to authenticated with check (
  bucket_id = 'event-images'
  and public.is_verified_admin()
);
create policy "Admins can update event images" on storage.objects
for update to authenticated using (
  bucket_id = 'event-images'
  and public.is_verified_admin()
) with check (
  bucket_id = 'event-images'
  and public.is_verified_admin()
);
create policy "Admins can delete event images" on storage.objects
for delete to authenticated using (
  bucket_id = 'event-images'
  and public.is_verified_admin()
);


-- ============================================================
-- END OF SCHEMA
-- ============================================================

-- ============================================================
-- 10. PRIVATE ALUMNI CHAT
-- ============================================================

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);

alter table public.direct_messages add column if not exists message_type text not null default 'text';
alter table public.direct_messages add column if not exists attachment_url text;
alter table public.direct_messages add column if not exists attachment_name text;
alter table public.direct_messages add column if not exists attachment_type text;
alter table public.direct_messages drop constraint if exists direct_messages_body_check;
alter table public.direct_messages alter column body set default '';
alter table public.direct_messages add constraint direct_messages_body_check check (
  message_type in ('text', 'image', 'file', 'gif')
  and char_length(body) <= 2000
  and (char_length(trim(body)) > 0 or attachment_url is not null)
);

create index if not exists direct_messages_sender_recipient_created_idx
on public.direct_messages (sender_id, recipient_id, created_at);
create index if not exists direct_messages_recipient_unread_idx
on public.direct_messages (recipient_id, created_at desc) where read_at is null;

alter table public.direct_messages enable row level security;
drop policy if exists "Participants can view direct messages" on public.direct_messages;
drop policy if exists "Users can send direct messages" on public.direct_messages;
drop policy if exists "Recipients can mark messages read" on public.direct_messages;
create policy "Participants can view direct messages" on public.direct_messages
for select to authenticated using (auth.uid() in (sender_id, recipient_id));
create policy "Users can send direct messages" on public.direct_messages
for insert to authenticated with check (auth.uid() = sender_id and recipient_id <> auth.uid());
create policy "Recipients can mark messages read" on public.direct_messages
for update to authenticated using (auth.uid() = recipient_id)
with check (auth.uid() = recipient_id and sender_id <> auth.uid());

-- Returns only public chat-directory fields; email and other profile data stay private.
create or replace function public.list_chat_profiles()
returns table (
  id uuid, first_name text, last_name text, avatar_url text, role text,
  unread_count bigint, last_message_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.last_name, p.avatar_url, p.role,
    count(dm.id) filter (where dm.recipient_id = auth.uid() and dm.read_at is null) as unread_count,
    max(dm.created_at) as last_message_at
  from public.profiles p
  left join public.direct_messages dm
    on (dm.sender_id = p.id and dm.recipient_id = auth.uid())
    or (dm.recipient_id = p.id and dm.sender_id = auth.uid())
  where auth.uid() is not null and p.id <> auth.uid() and p.status <> 'suspended'
  group by p.id, p.first_name, p.last_name, p.avatar_url, p.role
  order by max(dm.created_at) desc nulls last, lower(coalesce(p.first_name, '')), lower(coalesce(p.last_name, ''));
$$;

revoke all on function public.list_chat_profiles() from public;
grant execute on function public.list_chat_profiles() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 15728640,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain',
    'application/zip','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload own chat attachments" on storage.objects;
drop policy if exists "Participants can view chat attachments" on storage.objects;
create policy "Users can upload own chat attachments" on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "Participants can view chat attachments" on storage.objects for select to authenticated using (
  bucket_id = 'chat-attachments' and exists (
    select 1 from public.direct_messages m
    where m.attachment_url = name and auth.uid() in (m.sender_id, m.recipient_id)
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end;
$$;
