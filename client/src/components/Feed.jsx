import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Feed.css';
import './FeedEnhancements.css';
import './SocialProfile.css';
import './FeedPostMenu.css';

const emojiChoices = ['\u{1F600}', '\u{1F389}', '\u{2764}\u{FE0F}', '\u{1F64F}', '\u{1F44F}', '\u{1F31F}'];
const reactionChoices = [
  { id: 'like', icon: 'like', emoji: '\u{1F44D}', label: 'Like' },
  { id: 'celebrate', icon: 'celebrate', emoji: '\u{1F389}', label: 'Celebrate' },
  { id: 'support', icon: 'support', emoji: '\u{2764}\u{FE0F}', label: 'Support' },
];
const PAGE_SIZE = 10;
const reportReasons = ['spam','harassment','inappropriate','misinformation','privacy','copyright','scam','other'];

const Icon = ({ name, size = 20 }) => {
  const icons = {
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>,
    comment: <path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4Z" />,
    feed: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    send: <path d="m22 2-7 20-4-9-9-4ZM22 2 11 13" />,
    like: <><path d="M7 10v11H3V10h4Z" /><path d="M7 20h10.4a2 2 0 0 0 2-1.6l1.2-6A2 2 0 0 0 18.6 10H14l.7-3.4A3 3 0 0 0 11.8 3L7 10Z" /></>,
    celebrate: <><path d="m4 20 4.5-12 7.5 7.5L4 20Z" /><path d="m8.5 8 7.5 7.5M14 4l1-2M18 7l3-1M17 11l2 2M10 5 1-3" /></>,
    support: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    dots: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
};

function withTimeout(operation, message = 'The request timed out. Please check your connection and try again.') {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), 15000);
  });
  return Promise.race([operation, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function formatDate(value) {
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hours ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)} days ago`;
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function extractHashtags(value = '') {
  return value.match(/#[\p{L}\p{N}_]+/gu) || [];
}

function normalizePost(post) {
  return {
    ...post,
    feed_reactions: post.feed_reactions || [],
    feed_comments: (post.feed_comments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    feed_saved_posts: post.feed_saved_posts || [],
  };
}

function PersonAvatar({ person, className='' }) {
  const name=[person.first_name,person.last_name].filter(Boolean).join(' ');
  const initials=name.split(/\s+/).map((part)=>part[0]).slice(0,2).join('').toUpperCase();
  return person.avatar_url?<img className={className} src={person.avatar_url} alt=""/>:<span className={`${className} mention-initials`} aria-hidden="true">{initials}</span>;
}

function RichText({ text, people, onHashtag, onMention, className }) {
  const names = people.map((person) => [person.first_name, person.last_name].filter(Boolean).join(' ').trim()).filter(Boolean).sort((a,b)=>b.length-a.length);
  const escapedNames = names.map((name)=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const matcher = new RegExp(`(#[\\p{L}\\p{N}_]+${escapedNames.length?`|@(?:${escapedNames.join('|')})`:''})`,'giu');
  const parts = text.split(matcher);
  return <p className={className}>{parts.map((part,index)=>{if(part.startsWith('#'))return <button type="button" className="post-hashtag" key={`${part}-${index}`} onClick={()=>onHashtag?.(part.toLowerCase())}>{part}</button>;const person=part.startsWith('@')?people.find((item)=>`@${[item.first_name,item.last_name].filter(Boolean).join(' ')}`.toLowerCase()===part.toLowerCase()):null;return person?<span className="mention-wrap" key={`${part}-${index}`}><button type="button" className="feed-mention" onClick={()=>onMention?.(person)}>{part}</button><span className="mention-hover-card" role="tooltip"><PersonAvatar person={person}/><span><strong>{part.slice(1)}</strong><small>{[person.job_title,person.organization,person.course,person.graduation_year&&`Class of ${person.graduation_year}`].filter(Boolean).join(' · ')||'Verified NDDU alumnus'}</small><em>View profile</em></span></span></span>:part;})}</p>;
}

function PostText({ text, people, onHashtag, onMention }) {
  return <RichText text={text} people={people} onHashtag={onHashtag} onMention={onMention} className="post-content" />;
}

function MentionOption({ person, onSelect }) {
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ');
  const initials = name.split(/\s+/).map((part) => part[0]).slice(0,2).join('').toUpperCase();
  return <button type="button" role="option" className="mention-option" onClick={onSelect}>{person.avatar_url ? <img src={person.avatar_url} alt="" /> : <span className="mention-initials" aria-hidden="true">{initials}</span>}<span><strong>{name}</strong><small>{[person.job_title,person.organization,person.course,person.graduation_year&&`Class of ${person.graduation_year}`].filter(Boolean).join(' · ')||'NDDU Alumni'}</small></span></button>;
}

export default function Feed({ user, profile, verificationStatus, onMessage, onViewProfile }) {
  const firstName = profile?.first_name?.trim() || user?.user_metadata?.first_name?.trim() || user?.email?.split('@')[0] || 'Alumni';
  const lastName = profile?.last_name?.trim() || user?.user_metadata?.last_name?.trim() || '';
  const displayName = [firstName, lastName].filter(Boolean).join(' ');
  const email = profile?.email || user?.email || '';
  const avatar = profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=012b09&color=ffffff&bold=true`;
  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState('');
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const [postGif, setPostGif] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [activeHashtag, setActiveHashtag] = useState('');
  const [openComments, setOpenComments] = useState([]);
  const [openReactionPost, setOpenReactionPost] = useState('');
  const [commentDrafts, setCommentDrafts] = useState({});
  const [commentFiles, setCommentFiles] = useState({});
  const [commentGifs, setCommentGifs] = useState({});
  const [replyingTo, setReplyingTo] = useState({});
  const [people, setPeople] = useState([]);
  const [mentionPost, setMentionPost] = useState('');
  const [emojiPickerPost, setEmojiPickerPost] = useState('');
  const [gifPickerPost, setGifPickerPost] = useState('');
  const [gifs, setGifs] = useState([]);
  const [gifError, setGifError] = useState('');
  const [selectedMention, setSelectedMention] = useState(null);
  const [mentionProfileState, setMentionProfileState] = useState('idle');
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [busyPost, setBusyPost] = useState('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [reporting, setReporting] = useState(null);
  const [reportReason, setReportReason] = useState('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [postMenu, setPostMenu] = useState('');
  const [hiddenPostIds, setHiddenPostIds] = useState([]);
  const [editingPost, setEditingPost] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [historyPost, setHistoryPost] = useState(null);
  const [editHistory, setEditHistory] = useState([]);
  const mediaInput = useRef(null);
  const composerInput = useRef(null);

  function replacePost(postId, update) {
    setPosts((current) => current.map((post) => post.id === postId ? update(post) : post));
  }

  async function loadPosts(nextPage = 0) {
    setLoading(true);
    setMessage('');
    try {
      const enriched = await withTimeout(
        supabase.from('feed_posts').select('*, feed_reactions(user_id, reaction), feed_comments(id, user_id, author_name, content, created_at, parent_comment_id, media_path, gif_url), feed_saved_posts(user_id)').eq('moderation_status','published').is('deleted_at',null).order('created_at', { ascending: false }).range(nextPage * PAGE_SIZE, nextPage * PAGE_SIZE + PAGE_SIZE - 1)
      );
      if (!enriched.error) {
        const rows = (enriched.data || []).map(normalizePost);
        setPosts((current) => nextPage ? [...current, ...rows] : rows);
        setHasMore(rows.length === PAGE_SIZE); setPage(nextPage);
      } else {
        const basic = await withTimeout(supabase.from('feed_posts').select('*').eq('moderation_status','published').is('deleted_at',null).order('created_at', { ascending: false }).range(nextPage * PAGE_SIZE, nextPage * PAGE_SIZE + PAGE_SIZE - 1));
        if (basic.error) throw basic.error;
        const rows = (basic.data || []).map(normalizePost);
        setPosts((current) => nextPage ? [...current, ...rows] : rows);
        setHasMore(rows.length === PAGE_SIZE); setPage(nextPage);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPosts(); }, []);
  useEffect(() => { if(user?.id) supabase.from('hidden_feed_posts').select('post_id').eq('user_id',user.id).then(({data})=>setHiddenPostIds((data||[]).map(row=>row.post_id))); }, [user?.id]);
  useEffect(() => { if(!selectedMention)return; const close=(event)=>event.key==='Escape'&&setSelectedMention(null); window.addEventListener('keydown',close); return()=>window.removeEventListener('keydown',close); }, [selectedMention]);
  useEffect(() => {
    if(!selectedMention?.id || selectedMention._detailsLoaded)return;
    setMentionProfileState('loading');
    supabase.rpc('get_public_alumni_profile',{p_profile_id:selectedMention.id}).maybeSingle().then(({data,error})=>{
      if(data)setSelectedMention((current)=>current?.id===data.id?{...current,...data,_detailsLoaded:true}:current);
      else setSelectedMention((current)=>current?{...current,_detailsLoaded:true}:current);
      setMentionProfileState(error?'unavailable':'ready');
    });
  }, [selectedMention?.id, selectedMention?._detailsLoaded]);
  useEffect(() => { if (verificationStatus === 'verified') supabase.rpc('list_chat_profiles').then(({ data, error }) => { if (error) setMessage('Alumni mentions require the latest Supabase schema.'); else setPeople((data || []).filter((person) => [person.first_name, person.last_name].some((name) => name?.trim())).sort((a,b) => `${a.first_name||''} ${a.last_name||''}`.localeCompare(`${b.first_name||''} ${b.last_name||''}`))); }); }, [verificationStatus]);
  useEffect(() => {
    const visibleAuthors = posts.flatMap((post) => [{ id: post.user_id, author_name: post.author_name }, ...(post.feed_comments || []).map((comment) => ({ id: comment.user_id, author_name: comment.author_name }))]);
    setPeople((current) => {
      const merged = new Map(current.map((person) => [person.id, person]));
      visibleAuthors.forEach((author) => {
        if (!author.id || !author.author_name?.trim() || merged.has(author.id)) return;
        const parts = author.author_name.trim().split(/\s+/);
        merged.set(author.id, { id: author.id, first_name: parts.shift() || '', last_name: parts.join(' '), avatar_url: posts.find((post)=>post.user_id===author.id)?.author_avatar_url || null });
      });
      return [...merged.values()].sort((a,b) => `${a.first_name||''} ${a.last_name||''}`.localeCompare(`${b.first_name||''} ${b.last_name||''}`));
    });
  }, [posts]);

  const hashtags = useMemo(() => {
    const counts = new Map();
    posts.forEach((post) => extractHashtags(post.content).forEach((tag) => {
      const normalized = tag.toLowerCase();
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [posts]);

  const visiblePosts = useMemo(() => posts.filter((post) => {
    const savedMatch = !savedOnly || post.feed_saved_posts.some((save) => save.user_id === user?.id);
    const tagMatch = !activeHashtag || extractHashtags(post.content).some((tag) => tag.toLowerCase() === activeHashtag);
    return savedMatch && tagMatch && !hiddenPostIds.includes(post.id);
  }), [posts, savedOnly, activeHashtag, user?.id, hiddenPostIds]);

  function insertEmoji(emoji) {
    const input = composerInput.current;
    const start = input?.selectionStart ?? content.length;
    const end = input?.selectionEnd ?? content.length;
    setContent(`${content.slice(0, start)}${emoji}${content.slice(end)}`);
    setShowEmojis(false);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function publish() {
    if (!user?.id) return setMessage('Please sign in before publishing a post.');
    if (verificationStatus !== 'verified') return setMessage('Complete alumni verification before participating in the community feed.');
    if (!content.trim() && !media && !postGif) return setMessage('Write an update or attach a photo or GIF before posting.');
    if (media && (!['image/jpeg', 'image/png', 'image/webp'].includes(media.type) || media.size > 10 * 1024 * 1024)) return setMessage('Use a JPG, PNG, or WebP image no larger than 10 MB.');
    setSubmitting(true);
    setMessage('');
    let mediaPath = null;
    let mediaUrl = null;
    try {
      if (media) {
        mediaPath = `${user.id}/${crypto.randomUUID()}.${media.name.split('.').pop().toLowerCase()}`;
        const upload = await supabase.storage.from('feed-media').upload(mediaPath, media, { contentType: media.type, upsert: false });
        if (upload.error) throw upload.error;
        mediaUrl = supabase.storage.from('feed-media').getPublicUrl(mediaPath).data.publicUrl;
      }
      const result = await withTimeout(supabase.from('feed_posts').insert({ user_id: user.id, author_name: displayName, author_avatar_url: profile?.avatar_url || null, content: content.trim(), media_path: mediaPath, gif_url:postGif||null }).select().single());
      if (result.error) throw result.error;
      setPosts((current) => [{ ...normalizePost(result.data), media_url: mediaUrl }, ...current]);
      setContent('');
      setPostGif('');
      setMedia(null);
      if (mediaInput.current) mediaInput.current.value = '';
      setMessage('Your post is now visible to the alumni community.');
    } catch (error) {
      if (mediaPath) await supabase.storage.from('feed-media').remove([mediaPath]);
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function react(post, reaction) {
    if (verificationStatus !== 'verified') return setMessage('Complete alumni verification before reacting to posts.');
    if (!user?.id) return setMessage('Please sign in to react to a post.');
    if (post.reactions_disabled) return setMessage('Reactions have been disabled by a moderator.');
    setBusyPost(post.id);
    const existing = post.feed_reactions.find((item) => item.user_id === user.id);
    const query = existing?.reaction === reaction
      ? supabase.from('feed_reactions').delete().eq('post_id', post.id).eq('user_id', user.id)
      : supabase.from('feed_reactions').upsert({ post_id: post.id, user_id: user.id, reaction }, { onConflict: 'post_id,user_id' });
    const { error } = await query;
    if (error) setMessage('Reactions will be available after the updated database schema is applied.');
    else replacePost(post.id, (current) => ({ ...current, feed_reactions: [...current.feed_reactions.filter((item) => item.user_id !== user.id), ...(existing?.reaction === reaction ? [] : [{ user_id: user.id, reaction }])] }));
    setOpenReactionPost('');
    setBusyPost('');
  }

  async function toggleSave(post) {
    if (!user?.id) return setMessage('Please sign in to save a post.');
    setBusyPost(post.id);
    const saved = post.feed_saved_posts.some((item) => item.user_id === user.id);
    const query = saved
      ? supabase.from('feed_saved_posts').delete().eq('post_id', post.id).eq('user_id', user.id)
      : supabase.from('feed_saved_posts').insert({ post_id: post.id, user_id: user.id });
    const { error } = await query;
    if (error) setMessage('Saved posts will be available after the updated database schema is applied.');
    else replacePost(post.id, (current) => ({ ...current, feed_saved_posts: saved ? current.feed_saved_posts.filter((item) => item.user_id !== user.id) : [...current.feed_saved_posts, { user_id: user.id }] }));
    setBusyPost('');
  }

  async function addComment(post) {
    if (verificationStatus !== 'verified') return setMessage('Complete alumni verification before commenting.');
    const draft = commentDrafts[post.id]?.trim();
    if (!user?.id) return setMessage('Please sign in to comment.');
    if (post.comments_locked) return setMessage('Comments have been locked by a moderator.');
    const file = commentFiles[post.id]; const gifUrl = commentGifs[post.id];
    if (!draft && !file && !gifUrl) return;
    setBusyPost(post.id);
    let mediaPath = null;
    if (file) {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setBusyPost(''); return setMessage('Comment photos must be JPG, PNG, or WebP and no larger than 10 MB.'); }
      mediaPath = `${user.id}/comments/${crypto.randomUUID()}.${file.name.split('.').pop().toLowerCase()}`;
      const upload = await supabase.storage.from('feed-media').upload(mediaPath, file, { contentType:file.type });
      if (upload.error) { setBusyPost(''); return setMessage(upload.error.message); }
    }
    const { data, error } = await supabase.from('feed_comments').insert({ post_id: post.id, user_id: user.id, author_name: displayName, content: draft || null, parent_comment_id:replyingTo[post.id]?.id || null, media_path:mediaPath, gif_url:gifUrl || null }).select().single();
    if (error) setMessage('Comments will be available after the updated database schema is applied.');
    else {
      replacePost(post.id, (current) => ({ ...current, feed_comments: [...current.feed_comments, data] }));
      setCommentDrafts((current) => ({ ...current, [post.id]: '' }));
      setCommentFiles((current) => ({ ...current, [post.id]: null })); setCommentGifs((current) => ({ ...current, [post.id]: '' })); setReplyingTo((current) => ({ ...current, [post.id]: null }));
    }
    if (error && mediaPath) await supabase.storage.from('feed-media').remove([mediaPath]);
    setBusyPost('');
  }

  const hasMentionQuery = (value) => /(?:^|\s)@[^@\s]*$/.test(value);
  const mentionSearch = (value) => value.match(/@([^@\s]*)$/)?.[1]?.toLowerCase() || '';
  const mentionMatches = (person, value) => {
    const query = mentionSearch(value);
    return !query || [person.first_name, person.last_name].some((name) => name?.trim().toLowerCase().startsWith(query));
  };
  function addMention(postId, person) { const name=[person.first_name,person.last_name].filter(Boolean).join(' '); setCommentDrafts((current)=>({ ...current,[postId]:(current[postId]||'').replace(/@[^@\s]*$/,`@${name} `) })); setMentionPost(''); }
  async function openGifPicker(postId) { setGifPickerPost(postId); setGifError(''); setGifs([]); try { const response=await fetch('/api/gifs'); const json=await response.json().catch(()=>({})); if(!response.ok)throw new Error(json.error||'GIFs are unavailable.'); setGifs(json.gifs||[]); if(!json.gifs?.length)setGifError('No GIFs are available right now.'); } catch(error) { setGifError(error.message); } }

  async function changeConnection() {
    if(!selectedMention?.id||connectionBusy)return;
    setConnectionBusy(true);
    const action=selectedMention.connection_status==='incoming'?'accept':selectedMention.connection_status==='friends'?'remove':'request';
    const {data,error}=await supabase.rpc('manage_alumni_connection',{p_target:selectedMention.id,p_action:action});
    if(error)setMessage(error.message); else setSelectedMention((current)=>({...current,connection_status:data,_detailsLoaded:true}));
    setConnectionBusy(false);
  }

  async function reportPost(event) {
    event.preventDefault();
    if (verificationStatus !== 'verified') return setMessage('Complete alumni verification before reporting community content.');
    const { error } = await supabase.from('content_reports').insert({ reporter_id:user.id,target_type:'feed_post',target_id:reporting.id,reason:reportReason,details:reportDetails.trim()||null });
    setMessage(error ? error.code==='23505'?'You already have an open report for this post.':error.message : 'Report submitted privately for administrator review.');
    if (!error) { setReporting(null); setReportDetails(''); setReportReason('spam'); }
  }

  async function hidePost(post) {
    if (!user?.id) return setMessage('Please sign in to hide a post.');
    const {error}=await supabase.from('hidden_feed_posts').upsert({post_id:post.id,user_id:user.id});
    if(error)setMessage('Hiding posts requires the latest database schema.');
    else { setHiddenPostIds(current=>[...new Set([...current,post.id])]); setMessage('Post hidden from your feed.'); }
    setPostMenu('');
  }

  async function deletePost(post) {
    if(!window.confirm('Delete this post? It will no longer appear in the community feed.'))return;
    setBusyPost(post.id);setPostMenu('');
    const {error}=await supabase.rpc('manage_own_feed_post',{p_post_id:post.id,p_action:'delete',p_content:null});
    if(error)setMessage(error.message);else {setPosts(current=>current.filter(item=>item.id!==post.id));setMessage('Your post was deleted.');}
    setBusyPost('');
  }

  function beginEdit(post){setEditingPost(post);setEditContent(post.content||'');setPostMenu('')}
  async function savePostEdit(event){event.preventDefault();if(!editingPost)return;setBusyPost(editingPost.id);const {data,error}=await supabase.rpc('manage_own_feed_post',{p_post_id:editingPost.id,p_action:'edit',p_content:editContent}).single();if(error)setMessage(error.message);else {replacePost(editingPost.id,current=>({...current,...data}));setEditingPost(null);setMessage('Your post was updated.');}setBusyPost('')}
  async function showEditHistory(post){setPostMenu('');setHistoryPost(post);setEditHistory([]);const {data,error}=await supabase.from('feed_post_edit_history').select('id,previous_content,edited_at').eq('post_id',post.id).order('edited_at',{ascending:false});if(error)setMessage('Edit history requires the latest database schema.');else setEditHistory(data||[])}

  return (
    <div className="feed-page">
      <header className="feed-heading alumni-module-hero"><div><p>NDDU Alumni Community</p><h1 id="feed-heading">Alumni Feed</h1><span>Share milestones, memories, opportunities, and encouragement.</span></div></header>
      <div className="feed-layout feed-layout-live">
      <aside className="feed-sidebar-left" aria-label="Feed options">
        <section className="profile-card profile-card-clickable" onClick={onViewProfile} onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onViewProfile?.()}}} role="button" tabIndex="0" aria-label="Open your alumni profile">
          <img className="profile-image" src={avatar} alt={`${displayName}'s profile`} />
          <h2>{displayName}</h2>
          <p className="profile-email">{email || 'NDDU Alumni'}</p>
          <nav className="feed-nav" aria-label="Post views" onClick={(event)=>event.stopPropagation()} onKeyDown={(event)=>event.stopPropagation()}>
            <button className={`nav-item ${!savedOnly ? 'active' : ''}`} onClick={() => setSavedOnly(false)}><Icon name="feed" /><span>All posts</span></button>
            <button className={`nav-item ${savedOnly ? 'active' : ''}`} onClick={() => setSavedOnly(true)}><Icon name="bookmark" /><span>Saved posts</span></button>
          </nav>
        </section>
        <section className="feed-topics">
          <h2>Popular topics</h2>
          {hashtags.length ? hashtags.map(([tag, count]) => <button key={tag} className={activeHashtag === tag ? 'active' : ''} onClick={() => setActiveHashtag(activeHashtag === tag ? '' : tag)}><span>{tag}</span><small>{count} {count === 1 ? 'post' : 'posts'}</small></button>) : <p>Hashtags from alumni posts will appear here.</p>}
        </section>
      </aside>

      <section className="feed-main" aria-labelledby="feed-heading">
        <section className="post-creator" aria-labelledby="create-post-title">
          <img src={avatar} alt="" className="avatar" />
          <div className="creator-input">
            <label id="create-post-title" htmlFor="feed-post-content">Share an update</label>
            <textarea ref={composerInput} id="feed-post-content" placeholder="Share an update. Type @ to mention an alumnus." value={content} onChange={(event) => {setContent(event.target.value);setMentionPost(hasMentionQuery(event.target.value)?'composer':'')}} maxLength="2000" />
            <div className="creator-meta"><span>{content.length} of 2,000 characters</span>{media && <span className="selected-media">Photo selected: {media.name}<button type="button" onClick={() => setMedia(null)}>Remove</button></span>}</div>
            <input ref={mediaInput} className="feed-media-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setMedia(event.target.files?.[0] || null)} />
            <div className="creator-actions">
              <div className="creator-buttons">
                <button type="button" className="creator-btn" onClick={() => mediaInput.current?.click()}><Icon name="image" />Add photo</button>
                <div className="emoji-control">
                  <button type="button" className="creator-btn" aria-expanded={showEmojis} onClick={() => setShowEmojis((open) => !open)}><Icon name="smile" />Add emoji</button>
                  {showEmojis && <div className="emoji-picker" aria-label="Choose an emoji">{emojiChoices.map((emoji) => <button type="button" key={emoji} onClick={() => insertEmoji(emoji)} aria-label={`Insert ${emoji}`}>{emoji}</button>)}</div>}
                </div>
                <button type="button" className="creator-btn" onClick={()=>openGifPicker('composer')}>GIF</button>
              </div>
              <button className="post-button" type="button" disabled={submitting} onClick={publish}>{submitting ? 'Publishing...' : 'Publish post'}</button>
            </div>
            {mentionPost==='composer'&&<div className="mention-picker" role="listbox" aria-label="Mention an alumnus">{people.filter((person)=>person.id!==user.id&&mentionMatches(person,content)).slice(0,8).map((person)=><MentionOption person={person} key={person.id} onSelect={()=>{const name=[person.first_name,person.last_name].filter(Boolean).join(' ');setContent((value)=>value.replace(/@[^@\s]*$/,`@${name} `));setMentionPost('')}}/>)}{!people.some((person)=>person.id!==user.id&&mentionMatches(person,content))&&<p>No matching alumni found.</p>}</div>}
            {gifPickerPost==='composer'&&<div className="comment-gif-picker">{gifError&&<p className="gif-picker-error" role="alert">{gifError}</p>}{gifs.map((gif)=><button type="button" key={gif.id} onClick={()=>{setPostGif(gif.images.fixed_height_small.url);setGifPickerPost('')}}><img src={gif.images.fixed_height_small.url} alt={gif.title||'Choose GIF'}/></button>)}</div>}
            {postGif&&<div className="selected-gif"><img src={postGif} alt="Selected GIF"/><button type="button" onClick={()=>setPostGif('')}>Remove GIF</button></div>}
            {message && <p className={`feed-message ${message === 'Your post is now visible to the alumni community.' ? 'feed-message-success' : ''}`} role="status">{message}</p>}
          </div>
        </section>

        {activeHashtag && <div className="feed-filter"><span>Showing posts tagged <strong>{activeHashtag}</strong></span><button onClick={() => setActiveHashtag('')}>Clear filter</button></div>}

        <section className="feed-posts" aria-label="Alumni posts">
          {loading ? <p className="feed-empty">Loading alumni posts...</p> : visiblePosts.length === 0 ? <div className="feed-empty"><h2>No posts found</h2><p>{savedOnly ? 'Posts you save will appear here.' : 'Try another hashtag or share a new update.'}</p></div> : visiblePosts.map((post) => {
            const currentReaction = post.feed_reactions.find((item) => item.user_id === user?.id)?.reaction;
            const currentReactionChoice = reactionChoices.find((choice) => choice.id === currentReaction);
            const reactionSummary = reactionChoices.map((choice) => ({
              ...choice,
              count: post.feed_reactions.filter((item) => item.reaction === choice.id).length,
            })).filter((choice) => choice.count > 0);
            const saved = post.feed_saved_posts.some((item) => item.user_id === user?.id);
            const commentsOpen = openComments.includes(post.id);
            return <article key={post.id} className="feed-post">
              <header className="post-header">
                <img src={post.author_avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author_name)}&background=012b09&color=ffffff&bold=true`} alt="" className="author-avatar" />
                <div><h2>{post.author_name}</h2><p>NDDU Alumni</p><time dateTime={post.created_at} title={new Date(post.created_at).toLocaleString()}>{formatDate(post.created_at)}{post.edited_at?' · Edited':''}</time></div>
                <div className="post-options"><button type="button" className="post-options-trigger" aria-label={`Options for ${post.author_name}'s post`} aria-expanded={postMenu===post.id} onClick={()=>setPostMenu(current=>current===post.id?'':post.id)}><Icon name="dots"/></button>{postMenu===post.id&&<div className="post-options-menu">{post.user_id===user?.id?<><button onClick={()=>beginEdit(post)}>Edit post</button><button className="danger" onClick={()=>deletePost(post)}>Delete post</button></>:<button onClick={()=>hidePost(post)}>Hide post</button>}<button onClick={()=>{toggleSave(post);setPostMenu('')}}>{saved?'Remove from saved':'Save post'}</button>{post.edited_at&&<button onClick={()=>showEditHistory(post)}>View edit history</button>}{post.user_id!==user?.id&&<button onClick={()=>{setReporting(post);setPostMenu('')}}>Report post</button>}</div>}</div>
              </header>
              {post.content && <PostText text={post.content} people={people} onHashtag={setActiveHashtag} onMention={setSelectedMention} />}
              {post.media_path && <div className="post-image"><img src={post.media_url || supabase.storage.from('feed-media').getPublicUrl(post.media_path).data.publicUrl} alt="Photo shared with this post" loading="lazy" /></div>}
              {post.gif_url && <div className="post-image"><img src={post.gif_url} alt="GIF shared with this post" loading="lazy" /></div>}
              <div className="post-summary" aria-live="polite">
                <span className="reaction-summary">{reactionSummary.length ? reactionSummary.map((choice) => <span key={choice.id}><Icon name={choice.icon} size={17} />{choice.count} {choice.label}</span>) : <span>No reactions</span>}</span>
                <span>{post.feed_comments.length} {post.feed_comments.length === 1 ? 'comment' : 'comments'}</span>
              </div>
              <div className="post-actions">
                <div className="reaction-menu-wrap">
                  <button disabled={post.reactions_disabled} title={post.reactions_disabled?'Reactions are disabled on this post':''} className={currentReaction ? 'active' : ''} aria-expanded={openReactionPost === post.id} onClick={() => setOpenReactionPost((current) => current === post.id ? '' : post.id)}><Icon name={currentReactionChoice?.icon || 'like'} />{post.reactions_disabled?'Reactions off':currentReactionChoice?.label || 'React'}</button>
                  <div className={`reaction-menu ${openReactionPost === post.id ? 'open' : ''}`} aria-label="Choose a reaction">{reactionChoices.map((choice) => <button key={choice.id} type="button" title={choice.label} aria-label={choice.label} disabled={busyPost === post.id} className={currentReaction === choice.id ? 'active' : ''} aria-pressed={currentReaction === choice.id} onClick={() => react(post, choice.id)}><span className="reaction-emoji" aria-hidden="true">{choice.emoji}</span></button>)}</div>
                </div>
                <button className={commentsOpen ? 'active' : ''} onClick={() => setOpenComments((current) => current.includes(post.id) ? current.filter((id) => id !== post.id) : [...current, post.id])}><Icon name="comment" />{post.comments_locked?'Comments locked':'Comment'}</button>
                <button className={saved ? 'active' : ''} disabled={busyPost === post.id} onClick={() => toggleSave(post)}><Icon name="bookmark" />{saved ? 'Saved' : 'Save'}</button>
              </div>
              {commentsOpen && <section className="comments-section" aria-label={`Comments on ${post.author_name}'s post`}>
                {post.feed_comments.length ? <ul>{post.feed_comments.map((comment) => <li key={comment.id} className={comment.parent_comment_id?'comment-reply':''}><strong>{comment.author_name}</strong>{comment.content&&<RichText text={comment.content} people={people} onMention={setSelectedMention} className="comment-content"/>}{comment.media_path&&<img className="comment-media" src={supabase.storage.from('feed-media').getPublicUrl(comment.media_path).data.publicUrl} alt="Comment attachment"/>}{comment.gif_url&&<img className="comment-media" src={comment.gif_url} alt="GIF reply"/>}<footer><time dateTime={comment.created_at}>{formatDate(comment.created_at)}</time><button type="button" onClick={()=>{setReplyingTo((current)=>({...current,[post.id]:comment}));setCommentDrafts((current)=>({...current,[post.id]:`@${comment.author_name} `}))}}>Reply</button></footer></li>)}</ul> : <p className="no-comments">No comments yet. Start the conversation.</p>}
                {post.comments_locked?<p className="no-comments">A moderator has locked new comments on this post.</p>:<div className="comment-composer"><label htmlFor={`comment-${post.id}`}>Write a comment</label>{replyingTo[post.id]&&<div className="replying-banner"><span>Replying to {replyingTo[post.id].author_name}</span><button type="button" onClick={()=>setReplyingTo((current)=>({...current,[post.id]:null}))}>Cancel</button></div>}<div className="comment-input-row"><input id={`comment-${post.id}`} value={commentDrafts[post.id] || ''} maxLength="1000" placeholder="Write a comment. Type @ to mention someone." onChange={(event)=>{setCommentDrafts((current)=>({...current,[post.id]:event.target.value}));setMentionPost(hasMentionQuery(event.target.value)?post.id:'')}} onKeyDown={(event) => { if (event.key === 'Enter') addComment(post); }} /><button aria-label="Post comment" disabled={busyPost === post.id || (!commentDrafts[post.id]?.trim()&&!commentFiles[post.id]&&!commentGifs[post.id])} onClick={() => addComment(post)}><Icon name="send" /></button></div>{mentionPost===post.id&&<div className="mention-picker mention-picker-under-input" role="listbox" aria-label="Mention an alumnus">{people.filter((person)=>person.id!==user.id&&mentionMatches(person,commentDrafts[post.id]||'')).slice(0,8).map((person)=><MentionOption person={person} key={person.id} onSelect={()=>addMention(post.id,person)}/>) }{!people.some((person)=>person.id!==user.id&&mentionMatches(person,commentDrafts[post.id]||''))&&<p>No matching alumni found.</p>}</div>}<div className="comment-tools"><label className="comment-tool">Photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>setCommentFiles((current)=>({...current,[post.id]:event.target.files?.[0]||null}))}/></label><button type="button" onClick={()=>setEmojiPickerPost(emojiPickerPost===post.id?'':post.id)}>Emoji</button><button type="button" onClick={()=>openGifPicker(post.id)}>GIF</button></div>{emojiPickerPost===post.id&&<div className="comment-emoji-picker">{emojiChoices.map((emoji)=><button type="button" key={emoji} onClick={()=>{setCommentDrafts((current)=>({...current,[post.id]:`${current[post.id]||''}${emoji}`}));setEmojiPickerPost('')}}>{emoji}</button>)}</div>}{commentFiles[post.id]&&<p className="comment-selection">Photo: {commentFiles[post.id].name}</p>}{commentGifs[post.id]&&<p className="comment-selection">GIF selected</p>}{gifPickerPost===post.id&&<div className="comment-gif-picker">{gifError&&<p className="gif-picker-error" role="alert">{gifError}</p>}{gifs.map((gif)=><button type="button" key={gif.id} onClick={()=>{setCommentGifs((current)=>({...current,[post.id]:gif.images.fixed_height_small.url}));setGifPickerPost('')}}><img src={gif.images.fixed_height_small.url} alt={gif.title||'Choose GIF'}/></button>)}</div>}</div>}
              </section>}
            </article>;
          })}
          {!loading && hasMore && !savedOnly && !activeHashtag && <button className="feed-load-more" onClick={() => loadPosts(page + 1)}>Load more posts</button>}
        </section>
      </section>
      {selectedMention&&<div className="mention-profile-backdrop" role="presentation" onMouseDown={(event)=>event.target===event.currentTarget&&setSelectedMention(null)}><section className="mention-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="mention-profile-name"><button className="mention-profile-close" type="button" aria-label="Close profile" onClick={()=>setSelectedMention(null)}>×</button><PersonAvatar person={selectedMention} className="mention-profile-avatar"/><p className="mention-profile-kicker">Alumni profile</p><h2 id="mention-profile-name">{[selectedMention.first_name,selectedMention.last_name].filter(Boolean).join(' ')}</h2><p className="mention-profile-role">Verified NDDU alumnus</p>{mentionProfileState==='loading'&&<p className="mention-profile-loading" role="status">Loading profile details…</p>}{mentionProfileState==='unavailable'&&<p className="mention-profile-loading">Additional profile details are unavailable.</p>}<div className="mention-social-summary"><strong>{selectedMention.friend_count||0} friends</strong><span>{selectedMention.mutual_count||0} mutual friends</span>{selectedMention.mutual_names?.length>0&&<small>Including {selectedMention.mutual_names.join(', ')}</small>}</div><dl>{selectedMention.degree&&<div><dt>Degree</dt><dd>{selectedMention.degree}</dd></div>}{selectedMention.course&&<div><dt>Course / program</dt><dd>{selectedMention.course}</dd></div>}{selectedMention.department&&<div><dt>Department</dt><dd>{selectedMention.department}</dd></div>}{selectedMention.graduation_year&&<div><dt>Graduated</dt><dd>Class of {selectedMention.graduation_year}</dd></div>}{selectedMention.batch_name&&<div><dt>Batch</dt><dd>{selectedMention.batch_name}</dd></div>}{selectedMention.honors&&<div><dt>Honors</dt><dd>{selectedMention.honors}</dd></div>}{selectedMention.job_title&&<div><dt>Position</dt><dd>{selectedMention.job_title}</dd></div>}{selectedMention.organization&&<div><dt>Organization</dt><dd>{selectedMention.organization}</dd></div>}</dl><footer className="mention-profile-actions"><button type="button" disabled={connectionBusy||selectedMention.connection_status==='requested'} onClick={changeConnection}>{selectedMention.connection_status==='friends'?'Friends':selectedMention.connection_status==='incoming'?'Accept request':selectedMention.connection_status==='requested'?'Request sent':'Add friend'}</button><button type="button" className="mention-message" onClick={()=>{onMessage?.(selectedMention);setSelectedMention(null)}}>Message</button></footer></section></div>}
      {reporting && <div className="report-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setReporting(null)}><form className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" onSubmit={reportPost}><header><h2 id="report-title">Report this post</h2><button type="button" aria-label="Close report form" onClick={() => setReporting(null)}>×</button></header><p>Your report is private and will be reviewed by an administrator.</p><label>Reason<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>{reportReasons.map((reason) => <option value={reason} key={reason}>{reason.replaceAll('_',' ')}</option>)}</select></label><label>Details (optional)<textarea autoFocus maxLength="1000" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} /></label><footer><button type="button" onClick={() => setReporting(null)}>Cancel</button><button type="submit">Submit report</button></footer></form></div>}
      {editingPost&&<div className="report-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setEditingPost(null)}><form className="report-dialog" onSubmit={savePostEdit}><header><h2>Edit post</h2><button type="button" aria-label="Close edit form" onClick={()=>setEditingPost(null)}>×</button></header><label>Post text<textarea autoFocus maxLength="2000" value={editContent} onChange={event=>setEditContent(event.target.value)}/></label><small>{editContent.length} of 2,000 characters</small><footer><button type="button" onClick={()=>setEditingPost(null)}>Cancel</button><button disabled={busyPost===editingPost.id||(!editContent.trim()&&!editingPost.media_path&&!editingPost.gif_url)}>Save changes</button></footer></form></div>}
      {historyPost&&<div className="report-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setHistoryPost(null)}><section className="report-dialog edit-history-dialog" role="dialog" aria-modal="true"><header><h2>Edit history</h2><button type="button" aria-label="Close edit history" onClick={()=>setHistoryPost(null)}>×</button></header>{editHistory.length?<ol>{editHistory.map(entry=><li key={entry.id}><time>{new Date(entry.edited_at).toLocaleString()}</time><p>{entry.previous_content||'This version contained media only.'}</p></li>)}</ol>:<p>This post has no previous text versions.</p>}</section></div>}
      </div>
    </div>
  );
}
