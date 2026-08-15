-- Run this in the Supabase SQL Editor before enabling the admin API.
-- Admin API access is server-only through the service-role key.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  email text not null,
  role text not null default 'alumni' check (role in ('alumni', 'employer', 'staff', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'suspended')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile" on public.profiles for insert with check (auth.uid() = id);
alter table public.profiles add column if not exists avatar_url text;

-- Profile edits are deliberately limited to name and avatar. Roles and account
-- status remain server-managed.
create or replace function public.update_own_profile(p_first_name text, p_last_name text, p_avatar_url text)
returns public.profiles
language plpgsql
security definer set search_path = public
as $$
declare updated_profile public.profiles;
begin
  update public.profiles
  set first_name = nullif(trim(p_first_name), ''),
      last_name = nullif(trim(p_last_name), ''),
      avatar_url = nullif(trim(p_avatar_url), '')
  where id = auth.uid()
  returning * into updated_profile;
  if updated_profile is null then raise exception 'Profile not found'; end if;
  return updated_profile;
end;
$$;
revoke all on function public.update_own_profile(text, text, text) from public;
grant execute on function public.update_own_profile(text, text, text) to authenticated;

-- Always create a profile when an Auth user is created. This runs with the
-- database owner's privileges, so it also works when email confirmation means
-- the browser does not yet have an authenticated session.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.email
  )
  on conflict (id) do update set
    first_name = coalesce(public.profiles.first_name, excluded.first_name),
    last_name = coalesce(public.profiles.last_name, excluded.last_name),
    email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- A user submits graduation evidence from their profile. Government IDs are
-- intentionally not collected for alumni verification.
create table if not exists public.alumni_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  graduation_name text not null,
  graduation_year smallint not null check (graduation_year between 1900 and 2100),
  graduation_date date,
  batch_name text,
  program text not null,
  document_path text not null,
  document_filename text not null,
  status text not null default 'pending' check (status in ('pending', 'needs_information', 'verified', 'rejected')),
  reviewer_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists alumni_verifications_user_created_at_idx on public.alumni_verifications (user_id, created_at desc);
create index if not exists alumni_verifications_status_created_at_idx on public.alumni_verifications (status, created_at);

-- Allows existing installations to adopt the graduation-date and batch-name fields.
alter table public.alumni_verifications add column if not exists graduation_date date;
alter table public.alumni_verifications add column if not exists batch_name text;

alter table public.alumni_verifications enable row level security;
drop policy if exists "Users can view their own verification submissions" on public.alumni_verifications;
create policy "Users can view their own verification submissions" on public.alumni_verifications
  for select using (auth.uid() = user_id);
drop policy if exists "Users can submit their own verification" on public.alumni_verifications;
create policy "Users can submit their own verification" on public.alumni_verifications
  for insert with check (auth.uid() = user_id and status = 'pending');

-- Private evidence storage. Users can only upload/read files in their own
-- folder; the server-side admin client can review them without exposing URLs.
insert into storage.buckets (id, name, public)
values ('verification-documents', 'verification-documents', false)
on conflict (id) do update set public = false;
drop policy if exists "Users can upload their own verification evidence" on storage.objects;
create policy "Users can upload their own verification evidence" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'verification-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can view their own verification evidence" on storage.objects;
create policy "Users can view their own verification evidence" on storage.objects
  for select to authenticated
  using (bucket_id = 'verification-documents' and (storage.foldername(name))[1] = auth.uid()::text);

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do update set public = true;
drop policy if exists "Users can upload their own profile avatar" on storage.objects;
create policy "Users can upload their own profile avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Community feed. Posts are intentionally empty on installation: all content
-- comes from signed-in alumni, rather than seeded/demo data.
create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  author_avatar_url text,
  content text not null default '' check (char_length(content) <= 2000),
  media_path text,
  created_at timestamptz not null default now(),
  check (char_length(trim(content)) > 0 or media_path is not null)
);
create index if not exists feed_posts_created_at_idx on public.feed_posts (created_at desc);
alter table public.feed_posts enable row level security;
drop policy if exists "Authenticated users can view feed posts" on public.feed_posts;
create policy "Authenticated users can view feed posts" on public.feed_posts
  for select to authenticated using (true);
drop policy if exists "Users can publish their own feed posts" on public.feed_posts;
create policy "Users can publish their own feed posts" on public.feed_posts
  for insert to authenticated with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('feed-media', 'feed-media', true)
on conflict (id) do update set public = true;
drop policy if exists "Users can upload their own feed media" on storage.objects;
create policy "Users can upload their own feed media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feed-media' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.system_settings (
  id smallint primary key default 1 check (id = 1),
  institution_name text not null default 'AlumniConnect',
  contact_email text not null default 'admin@example.edu',
  allow_open_signups boolean not null default true,
  verify_domain boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
insert into public.system_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.admin_resources (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('jobs', 'events', 'news', 'reports', 'surveys')),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_resources_type_created_at_idx on public.admin_resources (resource_type, created_at desc);

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs (created_at desc);

alter table public.system_settings enable row level security;
alter table public.admin_resources enable row level security;
alter table public.admin_audit_logs enable row level security;
