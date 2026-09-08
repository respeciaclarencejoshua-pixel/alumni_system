import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../../supabase/migrations/20260908_direct_message_actions.sql',import.meta.url),'utf8');
test('direct message actions restrict participants, authorship, and recipients updates',()=>{
 assert.match(sql,/auth.uid\(\) not in\(target.sender_id,target.recipient_id\)/);
 assert.match(sql,/target.sender_id<>auth.uid\(\)/);
 assert.match(sql,/grant update\(read_at\)/);
 assert.match(sql,/attachment_url=null,attachment_name=null,attachment_type=null/);
});
test('direct replies must belong to the same conversation and reactions respect blocks',()=>{
 assert.match(sql,/m.sender_id=new.sender_id and m.recipient_id=new.recipient_id/);
 assert.match(sql,/m.sender_id=new.recipient_id and m.recipient_id=new.sender_id/);
 assert.match(sql,/public.alumni_blocks/);
 assert.match(sql,/primary key\(message_id,user_id\)/);
});
