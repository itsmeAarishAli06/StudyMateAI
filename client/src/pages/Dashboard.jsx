import Icon from '../components/Icon.jsx'

function localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function readScore(score) {
  const match = typeof score === 'string' && score.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/)
  if (!match || Number(match[2]) === 0) return null
  return Number(match[1]) / Number(match[2])
}

function getProgress(items) {
  const quizzes = items.filter((item) => item.type === 'quiz')
  const scoredQuizzes = quizzes.map((item) => ({ ...item, accuracy: readScore(item.score) })).filter((item) => item.accuracy !== null)
  const today = new Date()
  const activityByDay = new Map()

  items.forEach((item) => {
    if (!item.createdAt) return
    const date = new Date(item.createdAt)
    if (Number.isNaN(date.getTime())) return
    const key = localDayKey(date)
    activityByDay.set(key, (activityByDay.get(key) || 0) + 1)
  })

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setHours(0, 0, 0, 0)
    date.setDate(today.getDate() - (6 - index))
    return { key: localDayKey(date), label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1), count: activityByDay.get(localDayKey(date)) || 0, isToday: index === 6 }
  })

  const activeDays = new Set(activityByDay.keys())
  const cursor = new Date(today)
  cursor.setHours(0, 0, 0, 0)
  if (!activeDays.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (activeDays.has(localDayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return { quizzes, scoredQuizzes, days, streak }
}

function Dashboard({ savedItems, onNavigate, onOpenItem }) {
  const recentItems = savedItems.slice(0, 3)
  const progress = getProgress(savedItems)
  const averageScore = progress.scoredQuizzes.length
    ? Math.round(progress.scoredQuizzes.reduce((sum, quiz) => sum + quiz.accuracy, 0) / progress.scoredQuizzes.length * 100)
    : null
  const practicedTopics = [...new Set(progress.quizzes.map((quiz) => quiz.title).filter(Boolean))]
  const weekTotal = progress.days.reduce((sum, day) => sum + day.count, 0)
  const weekPeak = Math.max(1, ...progress.days.map((day) => day.count))

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

      <section className="progress-dashboard" aria-labelledby="progress-heading">
        <div className="section-heading progress-heading">
          <div><h2 id="progress-heading">Your progress</h2><p>A clear look at the work you’ve saved and completed.</p></div>
          <span className="progress-week-total"><Icon name="bolt" size={14} /> {weekTotal} study {weekTotal === 1 ? 'item' : 'items'} this week</span>
        </div>
        <div className="progress-grid">
          <article className="progress-metric-card">
            <span className="progress-metric-icon"><Icon name="bolt" size={17} /></span>
            <span className="progress-metric-label">CURRENT STREAK</span>
            <strong>{progress.streak}<small> {progress.streak === 1 ? 'day' : 'days'}</small></strong>
            <p>{progress.streak ? 'Keep the momentum going.' : 'Save a study item today to begin.'}</p>
          </article>
          <article className="progress-metric-card">
            <span className="progress-metric-icon progress-score-icon"><Icon name="quiz" size={17} /></span>
            <span className="progress-metric-label">AVERAGE QUIZ SCORE</span>
            <strong>{averageScore === null ? '—' : `${averageScore}%`}</strong>
            <p>{progress.scoredQuizzes.length ? `From ${progress.scoredQuizzes.length} saved ${progress.scoredQuizzes.length === 1 ? 'result' : 'results'}.` : 'Your saved quiz scores will appear here.'}</p>
          </article>
          <article className="progress-metric-card progress-topics-card">
            <span className="progress-metric-icon progress-topic-icon"><Icon name="book" size={17} /></span>
            <span className="progress-metric-label">TOPICS PRACTICED</span>
            {practicedTopics.length ? <><strong>{practicedTopics.length}</strong><p className="progress-topic-list" title={practicedTopics.join(', ')}>{practicedTopics.slice(0, 3).join(' · ')}{practicedTopics.length > 3 ? ` +${practicedTopics.length - 3} more` : ''}</p></> : <><strong>0</strong><p>Save a quiz to track a topic.</p></>}
          </article>
          <article className="progress-week-card">
            <div className="progress-week-head"><span className="progress-metric-label">LAST 7 DAYS</span><span>Saved study activity</span></div>
            <div className="progress-week-bars" role="img" aria-label={`Study activity over the last seven days: ${weekTotal} saved items`}>
              {progress.days.map((day) => <div className={`progress-week-day ${day.isToday ? 'is-today' : ''}`} key={day.key} title={`${day.count} saved ${day.count === 1 ? 'item' : 'items'}`}><div className="progress-bar-track"><i style={{ height: `${day.count ? Math.max(14, day.count / weekPeak * 100) : 0}%` }} /></div><span>{day.label}</span></div>)}
            </div>
          </article>
        </div>
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
        <button className="feature-card feature-plan" type="button" onClick={() => onNavigate('planner')}>
          <span className="feature-icon"><Icon name="calendar" size={19} /></span>
          <span className="feature-arrow"><Icon name="arrow" size={16} /></span>
          <strong>Plan for your exam</strong>
          <span>Turn your available time and topics into a schedule you control.</span>
          <small>BUILD A STUDY PLAN <Icon name="chevron" size={13} /></small>
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
