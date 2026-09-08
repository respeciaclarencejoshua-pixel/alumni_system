-- Apply after both 20260908 message-actions migrations.
begin;
alter table public.batch_entries add column message_type text not null default 'text' check(message_type in ('text','image','gif'));
alter table public.batch_entries add column attachment_url text;
alter table public.batch_entries add column attachment_name text;
alter table public.batch_entries add column pinned boolean not null default false;
alter table public.direct_messages add column pinned boolean not null default false;
create table public.chat_settings(chat_key text primary key, name text not null default '' check(length(name)<=100), cover text, nicknames jsonb not null default '{}');
create function public.can_access_chat(p_key text) returns boolean language plpgsql stable security definer set search_path=public as $$
declare parts text[]=string_to_array(p_key,':');
begin
 if not public.is_verified_user() then return false; end if;
 if array_length(parts,1)=2 and parts[1]='batch' then return public.is_batch_member(parts[2]::uuid); end if;
 if array_length(parts,1)=3 and parts[1]='direct' and parts[2]<parts[3] then
 return auth.uid() in (parts[2]::uuid,parts[3]::uuid) and exists(select 1 from public.profiles where id=parts[2]::uuid and status='verified') and exists(select 1 from public.profiles where id=parts[3]::uuid and status='verified') and not exists(select 1 from public.alumni_blocks where (blocker_id=parts[2]::uuid and blocked_id=parts[3]::uuid) or (blocker_id=parts[3]::uuid and blocked_id=parts[2]::uuid));
 end if;
 return false;
exception when invalid_text_representation then return false;
end;$$;
alter table public.chat_settings enable row level security;
revoke all on public.chat_settings from public,anon,authenticated;
grant select on public.chat_settings to authenticated;
create policy chat_settings_read on public.chat_settings for select to authenticated using(public.can_access_chat(chat_key));
create function public.update_chat_settings(p_key text,p_patch jsonb) returns public.chat_settings language plpgsql security definer set search_path=public as $$
declare result public.chat_settings; item record; parts text[]=string_to_array(p_key,':');
begin
 if not public.can_access_chat(p_key) then raise exception 'Conversation unavailable.'; end if;
 if p_patch ? 'cover' and (p_patch->>'cover' not like auth.uid()::text||'/%' or not exists(select 1 from storage.objects where bucket_id='chat-attachments' and name=p_patch->>'cover')) then raise exception 'Upload a cover photo first.'; end if;
 if p_patch ? 'nicknames' then
  if jsonb_typeof(p_patch->'nicknames')<>'object' then raise exception 'Invalid nicknames.'; end if;
  for item in select * from jsonb_each_text(p_patch->'nicknames') loop
   if length(item.value)>50 then raise exception 'Nicknames must be 50 characters or fewer.'; end if;
   if parts[1]='direct' then
    if item.key not in (parts[2],parts[3]) then raise exception 'Unknown member.'; end if;
   elsif not exists(select 1 from public.alumni_space_members where space_id=parts[2]::uuid and user_id::text=item.key) then raise exception 'Unknown member.';
   end if;
  end loop;
 end if;
 insert into public.chat_settings(chat_key) values(p_key) on conflict do nothing;
 update public.chat_settings set name=case when p_patch ? 'name' then coalesce(p_patch->>'name','') else name end, cover=case when p_patch ? 'cover' then p_patch->>'cover' else cover end,nicknames=case when p_patch ? 'nicknames' then p_patch->'nicknames' else nicknames end where chat_key=p_key returning * into result;
 return result;
end;$$;
create function public.pin_chat_message(p_key text,p_message uuid,p_pinned boolean) returns void language plpgsql security definer set search_path=public as $$
declare parts text[]=string_to_array(p_key,':');
begin
 if not public.can_access_chat(p_key) then raise exception 'Conversation unavailable.'; end if;
 if parts[1]='batch' then
 update public.batch_entries set pinned=p_pinned where id=p_message and space_id=parts[2]::uuid and kind='chat' and unsent_at is null;
 else
 update public.direct_messages set pinned=p_pinned where id=p_message and least(sender_id::text,recipient_id::text)=parts[2] and greatest(sender_id::text,recipient_id::text)=parts[3] and unsent_at is null;
 end if;
 if not found then raise exception 'Message unavailable.'; end if;
end;$$;
create policy batch_chat_media_read on storage.objects for select to authenticated using(bucket_id='chat-attachments' and (exists(select 1 from public.batch_entries e where e.attachment_url=name and e.unsent_at is null and public.is_batch_member(e.space_id)) or exists(select 1 from public.chat_settings s where s.cover=storage.objects.name and public.can_access_chat(s.chat_key))));
-- Prevent clients from forging pins on insertion, and restrict uploaded media to the sender's folder.
create function public.validate_chat_media() returns trigger language plpgsql set search_path=public as $$
begin
 if new.pinned then raise exception 'Use the pin action.'; end if;
 if TG_TABLE_NAME='batch_entries' then
 if new.message_type<>'text' then
  if new.kind<>'chat' or new.attachment_url is null then raise exception 'Invalid chat attachment.'; end if;
  if new.message_type='image' and new.attachment_url not like auth.uid()::text||'/%' then raise exception 'Invalid attachment owner.'; end if;
  if new.message_type='gif' and new.attachment_url !~ '^https://([a-z0-9-]+\.)*giphy\.com/' then raise exception 'Invalid GIF URL.'; end if;
 end if;
 end if;
 return new;
end;$$;
create trigger validate_batch_media before insert on public.batch_entries for each row execute function public.validate_chat_media();
create trigger validate_direct_pin before insert on public.direct_messages for each row execute function public.validate_chat_media();
revoke all on function public.can_access_chat(text),public.update_chat_settings(text,jsonb),public.pin_chat_message(text,uuid,boolean),public.validate_chat_media() from public;
grant execute on function public.can_access_chat(text),public.update_chat_settings(text,jsonb),public.pin_chat_message(text,uuid,boolean) to authenticated;
commit;
