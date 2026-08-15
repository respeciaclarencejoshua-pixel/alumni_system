import React, { useMemo, useState } from 'react';
import './Opportunities.css';

const opportunities = [
  {
    id: 1,
    type: 'JOB OPPORTUNITY',
    category: 'jobs',
    title: 'Junior Web Developer',
    company: 'Tech Solutions Philippines',
    location: 'General Santos City / Remote',
    description:
      'Looking for a motivated web developer to join our growing development team. Fresh graduates and experienced applicants are welcome.',
    tags: ['React.js', 'JavaScript', 'PHP'],
    posted: '2 hours ago',
    age: 2,
  },
  {
    id: 2,
    type: 'INTERNSHIP',
    category: 'internships',
    title: 'Software Development Intern',
    company: 'NDDU Alumni Tech Group',
    location: 'General Santos City',
    description:
      'Gain real-world experience working with a team of developers on web-based applications and modern software projects.',
    tags: ['Internship', 'Web Development', 'IT'],
    posted: '5 hours ago',
    age: 5,
  },
  {
    id: 3,
    type: 'SCHOLARSHIP',
    category: 'scholarships',
    title: 'Alumni Technology Scholarship',
    company: 'NDDU Alumni Association',
    location: 'Notre Dame of Dadiangas University',
    description:
      'Scholarship opportunity for qualified NDDU students pursuing technology-related programs.',
    tags: ['Scholarship', 'Students', 'Technology'],
    posted: 'Yesterday',
    age: 24,
  },
  {
    id: 4,
    type: 'FREELANCE',
    category: 'freelance',
    title: 'Freelance UI/UX Designer',
    company: 'Creative Digital PH',
    location: 'Remote',
    description:
      'Seeking a creative UI/UX designer to help design modern interfaces for web and mobile applications.',
    tags: ['UI/UX', 'Figma', 'Freelance'],
    posted: 'Yesterday',
    age: 24,
  },
];

function OpportunityIcon({ type }) {
  if (type === 'SCHOLARSHIP') {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M3 10l9-5 9 5-9 5-9-5Z" />
        <path d="M7 12v5c3 2 7 2 10 0v-5" />
        <path d="M21 10v6" />
      </svg>
    );
  }

  if (type === 'INTERNSHIP') {
    return (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M3 12h18" />
      </svg>
    );
  }

  if (type === 'FREELANCE') {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 17l7-7 4 4 5-5" />
        <path d="M15 9h5v5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
      <path d="M10 12v2h4v-2" />
    </svg>
  );
}

function Opportunities() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('latest');
  const [savedOpportunities, setSavedOpportunities] = useState([]);

  const toggleSave = (id) => {
    setSavedOpportunities((current) => {
      if (current.includes(id)) {
        return current.filter((savedId) => savedId !== id);
      }

      return [...current, id];
    });
  };

  const filteredOpportunities = useMemo(() => {
    const searchTerm = search.toLowerCase().trim();

    let results = opportunities.filter((opportunity) => {
      const matchesCategory =
        activeCategory === 'all'
          ? true
          : activeCategory === 'saved'
            ? savedOpportunities.includes(opportunity.id)
            : opportunity.category === activeCategory;

      const searchableText = [
        opportunity.title,
        opportunity.company,
        opportunity.location,
        opportunity.description,
        opportunity.type,
        ...opportunity.tags,
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch =
        searchTerm === '' || searchableText.includes(searchTerm);

      return matchesCategory && matchesSearch;
    });

    results.sort((a, b) => {
      if (sortOrder === 'latest') {
        return a.age - b.age;
      }

      return b.age - a.age;
    });

    return results;
  }, [activeCategory, search, sortOrder, savedOpportunities]);

  const categoryButtons = [
    {
      id: 'all',
      label: 'All Opportunities',
      icon: '▣',
    },
    {
      id: 'jobs',
      label: 'Jobs',
      icon: '💼',
    },
    {
      id: 'internships',
      label: 'Internships',
      icon: '▤',
    },
    {
      id: 'scholarships',
      label: 'Scholarships',
      icon: '🎓',
    },
    {
      id: 'freelance',
      label: 'Freelance',
      icon: '↗',
    },
    {
      id: 'saved',
      label: 'Saved',
      icon: '♡',
    },
  ];

  return (
    <div className="opportunities-page">
      <section className="opportunities-header">
        <div>
          <p className="opportunities-eyebrow">
            NDDU ALUMNI NETWORK
          </p>

          <h1>Opportunities</h1>

          <p className="opportunities-subtitle">
            Discover career opportunities, internships, scholarships,
            and ways to grow together with the NDDU alumni community.
          </p>
        </div>

        <button className="post-opportunity-button">
          + Post an Opportunity
        </button>
      </section>

      <div className="opportunities-layout">
        <aside className="opportunities-sidebar">
          <div className="opportunities-profile">
            <div className="opportunity-avatar">
              AL
            </div>

            <h3>Alumni</h3>
            <p>NDDU Alumni Network</p>
          </div>

          <nav className="opportunity-sidebar-nav">
            {categoryButtons.map((category) => (
              <button
                key={category.id}
                className={
                  activeCategory === category.id
                    ? 'active'
                    : ''
                }
                onClick={() => setActiveCategory(category.id)}
              >
                <span>{category.icon}</span>
                {category.label}

                {category.id === 'saved' &&
                  savedOpportunities.length > 0 && (
                    <small className="saved-count">
                      {savedOpportunities.length}
                    </small>
                  )}
              </button>
            ))}
          </nav>
        </aside>

        <section className="opportunities-content">
          <div className="opportunity-search-card">
            <div className="search-box">
              <span>⌕</span>

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search opportunities..."
              />

              {search && (
                <button
                  className="clear-search"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <button
              className="filter-button"
              onClick={() => setActiveCategory('all')}
            >
              ☰ Filter
            </button>
          </div>

          <div className="opportunity-results-header">
            <div>
              <p className="small-label">
                {activeCategory === 'all'
                  ? 'EXPLORE'
                  : activeCategory === 'saved'
                    ? 'YOUR SAVED'
                    : activeCategory.toUpperCase()}
              </p>

              <h2>
                {activeCategory === 'all'
                  ? 'Latest opportunities'
                  : activeCategory === 'saved'
                    ? 'Saved opportunities'
                    : `${categoryButtons.find(
                        (item) => item.id === activeCategory
                      )?.label || 'Opportunities'}`}
              </h2>

              <span className="results-count">
                {filteredOpportunities.length}{' '}
                {filteredOpportunities.length === 1
                  ? 'opportunity'
                  : 'opportunities'}
              </span>
            </div>

            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="latest">Latest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>

          <div className="opportunity-list">
            {filteredOpportunities.length === 0 ? (
              <div className="no-opportunities">
                <div className="no-opportunities-icon">
                  🔎
                </div>

                <h3>No opportunities found</h3>

                <p>
                  Try changing your search or selecting another
                  opportunity category.
                </p>

                <button
                  onClick={() => {
                    setSearch('');
                    setActiveCategory('all');
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              filteredOpportunities.map((opportunity) => {
                const isSaved = savedOpportunities.includes(
                  opportunity.id
                );

                return (
                  <article
                    className="opportunity-card"
                    key={opportunity.id}
                  >
                    <div className="opportunity-card-top">
                      <div className="opportunity-icon">
                        <OpportunityIcon
                          type={opportunity.type}
                        />
                      </div>

                      <div className="opportunity-main">
                        <div className="opportunity-meta">
                          <span className="opportunity-type">
                            {opportunity.type}
                          </span>

                          <span className="opportunity-posted">
                            {opportunity.posted}
                          </span>
                        </div>

                        <h3>{opportunity.title}</h3>

                        <p className="opportunity-company">
                          {opportunity.company}
                        </p>

                        <p className="opportunity-location">
                          <span>⌖</span>
                          {opportunity.location}
                        </p>

                        <p className="opportunity-description">
                          {opportunity.description}
                        </p>

                        <div className="opportunity-tags">
                          {opportunity.tags.map((tag) => (
                            <span key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        className={`save-opportunity ${
                          isSaved ? 'saved' : ''
                        }`}
                        aria-label={
                          isSaved
                            ? 'Remove from saved'
                            : 'Save opportunity'
                        }
                        onClick={() =>
                          toggleSave(opportunity.id)
                        }
                      >
                        {isSaved ? '♥' : '♡'}
                      </button>
                    </div>

                    <div className="opportunity-card-footer">
                      <span>
                        Shared with the NDDU Alumni community
                      </span>

                      <button className="view-opportunity">
                        View opportunity →
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default Opportunities;