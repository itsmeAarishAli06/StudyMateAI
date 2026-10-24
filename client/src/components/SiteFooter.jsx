import BrandMark from './BrandMark.jsx'
import Icon from './Icon.jsx'

const footerNavigation = [
  { id: 'chat', label: 'AI tutor' },
  { id: 'summary', label: 'Summarize notes' },
  { id: 'quiz', label: 'Quiz maker' },
  { id: 'planner', label: 'Study planner' },
  { id: 'history', label: 'Study history' },
]

function safeProfileUrl(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}

function SiteFooter({ onNavigate, linkedinUrl = '', portfolioUrl = '', contactEmail = '' }) {
  const linkedin = safeProfileUrl(linkedinUrl)
  const portfolio = safeProfileUrl(portfolioUrl)
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) ? contactEmail : ''
  const hasContactLinks = Boolean(linkedin || portfolio || email)

  function navigate(id) {
    onNavigate(id)
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  return (
    <footer className="site-footer">
      <div className={`site-footer-inner ${hasContactLinks ? '' : 'without-contact'}`}>
        <div className="site-footer-main">
          <section className="footer-brand-column" aria-label="About StudyMate">
            <button className="footer-brand" type="button" onClick={() => navigate('home')} aria-label="StudyMate AI home">
              <span className="footer-brand-mark"><BrandMark className="brand-mark-graphic" /></span>
              <span>StudyMate<span>AI</span></span>
            </button>
            <p>A calmer space to understand your notes, practice what you learn, and keep moving forward.</p>
            <span className="footer-value"><Icon name="check" size={14} /> Built to support your study rhythm</span>
          </section>

          <nav className="footer-navigation" aria-label="StudyMate features">
            <h2>Explore</h2>
            {footerNavigation.map((item) => (
              <button key={item.id} type="button" onClick={() => navigate(item.id)}>{item.label}<Icon name="arrow" size={13} /></button>
            ))}
          </nav>

          {hasContactLinks && (
            <nav className="footer-connect" aria-label="Connect with the creator">
              <h2>Connect</h2>
              {linkedin && <a href={linkedin} target="_blank" rel="noopener noreferrer"><Icon name="linkedin" size={16} />LinkedIn<Icon name="external" size={13} /></a>}
              {portfolio && <a href={portfolio} target="_blank" rel="noopener noreferrer"><Icon name="briefcase" size={16} />Portfolio<Icon name="external" size={13} /></a>}
              {email && <a className="footer-email-link" href={`mailto:${email}`}><Icon name="mail" size={16} /><span>{email}</span></a>}
            </nav>
          )}
        </div>

        <div className="site-footer-bottom">
          <span>© {new Date().getFullYear()} StudyMate AI</span>
          <span>Learn at your pace. Grow every day.</span>
        </div>
      </div>
    </footer>
  )
}

export default SiteFooter
