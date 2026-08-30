import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import './Gallery.css';

function photoUrl(path) {
  return supabase.storage.from('feed-media').getPublicUrl(path).data.publicUrl;
}

function storyTitle(photo) {
  const text = photo.content?.replace(/#[\p{L}\p{N}_]+/gu, '').trim();
  if (!text) return `A memory shared by ${photo.author_name}`;
  const firstLine = text.split(/[.!?\n]/)[0].trim();
  return firstLine.length > 72 ? `${firstLine.slice(0, 69).trim()}...` : firstLine;
}

function storyExcerpt(photo) {
  const text = photo.content?.trim();
  if (!text) return 'A photo from the NDDU alumni community.';
  const firstBreak = text.search(/[.!?\n]/);
  const remaining = firstBreak >= 0 ? text.slice(firstBreak + 1).trim() : '';
  const excerpt = remaining || 'A moment shared with the NDDU alumni community.';
  return excerpt.length > 150 ? `${excerpt.slice(0, 147).trim()}...` : excerpt;
}

export default function Gallery() {
  const [photos, setPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase
      .from('feed_posts')
      .select('id, author_name, content, media_path, created_at')
      .not('media_path', 'is', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (active) {
          setPhotos((data || []).map((photo) => ({ ...photo, url: photoUrl(photo.media_path) })));
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedPhoto) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedPhoto(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedPhoto]);

  return (
    <section className="gallery-page" aria-labelledby="gallery-title">
      <header className="gallery-header">
        <p>NDDU Alumni Community</p>
        <h1 id="gallery-title">Alumni Gallery</h1>
        <span>Reconnect through campus memories, reunions, achievements, and milestones shared by fellow alumni.</span>
      </header>

      {loading ? (
        <p className="gallery-state">Loading gallery photos...</p>
      ) : photos.length === 0 ? (
        <div className="gallery-state">
          <h2>No photos yet</h2>
          <p>Photos added to alumni feed posts will appear here.</p>
        </div>
      ) : (
        <div className="gallery-grid">
          {photos.map((photo) => (
            <article className="gallery-card" key={photo.id}>
              <button className="gallery-card-image" type="button" onClick={() => setSelectedPhoto(photo)} aria-label={`Open ${storyTitle(photo)}`}>
                <img src={photo.url} alt={photo.content || `Photo shared by ${photo.author_name}`} loading="lazy" />
              </button>
              <div className="gallery-card-copy">
                <p className="gallery-card-meta"><span>Alumni memory</span><time dateTime={photo.created_at}>{new Date(photo.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</time></p>
                <h2>{storyTitle(photo)}</h2>
                <p className="gallery-card-description">{storyExcerpt(photo)}</p>
                <p className="gallery-card-author">Shared by <strong>{photo.author_name}</strong></p>
              </div>
              <button className="gallery-card-action" type="button" onClick={() => setSelectedPhoto(photo)}>View photo</button>
            </article>
          ))}
        </div>
      )}

      {selectedPhoto && (
        <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label="Gallery photo" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPhoto(null); }}>
          <button className="gallery-close" type="button" onClick={() => setSelectedPhoto(null)} aria-label="Close photo">&times;</button>
          <figure>
            <img src={selectedPhoto.url} alt={selectedPhoto.content || `Photo shared by ${selectedPhoto.author_name}`} />
            <figcaption><strong>{selectedPhoto.author_name}</strong>{selectedPhoto.content && <p>{selectedPhoto.content}</p>}</figcaption>
          </figure>
        </div>
      )}
    </section>
  );
}
