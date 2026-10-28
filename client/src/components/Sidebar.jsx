import Icon from './Icon.jsx'
import BrandMark from './BrandMark.jsx'

export const navigationItems = [
  { id: 'home', label: 'Overview', icon: 'home' },
  { id: 'chat', label: 'AI tutor', icon: 'chat' },
  { id: 'summary', label: 'Summarizer', icon: 'notes' },
  { id: 'quiz', label: 'Quiz maker', icon: 'quiz' },
  { id: 'exam', label: 'Exam preparation', icon: 'clock' },
  { id: 'planner', label: 'Study planner', icon: 'calendar' },
  { id: 'history', label: 'Study history', icon: 'history' },
]

const mobileLabels = {
  home: 'Home',
  chat: 'Tutor',
  summary: 'Notes',
  quiz: 'Quiz',
  exam: 'Exam',
  planner: 'Plan',
  history: 'History',
}

function NavItems({ activePage, onNavigate, mobile = false }) {
  return navigationItems.map((item) => (
    <button
      className={`nav-item ${activePage === item.id ? 'active' : ''}`}
      key={item.id}
      type="button"
      aria-current={activePage === item.id ? 'page' : undefined}
      aria-label={mobile ? item.label : undefined}
      onClick={() => onNavigate(item.id)}
    >
      <Icon name={item.icon} size={18} />
      <span>{mobile ? mobileLabels[item.id] : item.label}</span>
      {item.id === 'quiz' && !mobile && <span className="nav-tag">NEW</span>}
    </button>
  ))
}

function Sidebar({ activePage, onNavigate, aiMode = 'demo' }) {
  return (
    <>
      <aside className="sidebar">
        <button className="brand-lockup" type="button" onClick={() => onNavigate('home')}>
          <span className="brand-symbol"><BrandMark className="brand-mark-graphic" /></span>
          <span className="brand-name">StudyMate<span>AI</span></span>
        </button>

        <div className="sidebar-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <NavItems activePage={activePage} onNavigate={onNavigate} />
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-tip">
          <div className="tip-icon"><Icon name="leaf" size={17} /></div>
          <p className="tip-title">Small steps add up.</p>
          <p className="tip-copy">A little practice today makes tomorrow easier.</p>
        </div>
        <div className="profile-row">
          <div className="avatar">S</div>
          <div className="profile-meta"><strong>StudyMate workspace</strong><span>{aiMode === 'offline' ? 'Service unavailable' : 'Ready for your next session'}</span></div>
          <span className={`profile-status ${aiMode === 'offline' ? 'is-offline' : ''}`} title={aiMode === 'gemini' ? 'AI service is ready' : aiMode === 'offline' ? 'API could not be reached' : 'Demo response mode is active'} />
        </div>
      </aside>

      <nav className="mobile-nav" aria-label="Main navigation">
        <NavItems activePage={activePage} onNavigate={onNavigate} mobile />
      </nav>
    </>
  )
}

export default Sidebar
