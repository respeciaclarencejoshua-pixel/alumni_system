import { useEffect, useRef, useState } from 'react';
import { commentFileType } from '../lib/commentAttachments.js';
import './CommentTools.css';
import MediaPickerButton from './MediaPickerButton.jsx';

export default function CommentTools({ file, gif, disabled, onFile, onGif, onEmoji }) {
  const [fileError, setFileError] = useState('');
  const [preview, setPreview] = useState('');
  const photoInput = useRef(null), fileInput = useRef(null);
  useEffect(() => {
    if (!file || !commentFileType(file)?.startsWith('image/')) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function selectFile(event) {
    const selected = event.target.files?.[0]; event.target.value = '';
    if (!selected) return;
    if (!commentFileType(selected) || selected.size > 10 * 1024 * 1024) { setFileError('Choose a JPG, PNG, WebP, PDF, or TXT file up to 10 MB.'); return; }
    setFileError(''); onFile(selected);
  }
  return <div className="comment-attachments">
    <div className="comment-attachment-toolbar" role="group" aria-label="Add to your comment">
      <button type="button" disabled={disabled} aria-label="Add photo" title="Add photo" onClick={() => photoInput.current?.click()}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></svg></button>
      <button type="button" disabled={disabled} aria-label="Attach file" title="Attach file" onClick={() => fileInput.current?.click()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l9-9m-5 12 8-8"/></svg></button>
      <MediaPickerButton kind="emoji" disabled={disabled} onSelect={emoji => onEmoji(emoji)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14s1 3 4 3 4-3 4-3M8 9h.01M16 9h.01"/></svg></MediaPickerButton>
      <MediaPickerButton kind="gif" disabled={disabled} onSelect={item => onGif(item.images.fixed_height_small.url)}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/></svg></MediaPickerButton>
      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={selectFile} />
      <input ref={fileInput} type="file" accept=".pdf,.txt" hidden onChange={selectFile} />
    </div>
    {fileError && <p role="alert" className="comment-send-error">{fileError}</p>}
    {(file || gif) && <div className="comment-attachment-previews">
      {file && <div>{preview && <img src={preview} alt="Selected photo" />}<span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB · Visible with your comment</small></span><button type="button" disabled={disabled} onClick={() => onFile(null)}>Remove file</button></div>}
      {gif && <div><img src={gif} alt="Selected GIF" /><button type="button" disabled={disabled} onClick={() => onGif('')}>Remove GIF</button></div>}
    </div>}
    <p className="comment-attachment-help">Photos, PDF or TXT files · Up to 10 MB. Attachments use public links.</p>
  </div>;
}
