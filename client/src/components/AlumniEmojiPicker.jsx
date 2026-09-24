import { lazy, Suspense } from 'react';
import './AlumniEmojiPicker.css';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

export default function AlumniEmojiPicker({ onSelect, disabled = false }) {
  return <div className="alumni-emoji-picker" aria-label="Emoji picker" inert={disabled ? '' : undefined}>
    <Suspense fallback={<p role="status">Loading emojis...</p>}>
      <EmojiPicker theme="light" emojiStyle="native" width="100%" height={360}
        searchPlaceHolder="Search emoji" suggestedEmojisMode="recent"
        previewConfig={{ showPreview: false }} autoFocusSearch={false}
        onEmojiClick={data => { if (!disabled) onSelect(data.emoji); }} />
    </Suspense>
  </div>;
}
