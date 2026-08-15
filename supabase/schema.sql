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
