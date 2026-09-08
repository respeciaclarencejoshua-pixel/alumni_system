import {useState} from 'react';
import {LinkedText, MessageOptions} from './ChatExtras.jsx';
const EMOJI=['👍','❤️','😂','😮','😢','🙏'];
export default function DirectMessageBubble({message:m,mine,person,reactions,onReply,onAction,busy,parent,myName}){
 const[choosing,setChoosing]=useState(false);
 const name=[person?.first_name,person?.last_name].filter(Boolean).join(' ')||'Alumni member';
 return <div className={`message-row ${mine?'mine':''}`}>
  {!mine&&<span className="chat-avatar small">{person?.avatar_url?<img src={person.avatar_url} alt={name}/>:name.slice(0,1)}</span>}
  <div className="batch-message-content"><strong className="batch-sender">{mine?(myName||'You'):name}</strong><div className="message-bubble">
   {m.reply_to&&!m.unsent_at&&<blockquote className="batch-reply-quote"><strong>Reply</strong><span>{parent?.unsent_at?'Message unsent':parent?.body||parent?.attachment_name||'Original message unavailable'}</span></blockquote>}
   {m.unsent_at?<p className="batch-unsent">Message unsent</p>:<>
    {m.message_type==='image'&&<a href={m.attachment_url} target="_blank" rel="noreferrer"><img src={m.attachment_url} alt={m.attachment_name||'Shared image'}/></a>}
    {m.message_type==='gif'&&<img src={m.attachment_url} alt="Shared GIF"/>}
    {m.message_type==='file'&&<a className="message-file" href={m.attachment_url} target="_blank" rel="noreferrer">📎 {m.attachment_name||m.body}</a>}
    {m.body&&!['file','image'].includes(m.message_type)&&<p><LinkedText text={m.body}/></p>}
   </>}
   <time dateTime={m.created_at} title={new Date(m.created_at).toLocaleString()}>{new Date(m.created_at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}{mine?(m.read_at?' · Seen':' · Sent'):''}</time>
  </div>
  {!m.unsent_at&&<><div className="batch-message-actions">
   <MessageOptions pinned={m.pinned} busy={busy} onPin={()=>onAction(m,'pin')} onUnsend={mine?()=>onAction(m,'unsend'):undefined}/>
   <button type="button" disabled={busy} aria-label="Reply to message" title="Reply" onClick={()=>onReply(m)}>↩</button>
   <button type="button" disabled={busy} aria-label="React to message" title="React" aria-expanded={choosing} onClick={()=>setChoosing(v=>!v)}>☺</button>
  </div>{choosing&&<div className="batch-reaction-picker">{EMOJI.map(emoji=><button type="button" disabled={busy} key={emoji} aria-label={`React ${emoji}`} onClick={()=>{onAction(m,'react',emoji);setChoosing(false);}}>{emoji}</button>)}</div>}
  <div className="batch-reaction-counts">{EMOJI.map(emoji=>{const votes=reactions.filter(r=>r.emoji===emoji);return votes.length>0&&<button type="button" key={emoji} disabled={busy} aria-pressed={votes.some(r=>r.isMine)} onClick={()=>onAction(m,'react',emoji)}>{emoji} {votes.length}</button>;})}</div></>}
 </div></div>;
}
