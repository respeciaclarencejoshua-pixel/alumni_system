-- Apply once after schema.sql. Run separately from other schema changes.
begin;
set local lock_timeout = '5s';

create function public.community_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and status='verified')
    and (not coalesce((select require_admin_mfa from public.system_settings limit 1), false) or auth.jwt()->>'aal'='aal2')
    and to_timestamp(coalesce((auth.jwt()->>'iat')::double precision,0)) > now() - make_interval(mins => least(1440,greatest(15,coalesce((select session_timeout_minutes from public.system_settings limit 1),60))));
$$;
revoke all on function public.community_manager() from public;
grant execute on function public.community_manager() to authenticated;

create table public.alumni_spaces (
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(name) between 3 and 100),
 description text not null default '' check(char_length(description)<=1000),
 created_at timestamptz not null default now()
);
create table public.alumni_space_members (
 space_id uuid references public.alumni_spaces on delete cascade,
 user_id uuid references auth.users on delete cascade,
 primary key(space_id,user_id)
);
create table public.alumni_service_items (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('announcement','discussion','request')),
 author_id uuid not null default auth.uid() references auth.users on delete cascade,
 space_id uuid references public.alumni_spaces on delete cascade,
 title text not null check(char_length(title) between 3 and 160),
 body text not null check(char_length(body) between 1 and 5000),
 category text not null default 'General assistance' check(category in ('General assistance','Record correction','Document inquiry')),
 status text not null default 'submitted' check(status in ('submitted','reviewing','needs_information','completed')),
 pinned boolean not null default false,
 created_at timestamptz not null default now(),
 check((kind='discussion' and space_id is not null) or (kind<>'discussion' and space_id is null)),
 check(kind='announcement' or not pinned)
);
create index on public.alumni_service_items(kind,created_at desc);
create index on public.alumni_service_items(author_id);
create table public.alumni_service_replies (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.alumni_service_items on delete cascade,
 author_id uuid not null default auth.uid() references auth.users on delete cascade,
 body text not null check(char_length(body) between 1 and 3000),
 created_at timestamptz not null default now()
);
create index on public.alumni_service_replies(item_id,created_at);

alter table public.alumni_spaces enable row level security;
alter table public.alumni_space_members enable row level security;
alter table public.alumni_service_items enable row level security;
alter table public.alumni_service_replies enable row level security;
revoke all on public.alumni_spaces, public.alumni_space_members, public.alumni_service_items, public.alumni_service_replies from public, anon, authenticated;
grant select,insert on public.alumni_spaces, public.alumni_space_members, public.alumni_service_items, public.alumni_service_replies to authenticated;
grant delete on public.alumni_space_members to authenticated;
grant update(status,pinned) on public.alumni_service_items to authenticated;

create policy spaces_read on public.alumni_spaces for select to authenticated using(public.is_verified_user());
create policy spaces_create on public.alumni_spaces for insert to authenticated with check(public.community_manager());
create policy membership_read on public.alumni_space_members for select to authenticated using(user_id=auth.uid());
create policy membership_join on public.alumni_space_members for insert to authenticated with check(user_id=auth.uid() and public.is_verified_user());
create policy membership_leave on public.alumni_space_members for delete to authenticated using(user_id=auth.uid());
create policy items_read on public.alumni_service_items for select to authenticated using(
 public.community_manager() or
 (kind='request' and author_id=auth.uid()) or
 (public.is_verified_user() and (kind='announcement' or (kind='discussion' and exists(select 1 from public.alumni_space_members m where m.space_id=alumni_service_items.space_id and m.user_id=auth.uid()))))
);
create policy items_create on public.alumni_service_items for insert to authenticated with check(
 author_id=auth.uid() and status='submitted' and
 ((kind='announcement' and public.community_manager()) or
 (kind='request' and not pinned) or
 (kind='discussion' and not pinned and public.is_verified_user() and exists(select 1 from public.alumni_space_members m where m.space_id=alumni_service_items.space_id and m.user_id=auth.uid())))
);
create policy items_manage on public.alumni_service_items for update to authenticated using(public.community_manager()) with check(public.community_manager());
create policy replies_read on public.alumni_service_replies for select to authenticated using(exists(select 1 from public.alumni_service_items i where i.id=item_id));
create policy replies_create on public.alumni_service_replies for insert to authenticated with check(
 author_id=auth.uid() and exists(select 1 from public.alumni_service_items i where i.id=item_id and
 ((i.kind='request' and (i.author_id=auth.uid() or public.community_manager())) or (i.kind='discussion' and public.is_verified_user())))
);
commit;
