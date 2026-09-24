import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AlumniEmojiPicker from './AlumniEmojiPicker.jsx';
import './MediaPickerButton.css';

function GifPicker({ onSelect, disabled }) {
  const [query, setQuery] = useState(''), [search, setSearch] = useState('');
  const [items, setItems] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setItems([]);
    fetch(`/api/gifs?q=${encodeURIComponent(search)}`, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.code === 'GIFS_NOT_CONFIGURED' ? 'GIFs are not available yet.' : 'GIFs could not load. Please try again.');
      if (!controller.signal.aborted) setItems((data.gifs || []).filter(item => /^https:\/\/([a-z0-9-]+\.)?giphy\.com\//i.test(item.images?.fixed_height_small?.url || '')));
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, retry]);
  return <div className="shared-gif-picker">
    <form onSubmit={event => { event.preventDefault(); event.stopPropagation(); setSearch(query.trim()); }}><input aria-label="Search GIFs" placeholder="Search GIFs" maxLength={80} value={query} onChange={event => setQuery(event.target.value)} /><button type="submit">Search</button></form>
    <div className="shared-gif-results">{loading ? <p role="status">Loading GIFs...</p> : error ? <p role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button></p> : !items.length ? <p>No GIFs found. Try another search.</p> : <div className="shared-gif-grid">{items.map(item => <button type="button" key={item.id} disabled={disabled} aria-label={item.title || 'Choose GIF'} onClick={() => onSelect(item)}><img src={item.images.fixed_height_small.url} alt="" loading="lazy" /></button>)}</div>}</div>
    <small>Powered by GIPHY</small>
  </div>;
}

export default function MediaPickerButton({ kind, onSelect, disabled, children, className = '', label }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [position, setPosition] = useState({ left: 8, top: 8, width: 340, height: 380 });
  const trigger = useRef(null), popup = useRef(null);
  const title = kind === 'gif' ? 'Choose GIF' : 'Choose emoji';
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = trigger.current.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 16), height = Math.min(410, window.innerHeight - 24);
      const top = rect.top >= height + 8 ? rect.top - height - 8 : Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - height - 8));
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top, width, height });
    };
    update(); window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    const dismiss = event => { if (!popup.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); };
    const key = event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); } };
    const other = event => { if (event.detail !== trigger.current) setOpen(false); };
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', key); document.addEventListener('alumni-picker-open', other);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', key); document.removeEventListener('alumni-picker-open', other); };
  }, [open]);
  async function choose(value) {
    if (disabled || busy) return;
    setBusy(true); setError('');
    try { if (await onSelect(value) !== false) { setOpen(false); trigger.current?.focus(); } }
    catch { setError('Could not use this selection. Please try again.'); }
    finally { setBusy(false); }
  }
  return <><button ref={trigger} type="button" className={className} disabled={disabled} aria-label={label || title} title={label || title} aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (!open) document.dispatchEvent(new CustomEvent('alumni-picker-open', { detail: trigger.current })); setOpen(value => !value); }}>{children || <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{kind === 'gif' ? <><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/></> : <><circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8 9h.01M16 9h.01"/></>}</svg>}</button>
    {open && createPortal(<section ref={popup} className="media-picker-popup" role="dialog" aria-label={title} style={position}>
      <header><strong>{title}</strong><button type="button" aria-label="Close picker" onClick={() => { setOpen(false); trigger.current?.focus(); }}>&times;</button></header>
      {error && <p role="alert">{error}</p>}
      {kind === 'gif' ? <GifPicker onSelect={choose} disabled={disabled || busy} /> : <AlumniEmojiPicker onSelect={choose} disabled={disabled || busy} />}
    </section>, document.body)}
  </>;
}
