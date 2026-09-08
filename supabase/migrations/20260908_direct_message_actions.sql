begin;
set local lock_timeout='5s';
alter table public.direct_messages add column reply_to uuid references public.direct_messages(id) on delete set null;
alter table public.direct_messages add column unsent_at timestamptz;
revoke update on public.direct_messages from public,anon,authenticated;
grant update(read_at) on public.direct_messages to authenticated;
create function public.validate_direct_reply() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.unsent_at is not null then raise exception 'Use unsend action.'; end if;
 if new.reply_to is not null and not exists(select 1 from public.direct_messages m where m.id=new.reply_to and m.unsent_at is null and
 ((m.sender_id=new.sender_id and m.recipient_id=new.recipient_id) or (m.sender_id=new.recipient_id and m.recipient_id=new.sender_id))) then raise exception 'Original message unavailable.'; end if;
 return new;
end;$$;
create trigger validate_direct_reply before insert on public.direct_messages for each row execute function public.validate_direct_reply();
create table public.direct_message_reactions(message_id uuid references public.direct_messages on delete cascade,user_id uuid references public.profiles on delete cascade,emoji text not null check(emoji in ('👍','❤️','😂','😮','😢','🙏')),primary key(message_id,user_id));
alter table public.direct_message_reactions enable row level security;
revoke all on public.direct_message_reactions from public,anon,authenticated;
grant select on public.direct_message_reactions to authenticated;
create policy direct_reactions_read on public.direct_message_reactions for select to authenticated using(exists(select 1 from public.direct_messages m where m.id=message_id and auth.uid() in(m.sender_id,m.recipient_id)));
create function public.manage_direct_message(p_message uuid,p_action text,p_emoji text default null) returns void language plpgsql security definer set search_path=public as $$
declare target public.direct_messages;
begin
 select * into target from public.direct_messages where id=p_message for update;
 if auth.uid() is null or target.id is null or auth.uid() not in(target.sender_id,target.recipient_id) or not public.is_verified_user() then raise exception 'Message unavailable.'; end if;
 if p_action='unsend' then
  if target.sender_id<>auth.uid() then raise exception 'Only the sender can unsend this message.'; end if;
  update public.direct_messages set body='Message unsent',message_type='text',attachment_url=null,attachment_name=null,attachment_type=null,unsent_at=coalesce(unsent_at,now()) where id=p_message;
  delete from public.direct_message_reactions where message_id=p_message;
 elsif p_action='react' then
  if target.unsent_at is not null or p_emoji is null or p_emoji not in ('👍','❤️','😂','😮','😢','🙏') then raise exception 'Reaction unavailable.'; end if;
  if exists(select 1 from public.alumni_blocks where (blocker_id=target.sender_id and blocked_id=target.recipient_id) or (blocker_id=target.recipient_id and blocked_id=target.sender_id)) then raise exception 'Conversation unavailable.'; end if;
  if exists(select 1 from public.direct_message_reactions where message_id=p_message and user_id=auth.uid() and emoji=p_emoji) then delete from public.direct_message_reactions where message_id=p_message and user_id=auth.uid();
  else insert into public.direct_message_reactions values(p_message,auth.uid(),p_emoji) on conflict(message_id,user_id) do update set emoji=excluded.emoji; end if;
 else raise exception 'Unknown message action.';
 end if;
end;$$;
revoke all on function public.validate_direct_reply(),public.manage_direct_message(uuid,text,text) from public;
grant execute on function public.manage_direct_message(uuid,text,text) to authenticated;
commit;
