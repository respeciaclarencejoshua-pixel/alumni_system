import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../../supabase/migrations/20260908_announcement_notifications.sql',import.meta.url),'utf8');
test('announcement notifications are insert-only and scoped to the intended audience',()=>{
 assert.match(sql,/if new.kind<>'announcement' then return new/);
 assert.match(sql,/m.space_id=new.space_id and p.status='verified' and m.user_id<>new.author_id/);
 assert.match(sql,/p.status='verified' and p.id<>new.author_id/);
 assert.match(sql,/after insert on public.batch_entries/);
 assert.match(sql,/after insert on public.alumni_service_items/);
 assert.doesNotMatch(sql,/after update/);
 assert.match(sql,/announcement_id,batch_id/);
 assert.match(sql,/revoke all on function/);
});
