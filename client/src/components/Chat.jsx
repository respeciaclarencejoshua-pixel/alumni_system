import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Chat.css';

const EMOJIS = ['😀','😂','🥰','😍','😊','😎','😭','😡','👍','👏','🙏','🎉','❤️','💚','🔥','✨','✅','🎓','🤝','💯'];
const nameOf = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || 'Alumni member';
const initialsOf = (p) => `${p?.first_name?.[0] || ''}${p?.last_name?.[0] || ''}`.toUpperCase() || 'A';

function Avatar({ person, small = false }) {
  return <span className={`chat-avatar ${small ? 'small' : ''}`}>{person?.avatar_url ? <img src={person.avatar_url} alt="" /> : initialsOf(person)}</span>;
}

export default function Chat({ user, contact, onContactHandled }) {
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState(null);
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
  const fileRef = useRef(null);

  async function loadPeople() {
    const { data, error: loadError } = await supabase.rpc('list_chat_profiles');
    if (loadError) setError('Apply the latest Supabase schema to enable chat.');
    else setPeople((data || []).filter((p) => p.id !== user.id));
  }

  async function loadMessages(personId) {
    const { data, error: loadError } = await supabase.from('direct_messages').select('*')
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${personId}),and(sender_id.eq.${personId},recipient_id.eq.${user.id})`)
      .order('created_at', { ascending: false }).limit(100);
    if (loadError) setError('Messages could not be loaded.'); else {
      const resolved = await Promise.all((data || []).map(async (message) => {
        if (!message.attachment_url || message.message_type === 'gif' || message.attachment_url.startsWith('http')) return message;
        const { data: signed } = await supabase.storage.from('chat-attachments').createSignedUrl(message.attachment_url, 3600);
        return { ...message, attachment_url: signed?.signedUrl || '' };
      }));
      setMessages(resolved.reverse());
    }
    await supabase.from('direct_messages').update({ read_at: new Date().toISOString() })
      .eq('sender_id', personId).eq('recipient_id', user.id).is('read_at', null);
  }

  useEffect(() => { loadPeople(); }, [user.id]);
  useEffect(() => { if (contact?.id) { setSelected(contact); setDirectoryOpen(true); setMinimized(false); onContactHandled?.(); } }, [contact?.id]);
  useEffect(() => { if (selected?.id) loadMessages(selected.id); }, [selected?.id]);
  useEffect(() => {
    const channel = supabase.channel(`chat-widget:${user.id}`).on('postgres_changes',
      { event: '*', schema: 'public', table: 'direct_messages',filter:`sender_id=eq.${user.id}` }, () => {
        loadPeople(); if (selected?.id) loadMessages(selected.id);
      }).on('postgres_changes',{event:'*',schema:'public',table:'direct_messages',filter:`recipient_id=eq.${user.id}`}, () => {
        loadPeople(); if (selected?.id) loadMessages(selected.id);
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user.id, selected?.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, minimized]);
  useEffect(() => { if (picker === 'gif') loadTrendingGifs(); }, [picker]);

  const unread = people.reduce((sum, p) => sum + Number(p.unread_count || 0), 0);
  const filtered = useMemo(() => people.filter((p) => nameOf(p).toLowerCase().includes(search.toLowerCase())), [people, search]);

  async function insertMessage(payload) {
    if (!selected || sending) return false;
    setSending(true); setError('');
    const { error: sendError } = await supabase.from('direct_messages').insert({ sender_id: user.id, recipient_id: selected.id, body: payload.body || '', ...payload });
    if (sendError) setError('Message could not be sent.'); else { setDraft(''); setPicker(null); await loadMessages(selected.id); }
    setSending(false);
    return !sendError;
  }

  function sendText(event) { event.preventDefault(); if (draft.trim()) insertMessage({ body: draft.trim(), message_type: 'text' }); }

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

  function openConversation(person) { setSelected(person); setMinimized(false); setDirectoryOpen(false); setPicker(null); }
  async function blockConversation(){if(!selected||!window.confirm(`Block ${nameOf(selected)}?`))return;const{error:blockError}=await supabase.rpc('manage_alumni_block',{p_target:selected.id,p_block:true});if(blockError)setError(blockError.message);else{setPeople(current=>current.filter(person=>person.id!==selected.id));setSelected(null)}}

  return <div className="messenger-root">
    {directoryOpen && <aside className="messenger-directory">
      <header><div><h2>Chats</h2><small>{people.length} registered accounts</small></div><button onClick={() => setDirectoryOpen(false)} aria-label="Close chats">×</button></header>
      <label className="messenger-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search alumni" /></label>
      <div className="messenger-people">{filtered.length ? filtered.map((person) => <button key={person.id} onClick={() => openConversation(person)}><Avatar person={person}/><span><strong>{nameOf(person)}</strong><small>{person.last_message_at ? 'Tap to continue chatting' : 'Start a conversation'}</small></span>{person.unread_count > 0 && <b>{person.unread_count}</b>}</button>) : <p>No registered accounts found.</p>}</div>
    </aside>}

    {selected && <section className={`messenger-window ${minimized ? 'minimized' : ''}`}>
      <header onClick={() => minimized && setMinimized(false)}><Avatar person={selected} small/><div><strong>{nameOf(selected)}</strong><small>Registered alumni</small></div><button onClick={(e)=>{e.stopPropagation();blockConversation()}} aria-label="Block this alumnus" title="Block alumnus">⊘</button><button onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }} aria-label="Minimize chat">−</button><button onClick={(e) => { e.stopPropagation(); setSelected(null); }} aria-label="Close conversation">×</button></header>
      {!minimized && <>
        <div className="messenger-messages">{messages.length ? messages.map((m) => <div key={m.id} className={`message-row ${m.sender_id === user.id ? 'mine' : ''}`}><div className="message-bubble">
          {m.message_type === 'image' && <a href={m.attachment_url} target="_blank" rel="noreferrer"><img src={m.attachment_url} alt={m.attachment_name || 'Shared image'} /></a>}
          {m.message_type === 'gif' && <img src={m.attachment_url} alt="Shared GIF" />}
          {m.message_type === 'file' && <a className="message-file" href={m.attachment_url} target="_blank" rel="noreferrer">📎 <span>{m.attachment_name || m.body}</span></a>}
          {m.body && m.message_type !== 'file' && m.message_type !== 'image' && <p>{m.body}</p>}
          <time>{new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{m.sender_id===user.id?m.read_at?' · Seen':' · Sent':''}</time>
        </div></div>) : <div className="message-empty"><Avatar person={selected}/><strong>{nameOf(selected)}</strong><p>You can now message each other.</p></div>}<div ref={endRef}/></div>
        {error && <p className="messenger-error">{error}</p>}
        {picker === 'emoji' && <div className="emoji-picker">{EMOJIS.map((emoji) => <button key={emoji} onClick={() => { setDraft((v) => v + emoji); setPicker(null); }}>{emoji}</button>)}</div>}
        {picker === 'gif' && <div className="gif-picker"><form onSubmit={searchGifs}><input value={gifQuery} onChange={(e) => setGifQuery(e.target.value)} placeholder="Search GIPHY" autoFocus/><button disabled={gifLoading}>{gifLoading ? '…' : 'Search'}</button></form><div className="gif-picker-label"><strong>{gifQuery.trim() ? 'Search GIFs' : 'Trending today'}</strong><span>Tap a GIF to send</span></div>{gifError && <p className="gif-error">{gifError}</p>}<div>{gifLoading ? Array.from({ length: 6 }, (_, index) => <i className="gif-skeleton" key={index}/>) : gifs.map((gif) => <button key={gif.id} onClick={() => insertMessage({ body: '', message_type: 'gif', attachment_url: gif.images.fixed_height_small.url, attachment_name: gif.title })}><img src={gif.images.fixed_height_small.url} alt={gif.title}/></button>)}</div><small className="giphy-credit">Powered by GIPHY</small></div>}
        <form className="messenger-composer" onSubmit={sendText}><div className="composer-tools"><button type="button" onClick={() => fileRef.current?.click()} title="Send photo or file">＋</button><button type="button" onClick={() => setPicker(picker === 'emoji' ? null : 'emoji')} title="Emoji">☺</button><button type="button" className="gif-button" onClick={() => setPicker(picker === 'gif' ? null : 'gif')}>GIF</button></div><div className="composer-input"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Aa" rows="1" maxLength="2000" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }}/><button disabled={!draft.trim() || sending} aria-label="Send">➤</button></div><input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={uploadFile}/></form>
      </>}
    </section>}

    <button className="messenger-launcher" onClick={() => setDirectoryOpen(!directoryOpen)} aria-label="Open alumni chats"><span>💬</span>{unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}</button>
  </div>;
}
