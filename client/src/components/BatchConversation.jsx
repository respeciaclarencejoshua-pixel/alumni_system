import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './BatchGroups.css';
import { createPortal } from 'react-dom';
import { MessageOptions, LinkedText, ChatMenu, ChatCover, GroupMedia, useChatSettings, mediaUrl } from './ChatExtras.jsx';

export async function batchResult(query) {
  const { data, error } = await query;
  if (error) {
    const missing=['42P01','42703','PGRST202','PGRST204','PGRST205'].includes(error.code);
    const messageActions=/batch_message_reactions|react_batch_message|unsend_batch_message|reply_to|unsent_at/.test(`${error.message||''} ${error.details||''}`);
    throw new Error(missing ? messageActions ? 'Chat message actions are not installed in the database yet. The administrator must apply 20260908_batch_message_actions.sql, then retry.' : 'Batch communities need the latest database migration. Please contact the alumni office.' : error.message);
  }
  return data;
}
export const memberName = p => [p?.first_name,p?.last_name].filter(Boolean).join(' ') || 'Alumni member';

export default function BatchConversation({ group, user, kind = 'chat', initialAnnouncementId, menuInHeader = false, menuTarget }) {
  const chatKey=`batch:${group.id}`;
  const [settings,setSettings]=useChatSettings(chatKey);
  const [entries,setEntries] = useState([]), [members,setMembers] = useState([]);
  const [error,setError] = useState(''), [loading,setLoading] = useState(true);
  const [draft,setDraft] = useState(''), [busy,setBusy] = useState(false);
  const [canPost,setCanPost] = useState(false), [canRead,setCanRead] = useState(false);
  const [revision,setRevision] = useState(0);
  const [replyTo,setReplyTo] = useState(null);
  const [reactions,setReactions] = useState([]);
  const [reactionMenu,setReactionMenu] = useState(null);
  const inputRef=useRef(null);
  const logRef = useRef(null);
  const followLatest = useRef(true);
  const [newMessages, setNewMessages] = useState(false);
  useEffect(() => {
    let active=true, running=false;
    setEntries([]);setMembers([]);setError('');setLoading(true);setCanPost(false);setCanRead(false);
    async function load() {
      if(running || document.hidden)return;
      running=true;
      try {
        const [joined,manager,announce] = await Promise.all([
          batchResult(supabase.rpc('is_batch_member',{p_space:group.id})),
          batchResult(supabase.rpc('community_manager')),
          kind==='announcement'?batchResult(supabase.rpc('can_announce_batch',{p_space:group.id})):Promise.resolve(false),
        ]);
        if(!active)return;
        setCanRead(joined||manager);setCanPost(kind==='announcement'?announce:joined);
        if(!joined&&!manager){setEntries([]);setMembers([]);return;}
        const [rows,people]=await Promise.all([
          batchResult(supabase.from('batch_entries').select('*').eq('space_id',group.id).eq('kind',kind).order('created_at',{ascending:false}).limit(100)),
          batchResult(supabase.rpc('list_batch_members',{p_space:group.id})),
        ]);
        if(kind==='announcement'&&initialAnnouncementId){
          const target=await batchResult(supabase.from('batch_entries').select('*').eq('id',initialAnnouncementId).eq('space_id',group.id).eq('kind','announcement').maybeSingle());
          if(target){const index=rows.findIndex(row=>row.id===target.id);if(index>=0)rows.splice(index,1);rows.unshift(target);}
          else if(active)setError('This announcement is no longer available.');
        }
        if(kind==='chat'&&rows.length){
          const reactionRows=await batchResult(supabase.from('batch_message_reactions').select('*').in('message_id',rows.map(row=>row.id)));
          const missing=[...new Set(rows.map(row=>row.reply_to).filter(id=>id&&!rows.some(row=>row.id===id)))];
          const parents=missing.length?await batchResult(supabase.from('batch_entries').select('*').eq('space_id',group.id).in('id',missing)):[];
          rows.forEach(row=>{row.replyPreview=[...rows,...parents].find(parent=>parent.id===row.reply_to)||null;});
          if(active)setReactions(reactionRows);
        }else if(active)setReactions([]);
        if(kind==='chat')await Promise.all(rows.map(async row=>{if(!row.unsent_at&&row.attachment_url)row.attachment_url=await mediaUrl(row.attachment_url);}));
        if(active){setEntries(kind==='chat'?rows.reverse():rows);setMembers(people);}
      }catch(e){if(active){setError(e.message);setCanPost(false);setCanRead(false);setEntries([]);setMembers([]);}}finally{running=false;if(active)setLoading(false);}
    }
    load();
    const interval=kind==='chat'?setInterval(load,5000):null;
    document.addEventListener('visibilitychange',load);
    window.addEventListener('batch-membership-changed',load);
    return()=>{active=false;if(interval)clearInterval(interval);document.removeEventListener('visibilitychange',load);window.removeEventListener('batch-membership-changed',load);};
  },[group.id,user.id,kind,revision]);
  useEffect(() => { setDraft('');setReplyTo(null);setReactionMenu(null); followLatest.current=true;setNewMessages(false); }, [group.id,user.id,kind]);
  const latestEntry = entries[entries.length-1]?.id;
  useEffect(() => {
    if(kind!=='chat'||!latestEntry)return;
    if(followLatest.current && logRef.current) logRef.current.scrollTop=logRef.current.scrollHeight;
    else setNewMessages(true);
  },[latestEntry,kind]);
  async function send(e){
    e.preventDefault();if(busy||!draft.trim())return;setBusy(true);setError('');
    try{await batchResult(supabase.from('batch_entries').insert({space_id:group.id,author_id:user.id,kind,body:draft.trim(),...(kind==='chat'?{reply_to:replyTo?.id||null}:{})}));setDraft('');setReplyTo(null);followLatest.current=true;setNewMessages(false);setRevision(n=>n+1);}
    catch(err){setError(err.message);}finally{setBusy(false);}
  }
  async function sendMedia(media){
    if(busy)return false;setBusy(true);setError('');let path;
    try{let payload=media;if(media instanceof File){path=`${user.id}/${crypto.randomUUID()}-${media.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;await batchResult(supabase.storage.from('chat-attachments').upload(path,media));payload={message_type:'image',attachment_url:path,attachment_name:media.name,body:media.name};}await batchResult(supabase.from('batch_entries').insert({space_id:group.id,author_id:user.id,kind:'chat',...payload,reply_to:replyTo?.id||null}));setReplyTo(null);followLatest.current=true;setRevision(n=>n+1);return true;}catch(e){if(path)await supabase.storage.from('chat-attachments').remove([path]);setError(e.message);return false;}finally{setBusy(false);}
  }
  async function pin(entry){setBusy(true);try{await batchResult(supabase.rpc('pin_chat_message',{p_key:chatKey,p_message:entry.id,p_pinned:!entry.pinned}));setRevision(n=>n+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function remove(entry){if(!window.confirm('Delete this message? This cannot be undone.'))return;setBusy(true);try{await batchResult(supabase.from('batch_entries').delete().eq('id',entry.id));setRevision(n=>n+1);}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function messageAction(entry,emoji){
    if(busy)return;
    if(!emoji&&!window.confirm('Unsend this message for everyone? People may already have read it.'))return;
    setBusy(true);setError('');
    try{await batchResult(emoji?supabase.rpc('react_batch_message',{p_message:entry.id,p_emoji:emoji}):supabase.rpc('unsend_batch_message',{p_message:entry.id}));setReactionMenu(null);setRevision(n=>n+1);}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  if(kind==='chat') return <section className="batch-messenger-body" aria-label="Batch conversation">
    {menuInHeader ? (menuTarget && createPortal(<ChatMenu chatKey={chatKey} group={group} user={user} members={members} settings={settings} onSettings={setSettings}/>,menuTarget)) : <div className="group-chat-options"><strong>{settings.name||group.name}</strong><ChatMenu chatKey={chatKey} group={group} user={user} members={members} settings={settings} onSettings={setSettings}/></div>}<ChatCover path={settings.cover}/><div className="messenger-messages" ref={logRef} onScroll={()=>{const el=logRef.current;if(el){followLatest.current=el.scrollHeight-el.scrollTop-el.clientHeight<60;if(followLatest.current)setNewMessages(false);}}}>
      {loading?<p role="status">Loading messages…</p>:!canRead?<p>{error?'Unable to check access. Please retry.':'Join this batch to chat.'}</p>:entries.length?entries.map(entry=>{
        const person=members.find(p=>p.id===entry.author_id),mine=entry.author_id===user.id;
        return <div key={entry.id} className={`message-row ${mine?'mine':''}`}>
          {!mine&&<span className="chat-avatar small">{person?.avatar_url?<img src={person.avatar_url} alt={memberName(person)}/>:memberName(person).slice(0,1)}</span>}
          <div className="batch-message-content"><strong className="batch-sender">{settings.nicknames?.[person?.id]||memberName(person)}{mine?' (You)':''}{person?.is_president?' · President':''}</strong><div className="message-bubble">
          {entry.reply_to&&!entry.unsent_at&&<blockquote className="batch-reply-quote"><strong>Reply to {memberName(members.find(p=>p.id===entry.replyPreview?.author_id))}</strong><span>{entry.replyPreview?.unsent_at?'Message unsent':entry.replyPreview?.body?.slice(0,150)||'Original message unavailable'}</span></blockquote>}
          {!entry.unsent_at&&entry.attachment_url&&<a href={entry.attachment_url} target="_blank" rel="noopener noreferrer"><img src={entry.attachment_url} alt={entry.attachment_name||'Shared GIF'}/></a>}<p className={entry.unsent_at?'batch-unsent':''}>{entry.unsent_at?'Message unsent':<LinkedText text={entry.body}/>}</p><time dateTime={entry.created_at} title={new Date(entry.created_at).toLocaleString()}>{new Date(entry.created_at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div>
          {!entry.unsent_at&&<><div className="batch-message-actions">
            <MessageOptions pinned={entry.pinned} busy={busy||!canPost} onPin={()=>pin(entry)} onUnsend={mine?()=>messageAction(entry):undefined}/>
            <button type="button" disabled={busy||!canPost} aria-label="Reply to message" title="Reply" onClick={()=>{setReplyTo(entry);inputRef.current?.focus();}}>↩</button>
            <button type="button" disabled={busy||!canPost} aria-label="React to message" title="React" aria-expanded={reactionMenu===entry.id} onClick={()=>setReactionMenu(reactionMenu===entry.id?null:entry.id)}>☺</button>
          </div>{reactionMenu===entry.id&&<div className="batch-reaction-picker" aria-label="Choose reaction">{['👍','❤️','😂','😮','😢','🙏'].map(emoji=><button type="button" key={emoji} disabled={busy} aria-label={`React ${emoji}`} onClick={()=>messageAction(entry,emoji)}>{emoji}</button>)}</div>}
          <div className="batch-reaction-counts">{['👍','❤️','😂','😮','😢','🙏'].map(emoji=>{const votes=reactions.filter(r=>r.message_id===entry.id&&r.emoji===emoji);return votes.length>0&&<button type="button" key={emoji} disabled={busy||!canPost} aria-pressed={votes.some(r=>r.user_id===user.id)} aria-label={`${emoji}: ${votes.length} reactions. Toggle your reaction`} onClick={()=>messageAction(entry,emoji)}>{emoji} {votes.length}</button>;})}</div></>}
          </div>
        </div>;
      }):<div className="message-empty"><strong>{group.name}</strong><p>Say hello to your batch. Messages are shared with group members.</p></div>}
    </div>
    {error&&<div className="messenger-error" role="alert">{error}<button type="button" onClick={()=>setRevision(n=>n+1)}>Retry</button></div>}
    {newMessages&&canRead&&<button className="batch-latest" type="button" onClick={()=>{followLatest.current=true;setNewMessages(false);if(logRef.current)logRef.current.scrollTop=logRef.current.scrollHeight;}}>New messages ↓</button>}
    {canPost&&<GroupMedia onSend={sendMedia} disabled={busy} onError={setError}/>}
    {canPost&&<form className="messenger-composer" onSubmit={send}>{replyTo&&<div className="batch-reply-compose"><div><strong>Replying to {memberName(members.find(p=>p.id===replyTo.author_id))}</strong><span>{entries.find(e=>e.id===replyTo.id)?.unsent_at?'Message unsent':replyTo.body.slice(0,120)}</span></div><button type="button" aria-label="Cancel reply" onClick={()=>setReplyTo(null)}>×</button></div>}<div className="composer-input"><textarea ref={inputRef} aria-label="Message your batch" placeholder="Message your batch…" value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)} maxLength={5000} rows={1} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(draft.trim()&&!busy)e.currentTarget.form.requestSubmit();}}}/><button type="submit" disabled={busy||!draft.trim()} aria-label="Send message">➤</button></div></form>}
  </section>;
  return <section className={`batch-conversation ${kind==='announcement'?'batch-announcement-board':''}`} aria-label={kind==='chat'?'Batch group chat':kind==='announcement'?'Batch announcements':'Batch discussions'}>
    {kind==='announcement'&&<p className="announcement-eyebrow">OFFICIAL BATCH UPDATES</p>}
    <div className="batch-conversation-heading"><h3>{kind==='chat'?'Group chat':kind==='announcement'?'Batch announcements':'Discussions'}</h3><button type="button" disabled={busy} onClick={()=>setRevision(n=>n+1)}>Refresh</button></div>
    <p className="batch-hint">{kind==='announcement'?'Updates from your batch president and the alumni office.':kind==='chat'?'Your batch’s shared conversation. New messages are checked every five seconds while this window is visible.':'Share questions, reunion ideas, opportunities, and ways to help your batch.'}</p>
    {error&&<p role="alert">{error}</p>}
    {loading?<p role="status">Loading…</p>:!canRead?<p>{error?'Access could not be confirmed. Refresh to try again.':'Join this batch to read and participate.'}</p>:<div ref={logRef} onScroll={() => { const el=logRef.current;if(el){followLatest.current=el.scrollHeight-el.scrollTop-el.clientHeight<60;if(followLatest.current)setNewMessages(false);} }} className={`batch-entries ${kind==='chat'?'batch-chat-log':''}`}>
      {entries.length?entries.map(entry=>{const person=members.find(p=>p.id===entry.author_id);return <article key={entry.id} className={entry.author_id===user.id?'batch-entry mine':'batch-entry'}><header><strong>{entry.author_id===user.id?'You':memberName(person)}{person?.is_president?' · Batch president':''}</strong><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString()}</time></header><p>{entry.body}</p>{entry.author_id===user.id&&<button type="button" disabled={busy} onClick={()=>remove(entry)}>Delete</button>}</article>}):<p>No {kind==='chat'?'messages':kind==='announcement'?'announcements':'discussions'} yet.</p>}
    </div>}
    {kind==='chat'&&newMessages&&canRead&&<button type="button" onClick={()=>{followLatest.current=true;setNewMessages(false);if(logRef.current)logRef.current.scrollTop=logRef.current.scrollHeight;}}>Jump to latest messages ↓</button>}
    {canPost&&<form onSubmit={send}><label>{kind==='chat'?'Message your batch':kind==='announcement'?'New batch announcement':'Start a discussion'}<textarea value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)} maxLength={5000} rows={kind==='chat'?2:4} required placeholder={kind==='chat'?'Write a message…':'What would you like to share?'} /></label><button className="batch-primary" disabled={busy||!draft.trim()}>{busy?'Sending…':kind==='chat'?'Send message':'Publish'}</button></form>}
    {canRead&&<small>Showing the latest 100 {kind==='chat'?'messages':'entries'}.</small>}
  </section>;
}
