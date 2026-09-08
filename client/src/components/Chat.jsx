import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Chat.css';
import {ChatMenu, ChatCover, useChatSettings} from './ChatExtras.jsx';
import BatchConversation from './BatchConversation.jsx';
import DirectMessageBubble from './DirectMessageBubble.jsx';

const EMOJIS = ['😀','😂','🥰','😍','😊','😎','😭','😡','👍','👏','🙏','🎉','❤️','💚','🔥','✨','✅','🎓','🤝','💯'];
const nameOf = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || 'Alumni member';
const initialsOf = (p) => `${p?.first_name?.[0] || ''}${p?.last_name?.[0] || ''}`.toUpperCase() || 'A';

function Avatar({ person, small = false }) {
  return <span className={`chat-avatar ${small ? 'small' : ''}`}>{person?.avatar_url ? <img src={person.avatar_url} alt="" /> : initialsOf(person)}</span>;
}

export default function Chat({ user, profile, contact, onContactHandled, batchContact, onBatchHandled }) {
  const [batchGroups, setBatchGroups] = useState([]);
  const [directReply,setDirectReply]=useState(null);
  const [directReactions,setDirectReactions]=useState([]);
  const [actionBusy,setActionBusy]=useState(false);
  const directInputRef=useRef(null);
  const activePersonRef=useRef(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchSettings]=useChatSettings(selectedBatch?`batch:${selectedBatch.id}`:'');
  const [batchMenuTarget,setBatchMenuTarget]=useState(null);
  const [batchMinimized,setBatchMinimized] = useState(false);
  useEffect(()=>{setBatchMinimized(false);},[selectedBatch]);
  const [batchError, setBatchError] = useState('');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState(null);
  const chatKey=selected?`direct:${[user.id,selected.id].sort().join(':')}`:'';
  const [settings,setSettings]=useChatSettings(chatKey);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [picker, setPicker] = useState(null);
  const [gifQuery, setGifQuery] = useState('');
  const [gifs, setGifs] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const followDirectRef=useRef(true);
  const fileRef = useRef(null);
  useEffect(() => {
    let active = true;
    async function loadBatches() {
      const { data, error } = await supabase.rpc('list_batch_groups');
      if (!active) return;
      if (error) { setBatchError('Batch chats could not be loaded. Open Alumni groups to check access.'); return; }
      const joined = (data || []).filter(group => group.joined);
      setBatchGroups(joined); setBatchError('');
      setSelectedBatch(current => current && joined.some(group => group.id === current.id) ? current : null);
    }
    loadBatches();
    window.addEventListener('batch-membership-changed', loadBatches);
    return () => { active = false; window.removeEventListener('batch-membership-changed', loadBatches); };
  }, [user.id, directoryOpen]);
  useEffect(() => {
    if (batchContact?.id) { setSelected(null); setSelectedBatch(batchContact); setDirectoryOpen(false); onBatchHandled?.(); }
  }, [batchContact?.id]);

  async function loadPeople() {
    const { data, error: loadError } = await supabase.rpc('list_chat_profiles');
    if (loadError) setError('Apply the latest Supabase schema to enable chat.');
    else setPeople((data || []).filter((p) => p.id !== user.id));
  }

  async function loadMessages(personId) {
    const { data, error: loadError } = await supabase.from('direct_messages').select('*')
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${personId}),and(sender_id.eq.${personId},recipient_id.eq.${user.id})`)
      .order('created_at', { ascending: false }).limit(100);
    if(activePersonRef.current!==personId)return;
    if (loadError) setError('Messages could not be loaded.'); else {
      const resolved = await Promise.all((data || []).map(async (message) => {
        if (!message.attachment_url || message.message_type === 'gif' || message.attachment_url.startsWith('http')) return message;
        const { data: signed } = await supabase.storage.from('chat-attachments').createSignedUrl(message.attachment_url, 3600);
        return { ...message, attachment_url: signed?.signedUrl || '' };
      }));
      if(activePersonRef.current!==personId)return;
      const log=endRef.current?.parentElement;
      followDirectRef.current=!log||log.scrollHeight-log.scrollTop-log.clientHeight<80;
      setMessages(resolved.reverse());
      if(data?.length){const result=await supabase.from('direct_message_reactions').select('*').in('message_id',data.map(m=>m.id));if(activePersonRef.current===personId)setDirectReactions((result.data||[]).map(r=>({...r,isMine:r.user_id===user.id})));}
      else setDirectReactions([]);
    }
    await supabase.from('direct_messages').update({ read_at: new Date().toISOString() })
      .eq('sender_id', personId).eq('recipient_id', user.id).is('read_at', null);
  }

  useEffect(() => { loadPeople(); }, [user.id]);
  useEffect(() => { if (contact?.id) { setSelectedBatch(null); setSelected(contact); setDirectoryOpen(true); setMinimized(false); onContactHandled?.(); } }, [contact?.id]);
  useEffect(() => { activePersonRef.current=selected?.id;setMessages([]);setDirectReply(null);setDirectReactions([]);setError('');if(selected?.id)loadMessages(selected.id);const timer=setInterval(()=>{if(selected?.id&&!document.hidden)loadMessages(selected.id);},5000);return()=>{activePersonRef.current=null;clearInterval(timer);}; }, [selected?.id]);
  useEffect(() => {
    const channel = supabase.channel(`chat-widget:${user.id}`).on('postgres_changes',
      { event: '*', schema: 'public', table: 'direct_messages',filter:`sender_id=eq.${user.id}` }, () => {
        loadPeople(); if (selected?.id) loadMessages(selected.id);
      }).on('postgres_changes',{event:'*',schema:'public',table:'direct_messages',filter:`recipient_id=eq.${user.id}`}, () => {
        loadPeople(); if (selected?.id) loadMessages(selected.id);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user.id, selected?.id]);
  useEffect(() => { if(followDirectRef.current){const log=endRef.current?.parentElement;if(log)log.scrollTop=log.scrollHeight;} }, [messages, minimized]);
  useEffect(() => { if (picker === 'gif') loadTrendingGifs(); }, [picker]);

  const unread = people.reduce((sum, p) => sum + Number(p.unread_count || 0), 0);
  const filtered = useMemo(() => people.filter((p) => nameOf(p).toLowerCase().includes(search.toLowerCase())), [people, search]);

  async function insertMessage(payload) {
    if (!selected || sending) return false;
    const recipientId=selected.id;
    const replyId=directReply?.id;
    setSending(true); setError('');
    try {
      if(replyId){
        const {data:original,error:originalError}=await supabase.from('direct_messages').select('id,sender_id,recipient_id,unsent_at').eq('id',replyId).maybeSingle();
        if(originalError)throw originalError;
        if(!original||original.unsent_at)throw new Error('The original message was removed or unsent. Cancel the reply to send your draft as a new message.');
        if(!((original.sender_id===user.id&&original.recipient_id===recipientId)||(original.sender_id===recipientId&&original.recipient_id===user.id)))throw new Error('This reply belongs to another conversation. Cancel the reply and select a message in this chat.');
      }
      const {error:sendError}=await supabase.from('direct_messages').insert({sender_id:user.id,recipient_id:recipientId,body:payload.body||'',...payload,...(replyId?{reply_to:replyId}:{})});
      if(sendError)throw sendError;
      if(activePersonRef.current===recipientId){setDraft('');setDirectReply(null);setPicker(null);await loadMessages(recipientId);}
      return true;
    }catch(sendError){
      if(activePersonRef.current===recipientId){
        const missing=['42703','PGRST204'].includes(sendError.code);
        setError(missing?'The database is missing reply fields. Apply 20260908_direct_message_actions.sql. Your draft has been kept.':`${replyId?'Reply':'Message'} not sent: ${sendError.message||'Network error. Please retry.'}${sendError.code?` (${sendError.code})`:''}`);
      }
      return false;
    }finally{setSending(false);}
  }

  function sendText(event) { event.preventDefault(); if (draft.trim()) insertMessage({ body: draft.trim(), message_type: 'text' }); }
  async function directAction(message,action,emoji=null){
    if(actionBusy)return;
    if(action==='unsend'&&!window.confirm('Unsend for everyone? The recipient may already have read or downloaded it.'))return;
    setActionBusy(true);setError('');
    const {error:actionError}=await (action==='pin'?supabase.rpc('pin_chat_message',{p_key:chatKey,p_message:message.id,p_pinned:!message.pinned}):supabase.rpc('manage_direct_message',{p_message:message.id,p_action:action,p_emoji:emoji}));
    if(actionError)setError(actionError.code==='PGRST202'?'Apply 20260908_direct_message_actions.sql to enable reactions and unsend.':actionError.message);
    else if(selected?.id)await loadMessages(selected.id);
    setActionBusy(false);
  }

  async function uploadFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !selected) return;
    const allowed = ['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    if (file.size > 15 * 1024 * 1024) return setError('Files must be 15 MB or smaller.');
    if (!allowed.includes(file.type)) return setError('This file type is not allowed.');
    setError('');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('chat-attachments').upload(path, file);
    if (uploadError) return setError('File upload failed.');
    const sent = await insertMessage({ body: file.name, message_type: file.type.startsWith('image/') ? 'image' : 'file', attachment_url: path, attachment_name: file.name, attachment_type: file.type });
    if (!sent) await supabase.storage.from('chat-attachments').remove([path]);
  }

  async function searchGifs(event) {
    event.preventDefault();
    if (!gifQuery.trim()) return;
    setGifLoading(true); setGifError(''); setGifs([]);
    try {
      const response = await fetch(`/api/gifs?q=${encodeURIComponent(gifQuery.trim())}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.meta?.msg || `GIPHY rejected the request (${response.status}).`);
      setGifs(json.gifs || []);
      if (!json.gifs?.length) setGifError('No GIFs found. Try another search.');
    } catch (requestError) {
      setGifError(requestError.message || 'Could not connect to GIPHY.');
    } finally { setGifLoading(false); }
  }

  async function loadTrendingGifs() {
    setGifLoading(true); setGifError(''); setGifs([]); setGifQuery('');
    try {
      const response = await fetch('/api/gifs');
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.meta?.msg || `GIPHY rejected the request (${response.status}).`);
      setGifs(json.gifs || []);
      if (!json.gifs?.length) setGifError('Trending GIFs are unavailable right now.');
    } catch (requestError) {
      setGifError(requestError.message || 'Could not connect to GIPHY.');
    } finally { setGifLoading(false); }
  }

  function openConversation(person) { setSelectedBatch(null); setSelected(person); setMinimized(false); setDirectoryOpen(false); setPicker(null); }
  async function blockConversation(){if(!selected||!window.confirm(`Block ${nameOf(selected)}?`))return;const{error:blockError}=await supabase.rpc('manage_alumni_block',{p_target:selected.id,p_block:true});if(blockError)setError(blockError.message);else{setPeople(current=>current.filter(person=>person.id!==selected.id));setSelected(null)}}

  return <div className="messenger-root">
    {directoryOpen && <aside className="messenger-directory">
      <header><div><h2>Chats</h2><small>{people.length} registered accounts</small></div><button onClick={() => setDirectoryOpen(false)} aria-label="Close chats">×</button></header>
      <label className="messenger-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search alumni or batch" /></label>
      <div className="batch-directory-scroll"><div className="messenger-people batch-chat-directory"><h3>Your batch chats</h3>{batchError && <p role="status">{batchError}</p>}{batchGroups.filter(group => `${group.name} ${group.batch_year || ''}`.toLowerCase().includes(search.toLowerCase())).map(group => <button key={group.id} onClick={() => { setSelected(null); setSelectedBatch(group); setDirectoryOpen(false); }}><span className="chat-avatar">{group.photo_url ? <img src={group.photo_url} alt="" /> : group.batch_year || 'B'}</span><span><strong>{group.name}</strong><small>{group.member_count} batch members</small></span></button>)}{!batchGroups.length && !batchError && <p>Join your batch under Alumni groups to access its chat.</p>}<h3>Direct messages</h3></div>
      <div className="messenger-people">{filtered.length ? filtered.map((person) => <button key={person.id} onClick={() => openConversation(person)}><Avatar person={person}/><span><strong>{nameOf(person)}</strong><small>{person.last_message_at ? 'Tap to continue chatting' : 'Start a conversation'}</small></span>{person.unread_count > 0 && <b>{person.unread_count}</b>}</button>) : <p>No registered accounts found.</p>}</div>
      </div>
    </aside>}

    {selectedBatch && <section className={`messenger-window batch-chat-widget ${batchMinimized?'batch-minimized':''}`} aria-label={`${selectedBatch.name} group chat`}><header><span className="chat-avatar small">{selectedBatch.photo_url?<img src={selectedBatch.photo_url} alt=""/>:'B'}</span><div><strong>{batchSettings.name||selectedBatch.name}</strong><small>{selectedBatch.member_count} members · Group chat</small></div><span className="batch-header-menu" ref={setBatchMenuTarget}/><button type="button" aria-label={batchMinimized?'Expand group chat':'Minimize group chat'} onClick={()=>setBatchMinimized(v=>!v)}>{batchMinimized?'+':'−'}</button><button type="button" aria-label="Close batch chat" onClick={() => setSelectedBatch(null)}>×</button></header><BatchConversation key={selectedBatch.id} group={selectedBatch} user={user} kind="chat" menuInHeader menuTarget={batchMenuTarget} /></section>}
    {selected && <section className={`messenger-window ${minimized ? 'minimized' : ''}`}>
      <header onClick={() => minimized && setMinimized(false)}><Avatar person={selected} small/><div><strong>{settings.name||settings.nicknames?.[selected.id]||nameOf(selected)}</strong><small>Registered alumni</small></div><ChatMenu key={chatKey} chatKey={chatKey} user={user} members={[{...profile,id:user.id},selected]} settings={settings} onSettings={setSettings} onBlock={blockConversation}/><button onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }} aria-label="Minimize chat">−</button><button onClick={(e) => { e.stopPropagation(); setSelected(null); }} aria-label="Close conversation">×</button></header>
      {!minimized && <>
        <ChatCover path={settings.cover}/><div className="messenger-messages batch-messenger-body direct-message-list">{messages.length ? messages.map(m=><DirectMessageBubble myName={settings.nicknames?.[user.id]} key={m.id} message={m} mine={m.sender_id===user.id} person={settings.nicknames?.[selected.id]?{...selected,first_name:settings.nicknames[selected.id],last_name:''}:selected} parent={messages.find(p=>p.id===m.reply_to)} reactions={directReactions.filter(r=>r.message_id===m.id)} busy={actionBusy} onReply={message=>{setDirectReply(message);directInputRef.current?.focus();}} onAction={directAction}/>) : <div className="message-empty"><Avatar person={selected}/><strong>{nameOf(selected)}</strong><p>You can now message each other.</p></div>}<div ref={endRef}/></div>
        {error && <p className="messenger-error">{error}</p>}
        {picker === 'emoji' && <div className="emoji-picker">{EMOJIS.map((emoji) => <button key={emoji} onClick={() => { setDraft((v) => v + emoji); setPicker(null); }}>{emoji}</button>)}</div>}
        {picker === 'gif' && <div className="gif-picker"><form onSubmit={searchGifs}><input value={gifQuery} onChange={(e) => setGifQuery(e.target.value)} placeholder="Search GIPHY" autoFocus/><button disabled={gifLoading}>{gifLoading ? '…' : 'Search'}</button></form><div className="gif-picker-label"><strong>{gifQuery.trim() ? 'Search GIFs' : 'Trending today'}</strong><span>Tap a GIF to send</span></div>{gifError && <p className="gif-error">{gifError}</p>}<div>{gifLoading ? Array.from({ length: 6 }, (_, index) => <i className="gif-skeleton" key={index}/>) : gifs.map((gif) => <button key={gif.id} onClick={() => insertMessage({ body: '', message_type: 'gif', attachment_url: gif.images.fixed_height_small.url, attachment_name: gif.title })}><img src={gif.images.fixed_height_small.url} alt={gif.title}/></button>)}</div><small className="giphy-credit">Powered by GIPHY</small></div>}
        <form className="messenger-composer" onSubmit={sendText}>{directReply&&<div className="batch-reply-compose"><div><strong>Replying to {directReply.sender_id===user.id?'yourself':nameOf(selected)}</strong><span>{messages.find(m=>m.id===directReply.id)?.unsent_at?'Message unsent':directReply.body||directReply.attachment_name||'Attachment'}</span></div><button type="button" aria-label="Cancel reply" onClick={()=>setDirectReply(null)}>×</button></div>}<div className="composer-tools"><button type="button" onClick={() => fileRef.current?.click()} title="Send photo or file">＋</button><button type="button" onClick={() => setPicker(picker === 'emoji' ? null : 'emoji')} title="Emoji">☺</button><button type="button" className="gif-button" onClick={() => setPicker(picker === 'gif' ? null : 'gif')}>GIF</button></div><div className="composer-input"><textarea ref={directInputRef} disabled={sending} aria-label="Message" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Aa" rows="1" maxLength="2000" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }}/><button disabled={!draft.trim() || sending} aria-label="Send">➤</button></div><input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={uploadFile}/></form>
      </>}
    </section>}

    <button className="messenger-launcher" onClick={() => setDirectoryOpen(!directoryOpen)} aria-label="Open alumni chats"><span>💬</span>{unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}</button>
  </div>;
}
