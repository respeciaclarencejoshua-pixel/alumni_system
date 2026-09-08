-- Apply once after the batch communities migration. No existing messages are deleted.
begin;
set local lock_timeout='5s';
alter table public.batch_entries add column reply_to uuid references public.batch_entries(id) on delete set null;
alter table public.batch_entries add column unsent_at timestamptz;
create function public.validate_batch_message_reply() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.unsent_at is not null then raise exception 'Use the unsend action.'; end if;
 if new.reply_to is not null then
  if new.kind<>'chat' or not exists(select 1 from public.batch_entries where id=new.reply_to and space_id=new.space_id and kind='chat' and unsent_at is null) then raise exception 'This message is no longer available to reply to.'; end if;
 end if;
 return new;
end;$$;
create trigger validate_batch_reply before insert on public.batch_entries for each row execute function public.validate_batch_message_reply();
create table public.batch_message_reactions(
 message_id uuid not null references public.batch_entries on delete cascade,
 user_id uuid not null references public.profiles on delete cascade,
 emoji text not null check(emoji in ('👍','❤️','😂','😮','😢','🙏')),
 primary key(message_id,user_id)
);
alter table public.batch_message_reactions enable row level security;
revoke all on public.batch_message_reactions from public,anon,authenticated;
grant select on public.batch_message_reactions to authenticated;
create policy batch_reactions_read on public.batch_message_reactions for select to authenticated using(exists(select 1 from public.batch_entries e where e.id=message_id and public.is_batch_member(e.space_id)));
create function public.react_batch_message(p_message uuid,p_emoji text) returns void language plpgsql security definer set search_path=public as $$
declare target public.batch_entries;
begin
 select * into target from public.batch_entries where id=p_message for update;
 if target.id is null or target.kind<>'chat' or target.unsent_at is not null or not public.is_batch_member(target.space_id) then raise exception 'Message unavailable.'; end if;
 if p_emoji not in ('👍','❤️','😂','😮','😢','🙏') or p_emoji is null then raise exception 'Unsupported reaction.'; end if;
 if exists(select 1 from public.batch_message_reactions where message_id=p_message and user_id=auth.uid() and emoji=p_emoji) then
  delete from public.batch_message_reactions where message_id=p_message and user_id=auth.uid();
 else
  insert into public.batch_message_reactions(message_id,user_id,emoji) values(p_message,auth.uid(),p_emoji)
  on conflict(message_id,user_id) do update set emoji=excluded.emoji;
 end if;
end;$$;
create function public.unsend_batch_message(p_message uuid) returns void language plpgsql security definer set search_path=public as $$
declare target public.batch_entries;
begin
 select * into target from public.batch_entries where id=p_message for update;
 if target.id is null or target.kind<>'chat' or target.author_id<>auth.uid() or not public.is_batch_member(target.space_id) then raise exception 'You can only unsend your own batch messages.'; end if;
 update public.batch_entries set body='Message unsent',unsent_at=coalesce(unsent_at,now()) where id=p_message;
 delete from public.batch_message_reactions where message_id=p_message;
end;$$;
revoke all on function public.validate_batch_message_reply(),public.react_batch_message(uuid,text),public.unsend_batch_message(uuid) from public;
grant execute on function public.react_batch_message(uuid,text),public.unsend_batch_message(uuid) to authenticated;
commit;
