import { useState } from 'react'
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
  { id: 'plans', label: 'Plan & access', icon: 'bolt' },
  { id: 'admin', label: 'Admin workspace', icon: 'check' },
]

function NavItems({ activePage, onNavigate, isAdmin = false, premiumActive = false }) {
  return navigationItems.filter((item) => item.id !== 'admin' || isAdmin).map((item) => (
    <button
      className={`nav-item ${activePage === item.id ? 'active' : ''}`}
      key={item.id}
      type="button"
      aria-current={activePage === item.id ? 'page' : undefined}
      onClick={() => onNavigate(item.id)}
    >
      <Icon name={item.icon} size={18} />
      <span>{item.label}</span>
      {item.id === 'exam' && <span className="nav-tag">NEW</span>}
      {['quiz', 'exam'].includes(item.id) && !premiumActive && <span className="nav-tag premium-nav-tag">PREMIUM</span>}
    </button>
  ))
}

function MobileNavigation({ activePage, onNavigate, isAdmin, premiumActive }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const primary = navigationItems.filter((item) => ['home', 'chat', 'summary', 'quiz'].includes(item.id))
  const more = navigationItems.filter((item) => ['exam', 'planner', 'history', 'plans', 'admin'].includes(item.id) && (item.id !== 'admin' || isAdmin))
  const activeIsMore = more.some((item) => item.id === activePage)
  const goTo = (page) => { setMoreOpen(false); onNavigate(page) }
  return (
    <>
      {moreOpen && <button className="mobile-more-scrim" type="button" aria-label="Close navigation menu" onClick={() => setMoreOpen(false)} />}
      {moreOpen && <nav id="mobile-more-menu" className="mobile-more-menu" aria-label="More destinations">
        {more.map((item) => <button key={item.id} type="button" className={`mobile-more-item${activePage === item.id ? ' active' : ''}`} aria-current={activePage === item.id ? 'page' : undefined} onClick={() => goTo(item.id)}><Icon name={item.icon} size={17} /><span>{item.label}</span>{item.id === 'exam' && <span className="nav-tag">NEW</span>}{['quiz', 'exam'].includes(item.id) && !premiumActive && <span className="nav-tag premium-nav-tag">PREMIUM</span>}</button>)}
      </nav>}
      <nav className="mobile-nav" aria-label="Main navigation">
        {primary.map((item) => <button key={item.id} className={`nav-item ${activePage === item.id ? 'active' : ''}`} type="button" aria-current={activePage === item.id ? 'page' : undefined} aria-label={item.label} onClick={() => goTo(item.id)}><Icon name={item.icon} size={18} /><span>{({ home: 'Home', chat: 'Tutor', summary: 'Notes', quiz: 'Quiz' })[item.id]}</span></button>)}
        <button className={`nav-item mobile-more-trigger${activeIsMore ? ' active' : ''}${moreOpen ? ' is-open' : ''}`} type="button" aria-expanded={moreOpen} aria-controls="mobile-more-menu" aria-label="More pages" onClick={() => setMoreOpen((open) => !open)}><Icon name="menu" size={18} /><span>More</span></button>
      </nav>
    </>
  )
}

function Sidebar({ activePage, onNavigate, aiMode = 'demo', isAdmin = false, premiumActive = false, isOpen = false, onClose, studentName = '', studentClass = '', studentEmail = '' }) {
  const goTo = (page) => { onNavigate(page); onClose?.() }
  return (
    <>
      {isOpen && <button className="sidebar-backdrop" type="button" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar${isOpen ? ' is-open' : ''}`}>
        <button className="brand-lockup" type="button" onClick={() => goTo('home')}>
          <span className="brand-symbol"><BrandMark className="brand-mark-graphic" /></span>
          <span className="brand-name">StudyMate<span>AI</span></span>
        </button>

        <div className="sidebar-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <NavItems activePage={activePage} onNavigate={goTo} isAdmin={isAdmin} premiumActive={premiumActive} />
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-tip">
          <div className="tip-icon"><Icon name="leaf" size={17} /></div>
          <p className="tip-title">Small steps add up.</p>
          <p className="tip-copy">A little practice today makes tomorrow easier.</p>
        </div>
        <div className="profile-row">
          <div className="avatar">{studentName.trim()[0]?.toUpperCase() || 'S'}</div>
          <div className="profile-meta"><strong>{studentName || 'StudyMate workspace'}</strong><span>{studentClass || studentEmail || (aiMode === 'offline' ? 'Service unavailable' : 'Your study account')}</span></div>
          <span className={`profile-status ${aiMode === 'offline' ? 'is-offline' : ''}`} title={aiMode === 'gemini' ? 'AI service is ready' : aiMode === 'offline' ? 'API could not be reached' : 'StudyMate workspace'} />
        </div>
      </aside>
      <MobileNavigation activePage={activePage} onNavigate={onNavigate} isAdmin={isAdmin} premiumActive={premiumActive} />
    </>
  )
}

export default Sidebar
