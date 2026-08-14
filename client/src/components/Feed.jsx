import { useState } from 'react';
import './Feed.css';

const Icon = ({ name, size = 18 }) => {
  const icons = {
    heart: <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />,
    messageCircle: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
    share: <circle cx="18" cy="5" r="3" />,
    moreHorizontal: <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
    image: <rect x="3" y="3" width="18" height="18" rx="2" />,
    star: <polygon points="12 2 15.09 10.26 24 10.35 17.77 16.88 19.91 25.07 12 19.54 4.09 25.07 6.23 16.88 0 10.35 8.91 10.26 12 2" />,
    mapPin: <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
};

export default function Feed() {
  const [posts, setPosts] = useState([
    {
      id: 1,
      author: 'Sarah Jenkins',
      role: 'Director of Engineering at TechFlow',
      time: '4h ago',
      avatar: 'https://i.pravatar.cc/80?img=45',
      content: 'Thrilled to announce that our team just closed our Series B funding round! Big thanks to everyone who supported this journey from the beginning. #Growth #AlumniSuccess',
      image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=600&q=60',
      likes: 142,
      comments: 28,
      shares: 15,
    },
    {
      id: 2,
      author: 'Marcus Vonn',
      role: 'Class of 2012',
      time: '8h ago',
      avatar: 'https://i.pravatar.cc/80?img=33',
      content: 'Is anyone attending the Annual Alumni Mixer in Seattle next month? I\'d love to connect with fellow graduates in the Pacific Northwest region. Drop a comment if you\'re going!',
      image: null,
      likes: 54,
      comments: 12,
      shares: 8,
    },
  ]);

  const [newPost, setNewPost] = useState('');

  const handlePostSubmit = () => {
    if (newPost.trim()) {
      setPosts([
        {
          id: posts.length + 1,
          author: 'You',
          role: 'Your Title Here',
          time: 'now',
          avatar: 'https://i.pravatar.cc/80?img=12',
          content: newPost,
          image: null,
          likes: 0,
          comments: 0,
          shares: 0,
        },
        ...posts,
      ]);
      setNewPost('');
    }
  };

  const trendingTopics = [
    { id: 1, tag: '#PeakSummer2024', posts: '1.2K posts' },
    { id: 2, tag: '#AnnualTechAlumniSummit', posts: '8.8K posts' },
    { id: 3, tag: '#JobBoard2024', posts: '428 posts' },
  ];

  const suggestedAlumni = [
    { id: 1, name: 'Liam Peterson', role: 'UX Designer', avatar: 'https://i.pravatar.cc/80?img=20' },
    { id: 2, name: 'Maya Rodriguez', role: 'Data Scientist', avatar: 'https://i.pravatar.cc/80?img=48' },
  ];

  return (
    <div className="feed-layout">
      {/* Left Sidebar */}
      <aside className="feed-sidebar-left">
        <div className="profile-card">
          <div className="profile-image">
            <img src="https://i.pravatar.cc/120?img=12" alt="Profile" />
          </div>
          <h3>Alex Thorne</h3>
          <p className="profile-subtitle">Class of 2018 • Product Designer</p>

          <div className="profile-stats">
            <div className="stat">
              <strong>482</strong>
              <span>CONNECTIONS</span>
            </div>
            <div className="stat">
              <strong>124</strong>
              <span>VISITS</span>
            </div>
          </div>

          <nav className="feed-nav">
            <button className="nav-item active">
              <Icon name="image" size={20} />
              <span>FEED</span>
            </button>
            <button className="nav-item">
              <Icon name="star" size={20} />
              <span>EVENTS</span>
            </button>
            <button className="nav-item">
              <Icon name="messageCircle" size={20} />
              <span>MENTORSHIP</span>
            </button>
            <button className="nav-item">
              <Icon name="heart" size={20} />
              <span>SAVED POSTS</span>
            </button>
          </nav>
        </div>
      </aside>

      {/* Main Feed */}
      <main className="feed-main">
        {/* Post Creation */}
        <div className="post-creator">
          <img src="https://i.pravatar.cc/80?img=12" alt="Your avatar" className="avatar" />
          <div className="creator-input">
            <textarea
              placeholder="Share an achievement or update with your network..."
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
            />
            <div className="creator-actions">
              <div className="creator-buttons">
                <button className="creator-btn" title="Add media">
                  <Icon name="image" size={20} />
                  Media
                </button>
                <button className="creator-btn" title="Add achievement">
                  <Icon name="star" size={20} />
                  Achievement
                </button>
                <button className="creator-btn" title="Add event">
                  <Icon name="mapPin" size={20} />
                  Event
                </button>
              </div>
              <button className="post-button" onClick={handlePostSubmit}>Post</button>
            </div>
          </div>
        </div>

        {/* Feed Posts */}
        <div className="feed-posts">
          {posts.map((post) => (
            <article key={post.id} className="feed-post">
              <div className="post-header">
                <div className="post-author">
                  <img src={post.avatar} alt={post.author} className="author-avatar" />
                  <div>
                    <h4>{post.author}</h4>
                    <p>{post.role}</p>
                  </div>
                </div>
                <button className="post-menu" aria-label="More options">
                  <Icon name="moreHorizontal" size={20} />
                </button>
              </div>

              <div className="post-time">{post.time}</div>

              <p className="post-content">{post.content}</p>

              {post.image && (
                <div className="post-image">
                  <img src={post.image} alt="Post content" />
                </div>
              )}

              <div className="post-footer">
                <div className="post-stats">
                  <span>{post.likes} Likes</span>
                  <span>{post.comments} Comments</span>
                </div>

                <div className="post-actions">
                  <button className="post-action">
                    <Icon name="heart" size={18} />
                    Like
                  </button>
                  <button className="post-action">
                    <Icon name="messageCircle" size={18} />
                    Comment
                  </button>
                  <button className="post-action">
                    <Icon name="share" size={18} />
                    Share
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* Right Sidebar */}
      <aside className="feed-sidebar-right">
        {/* Trending Topics */}
        <div className="sidebar-section">
          <h3 className="sidebar-title">TRENDING TOPICS</h3>
          <div className="trending-list">
            {trendingTopics.map((topic) => (
              <button key={topic.id} className="trending-item">
                <div>
                  <strong>{topic.tag}</strong>
                  <p>{topic.posts}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Suggested Alumni */}
        <div className="sidebar-section">
          <h3 className="sidebar-title">SUGGESTED ALUMNI</h3>
          <div className="alumni-list">
            {suggestedAlumni.map((alumni) => (
              <div key={alumni.id} className="alumni-item">
                <img src={alumni.avatar} alt={alumni.name} />
                <div>
                  <p className="alumni-name">{alumni.name}</p>
                  <p className="alumni-role">{alumni.role}</p>
                </div>
                <button className="connect-btn">Connect</button>
              </div>
            ))}
          </div>
          <button className="view-more">View All Recommendations</button>
        </div>
      </aside>
    </div>
  );
}
