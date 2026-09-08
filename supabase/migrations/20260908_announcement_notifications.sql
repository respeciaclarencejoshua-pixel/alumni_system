-- Apply after 20260908_batch_communities.sql. New publications only; no historical blast.
begin;
set local lock_timeout='5s';
alter table public.account_notifications add column if not exists announcement_id uuid;
alter table public.account_notifications add column if not exists batch_id uuid;
create function public.notify_published_announcement() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.kind<>'announcement' then return new; end if;
 if tg_table_name='batch_entries' then
  insert into public.account_notifications(recipient_id,kind,subject,message,announcement_id,batch_id)
  select m.user_id,'batch_announcement','New announcement in '||s.name,left(new.body,160),new.id,new.space_id
  from public.alumni_space_members m join public.profiles p on p.id=m.user_id join public.alumni_spaces s on s.id=m.space_id
  where m.space_id=new.space_id and p.status='verified' and m.user_id<>new.author_id;
 else
  insert into public.account_notifications(recipient_id,kind,subject,message,announcement_id)
  select p.id,'system_announcement',new.title,left(new.body,160),new.id
  from public.profiles p where p.status='verified' and p.id<>new.author_id;
 end if;
 return new;
end;$$;
revoke all on function public.notify_published_announcement() from public;
create trigger notify_batch_announcement after insert on public.batch_entries for each row execute function public.notify_published_announcement();
create trigger notify_system_announcement after insert on public.alumni_service_items for each row execute function public.notify_published_announcement();
commit;
