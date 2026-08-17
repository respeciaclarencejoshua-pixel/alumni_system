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

-- Users can update their own profile
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Verified alumni can view verified profiles
drop policy if exists "Verified users can view verified profiles"
on public.profiles;

create policy "Verified users can view verified profiles"
on public.profiles
for select
to authenticated
using (status = 'verified');


-- ============================================================
-- 2. EDUCATION
-- ============================================================

create table if not exists public.education (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  degree text,
  course text,
  department text,
  graduation_year integer,
  honors text,
  created_at timestamptz not null default now()
);

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


-- ============================================================
-- 5. SYSTEM SETTINGS
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
    email
  )

  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.email
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
-- END OF SCHEMA
-- ============================================================