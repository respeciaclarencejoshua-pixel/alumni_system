import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../../supabase/migrations/20260908_batch_message_actions.sql',import.meta.url),'utf8');
test('reply targets must be available chat messages in the same batch',()=>{
 assert.match(sql,/id=new.reply_to and space_id=new.space_id and kind='chat' and unsent_at is null/);
 assert.match(sql,/before insert on public.batch_entries/);
});
test('unsend checks authorship and membership and removes text and reactions',()=>{
 assert.match(sql,/target.author_id<>auth.uid\(\)/);
 assert.match(sql,/not public.is_batch_member\(target.space_id\)/);
 assert.match(sql,/set body='Message unsent'/);
 assert.match(sql,/delete from public.batch_message_reactions where message_id=p_message/);
});
test('reactions permit one choice per person through protected RPCs',()=>{
 assert.match(sql,/primary key\(message_id,user_id\)/);
 assert.match(sql,/target.unsent_at is not null/);
 assert.match(sql,/revoke all on public.batch_message_reactions from public,anon,authenticated/);
 assert.doesNotMatch(sql,/grant insert/);
});
