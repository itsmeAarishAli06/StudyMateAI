import Icon from '../components/Icon.jsx'

function Dashboard({ savedItems, onNavigate, onOpenItem }) {
  const recentItems = savedItems.slice(0, 3)

  return (
    <div className="page dashboard-page">
      <div className="page-kicker"><span className="kicker-dot" /> YOUR STUDY SPACE</div>
      <div className="welcome-row">
        <div>
          <h1>Good morning, learner <span className="wave">✳</span></h1>
          <p className="page-subtitle">What would you like to make sense of today?</p>
        </div>
        <button className="date-pill" type="button"><Icon name="clock" size={15} /> A fresh start</button>
      </div>

      <section className="hero-panel">
        <div className="hero-content">
          <span className="hero-overline"><Icon name="spark" size={15} /> YOUR PERSONAL STUDY COMPANION</span>
          <h2>Learn a little.<br />Understand a lot.</h2>
          <p>Ask questions, turn notes into clear ideas, and practice until it clicks.</p>
          <button className="button button-light" type="button" onClick={() => onNavigate('chat')}>
            Start learning <Icon name="arrow" size={16} />
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-sun"><Icon name="spark" size={27} /></div>
          <div className="art-card art-card-top"><span className="art-dot green" /> One idea at a time</div>
          <div className="art-card art-card-bottom"><span className="art-check"><Icon name="check" size={13} /></span> Keep your momentum</div>
        </div>
        <div className="hero-grain" />
      </section>

      <div className="section-heading">
        <div><h2>Pick up where you need</h2><p>Tools to help you move forward</p></div>
      </div>
      <section className="feature-grid" aria-label="Study tools">
        <button className="feature-card feature-chat" type="button" onClick={() => onNavigate('chat')}>
          <span className="feature-icon"><Icon name="chat" size={19} /></span>
          <span className="feature-arrow"><Icon name="arrow" size={16} /></span>
          <strong>Ask your AI tutor</strong>
          <span>Get unstuck with an explanation that makes sense.</span>
          <small>ASK ANYTHING <Icon name="chevron" size={13} /></small>
        </button>
        <button className="feature-card feature-summary" type="button" onClick={() => onNavigate('summary')}>
          <span className="feature-icon"><Icon name="notes" size={19} /></span>
          <span className="feature-arrow"><Icon name="arrow" size={16} /></span>
          <strong>Summarize your notes</strong>
          <span>Find the key ideas hiding in a full page of notes.</span>
          <small>MAKE IT CLEAR <Icon name="chevron" size={13} /></small>
        </button>
        <button className="feature-card feature-quiz" type="button" onClick={() => onNavigate('quiz')}>
          <span className="feature-icon"><Icon name="quiz" size={19} /></span>
          <span className="feature-arrow"><Icon name="arrow" size={16} /></span>
          <strong>Practice with a quiz</strong>
          <span>Check what you know and learn from each answer.</span>
          <small>TEST YOURSELF <Icon name="chevron" size={13} /></small>
        </button>
      </section>

      <section className="recent-section">
        <div className="section-heading recent-heading">
          <div><h2>Recently studied</h2><p>Your saved notes and practice sets</p></div>
          <button className="text-button" type="button" onClick={() => onNavigate('history')}>View history <Icon name="arrow" size={15} /></button>
        </div>
        {recentItems.length ? (
          <div className="recent-list">
            {recentItems.map((item) => (
              <button className="recent-item" key={item.id} type="button" onClick={() => onOpenItem(item)}>
                <span className={`recent-icon ${item.type}`}><Icon name={item.type === 'quiz' ? 'quiz' : 'notes'} size={17} /></span>
                <span className="recent-copy"><strong>{item.title}</strong><span>{item.preview}</span></span>
                <span className="recent-date">{item.dateLabel}</span>
                <Icon name="chevron" size={17} className="recent-chevron" />
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-card"><span className="empty-icon"><Icon name="book" size={20} /></span><strong>Your study history will show up here</strong><span>Save a summary or quiz to find it again later.</span></div>
        )}
      </section>

      <div className="demo-note"><Icon name="spark" size={14} /> Sample notes are available in the study tools.</div>
    </div>
  )
}

export default Dashboard
