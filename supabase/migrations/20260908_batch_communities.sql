-- Apply once AFTER 20260907_community_services.sql, in a separate transaction.
begin;
set local lock_timeout = '5s';
alter table public.alumni_spaces add column batch_year integer check(batch_year between 1953 and 2200);
alter table public.alumni_spaces add column photo_url text;
alter table public.alumni_spaces add column president_id uuid references public.profiles(id) on delete set null;
alter table public.alumni_spaces add column rules text not null default 'Be respectful. Protect personal information. Keep discussions relevant to the batch.' check(char_length(rules)<=2000);
grant update(name,description,batch_year,photo_url,president_id,rules) on public.alumni_spaces to authenticated;
create policy spaces_edit on public.alumni_spaces for update to authenticated using(public.community_manager()) with check(public.community_manager());

create function public.is_batch_member(p_space uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.is_verified_user() and exists(select 1 from public.alumni_space_members where space_id=p_space and user_id=auth.uid());
$$;
create function public.can_announce_batch(p_space uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.community_manager() or (public.is_batch_member(p_space) and exists(select 1 from public.alumni_spaces where id=p_space and president_id=auth.uid()));
$$;
create function public.list_batch_groups() returns table(id uuid,name text,description text,batch_year integer,photo_url text,president_id uuid,president_name text,rules text,member_count bigint,joined boolean)
language sql stable security definer set search_path=public as $$
 select s.id,s.name,s.description,s.batch_year,s.photo_url,s.president_id,nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),s.rules,
 (select count(*) from public.alumni_space_members m where m.space_id=s.id),public.is_batch_member(s.id)
 from public.alumni_spaces s left join public.profiles p on p.id=s.president_id where public.is_verified_user() order by s.batch_year desc nulls last,s.name;
$$;
create function public.list_batch_members(p_space uuid) returns table(id uuid,first_name text,last_name text,avatar_url text,is_president boolean)
language sql stable security definer set search_path=public as $$
 select p.id,p.first_name,p.last_name,p.avatar_url,p.id=s.president_id from public.alumni_space_members m
 join public.profiles p on p.id=m.user_id join public.alumni_spaces s on s.id=m.space_id
 where m.space_id=p_space and (public.is_batch_member(p_space) or public.community_manager()) order by (p.id=s.president_id) desc,p.first_name,p.last_name;
$$;
create function public.check_batch_president() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.president_id is not null then
  if not exists(select 1 from public.profiles where id=new.president_id and status='verified') then raise exception 'Choose a verified alumnus as batch president.'; end if;
  insert into public.alumni_space_members(space_id,user_id) values(new.id,new.president_id) on conflict do nothing;
 end if;
 return new;
end;$$;
create trigger batch_president_membership after insert or update of president_id on public.alumni_spaces for each row execute function public.check_batch_president();

create table public.batch_entries (
 id uuid primary key default gen_random_uuid(),
 space_id uuid not null references public.alumni_spaces on delete cascade,
 author_id uuid not null default auth.uid() references public.profiles on delete cascade,
 kind text not null check(kind in ('discussion','announcement','chat')),
 body text not null check(char_length(trim(body)) between 1 and 5000),
 created_at timestamptz not null default now()
);
create index on public.batch_entries(space_id,kind,created_at desc);
alter table public.batch_entries enable row level security;
revoke all on public.batch_entries from public,anon,authenticated;
grant select,insert,delete on public.batch_entries to authenticated;
create policy batch_entry_read on public.batch_entries for select to authenticated using(public.is_batch_member(space_id) or public.community_manager());
create policy batch_entry_write on public.batch_entries for insert to authenticated with check(author_id=auth.uid() and
 ((kind='announcement' and public.can_announce_batch(space_id)) or (kind in ('discussion','chat') and public.is_batch_member(space_id))));
create policy batch_entry_delete on public.batch_entries for delete to authenticated using(public.community_manager() or (public.is_batch_member(space_id) and author_id=auth.uid()));

-- Preserve discussions created in the first community implementation.
insert into public.batch_entries(id,space_id,author_id,kind,body,created_at)
select id,space_id,author_id,'discussion',left(title||E'\n\n'||body,5000),created_at from public.alumni_service_items where kind='discussion';
insert into public.batch_entries(space_id,author_id,kind,body,created_at)
select i.space_id,r.author_id,'discussion',left('Reply to: '||i.title||E'\n\n'||r.body,5000),r.created_at
from public.alumni_service_replies r join public.alumni_service_items i on i.id=r.item_id where i.kind='discussion';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('batch-photos','batch-photos',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy batch_photo_upload on storage.objects for insert to authenticated with check(bucket_id='batch-photos' and public.community_manager());
create policy batch_photo_remove on storage.objects for delete to authenticated using(bucket_id='batch-photos' and public.community_manager());

revoke all on function public.is_batch_member(uuid),public.can_announce_batch(uuid),public.list_batch_groups(),public.list_batch_members(uuid),public.check_batch_president() from public;
grant execute on function public.is_batch_member(uuid),public.can_announce_batch(uuid),public.list_batch_groups(),public.list_batch_members(uuid) to authenticated;
commit;
