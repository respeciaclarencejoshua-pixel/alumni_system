import './AboutNDDU.css';

const missionItems = [
  ['Catholic educational institution', "NDDU shares in the Church's mission of evangelization by integrating life and faith."],
  ['Filipino institution', 'NDDU seeks to preserve Filipino culture and propagate love of country and its people.'],
  ['Institution of quality education', 'NDDU aims for leadership in curricular programs, multidisciplinary programs, research, and community services.'],
  ['Marist institution', 'NDDU promotes Family Spirit, Marian Spirit, Simplicity, Presence, Preference for the Least Favored, Love of Work, and Integrity of Creation.'],
  ['Community-oriented institution', 'NDDU responds to the challenges of South Cotabato, Sultan Kudarat, Sarangani Province, and General Santos City.'],
];

const objectives = [
  'Develop the spiritual, intellectual, social, aesthetic, and physical abilities of students through instruction and practice.',
  'Create a Christian community through religious instruction and opportunities for apostolic zeal and witness.',
  'Support national development by helping students understand their rights and responsibilities as citizens and participate in community development.',
];

const coreValues = [
  ['Family Spirit', "Champagnat's hope was that people in Marist schools would relate to one another as members of a loving family, with Mary as our Mother."],
  ['Marian', 'Our model in following Jesus is Mary, whose virtues we try to live.'],
  ['Simplicity', 'We are real, transparent, and honest in our relationships and avoid excess in our lifestyle and activities.'],
  ['Presence and Participation', 'Being present and taking an active part are Marist ways of knowing and supporting others.'],
  ['Preference for the Least Favored', 'We continue the Marist commitment to work with and serve those on the margins of society.'],
  ['Love of Work', 'We recognize the dignity of work and its contribution to personal, family, community, and national well-being.'],
  ['Integrity of Creation', "We care for the land and its resources, knowing that all of God's creation is interdependent."],
  ['Quality Education', 'NDDU forms competent, knowledgeable, and ethical people through education that harmonizes faith, culture, and life.'],
];

const videos = [
  ['NDDU Campus Tour', 'Visit the university grounds, facilities, and learning spaces from home.', 'https://www.youtube.com/embed/PDXDOqCPYpI'],
  ['NDDU Hymn (2018 Version)', 'Listen to the university hymn and reconnect with a familiar NDDU tradition.', 'https://www.youtube.com/embed/C-uTC1Hv3Ns'],
  ['Life at NDDU', 'See the people, activities, and community that shape the NDDU experience.', 'https://www.youtube.com/embed/mPldD45Lw0Y'],
];

export default function AboutNDDU() {
  return (
    <div className="about-nddu-page" id="about-top">
      <header className="about-nddu-hero">
        <div className="about-nddu-hero-image" aria-hidden="true" />
        <div className="about-nddu-hero-content">
          <p className="about-nddu-kicker">Notre Dame of Dadiangas University</p>
          <h1>About NDDU</h1>
          <p>Revisit the vision, mission, Marist values, and campus traditions that continue to unite the NDDU alumni community.</p>
        </div>
      </header>

      <nav className="about-section-nav" aria-label="About NDDU sections">
        <div className="about-nddu-content">
          <span>On this page</span>
          <div>
            <a href="#vision">Vision</a>
            <a href="#mission">Mission</a>
            <a href="#objectives">Objectives</a>
            <a href="#campus-media">Campus videos</a>
            <a href="#core-values">Core values</a>
          </div>
        </div>
      </nav>

      <div className="about-nddu-main">
        <section className="about-nddu-section" id="vision">
          <div className="about-nddu-content about-reading-width">
            <p className="about-section-label">Our direction</p>
            <h2>Vision</h2>
            <p className="about-lead">Notre Dame of Dadiangas University is a Catholic, Filipino institution of academic excellence established by the Marist Brothers of the Schools.</p>
            <p>Guided by St. Marcellin Champagnat's ideals of simplicity, humility, and quiet zeal for God's work, NDDU is dedicated to forming Christian leaders, competent professionals, community-oriented citizens, and culture-sensitive individuals.</p>
          </div>
        </section>

        <section className="about-nddu-section about-tinted-section" id="mission">
          <div className="about-nddu-content">
            <p className="about-section-label">Our purpose</p>
            <h2>Mission</h2>
            <p className="about-section-intro">NDDU carries out its mission through five connected commitments.</p>
            <ol className="mission-list">
              {missionItems.map(([title, text], index) => (
                <li key={title}>
                  <span aria-hidden="true">{index + 1}</span>
                  <div><h3>{title}</h3><p>{text}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="about-nddu-section" id="objectives">
          <div className="about-nddu-content">
            <p className="about-section-label">What NDDU seeks to achieve</p>
            <h2>Institutional Objectives</h2>
            <ol className="objectives-list">
              {objectives.map((objective, index) => (
                <li key={objective}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><p>{objective}</p></li>
              ))}
            </ol>
            <blockquote><p>"All to Jesus Through Mary, All to Mary for Jesus."</p><cite>Marist motto</cite></blockquote>
          </div>
        </section>

        <section className="about-nddu-video-section" id="campus-media">
          <div className="about-nddu-content">
            <p className="about-section-label">Watch and remember</p>
            <h2>Campus and Marist Life</h2>
            <p className="about-section-intro">Explore the campus and traditions that generations of alumni share.</p>
            <div className="videos-container">
              {videos.map(([title, description, source], index) => (
                <article className={`video-card ${index === 0 ? 'video-card-featured' : ''}`} key={title}>
                  <div className="video-frame">
                    <iframe src={source} title={title} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
                  </div>
                  <div className="video-card-copy"><h3>{title}</h3><p>{description}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="about-nddu-section core-values-section" id="core-values">
          <div className="about-nddu-content">
            <p className="about-section-label">The Marist way</p>
            <h2>NDDU Core Values</h2>
            <p className="about-section-intro">These values continue to guide how NDDU alumni live, work, and serve their communities.</p>
            <div className="core-values-list">
              {coreValues.map(([title, text], index) => (
                <article className="core-value" key={title}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <h3>{title}</h3><p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>

      <a className="about-back-to-top" href="#about-top">Back to top <span aria-hidden="true">&uarr;</span></a>
    </div>
  );
}
