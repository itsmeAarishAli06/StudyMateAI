import { useEffect, useRef, useState } from 'react'
import Icon from './components/Icon.jsx'
import BrandMark from './components/BrandMark.jsx'
import SiteFooter from './components/SiteFooter.jsx'
import Sidebar from './components/Sidebar.jsx'
import { createStudyItem, getAiDailyUsage, getHealth, getStudyItems } from './lib/api.js'
import { authConfigured, getSession, signIn, signOut, signUp } from './lib/auth.js'
import { getCurrentStreak } from './lib/progress.js'
import ChatPage from './pages/ChatPage.jsx'
import Dashboard from './pages/Dashboard.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import QuizPage from './pages/QuizPage.jsx'
import SummaryPage from './pages/SummaryPage.jsx'
import StudyPlanPage from './pages/StudyPlanPage.jsx'
import './App.css'

const pageNames = {
  home: 'Overview',
  chat: 'AI tutor',
  summary: 'Summarizer',
  quiz: 'Quiz maker',
  history: 'Study history',
  planner: 'Study planner',
}

function loadSavedItems() {
  try {
    const stored = JSON.parse(window.localStorage.getItem('studymate.savedItems') || '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(authConfigured)
  const [authError, setAuthError] = useState('')
  const [activePage, setActivePage] = useState('home')
  const [items, setItems] = useState(() => authConfigured ? [] : loadSavedItems())
  const [chatMessages, setChatMessages] = useState([])
  const [chatLearningMode, setChatLearningMode] = useState('tutor')
  const [selectedSummary, setSelectedSummary] = useState(null)
  const [selectedQuiz, setSelectedQuiz] = useState(null)
  const [toast, setToast] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const profileMenuRef = useRef(null)
  const profileTriggerRef = useRef(null)
  const [apiStatus, setApiStatus] = useState('checking')
  const [aiMode, setAiMode] = useState('demo')
  const [aiUsage, setAiUsage] = useState(null)
  const [aiUsageStatus, setAiUsageStatus] = useState('idle')
  const [historyStatus, setHistoryStatus] = useState(authConfigured ? 'loading' : 'demo')
  const currentStreak = getCurrentStreak(items)
  const streakAvailable = !authConfigured || historyStatus === 'ready' || historyStatus === 'demo'

  useEffect(() => {
    getHealth().then((health) => {
      setAiMode(health.aiProvider || 'demo')
      setApiStatus('online')
    }).catch(() => setApiStatus('offline'))
  }, [])

  useEffect(() => {
    if (!authConfigured) return undefined
    let active = true
    getSession().then((currentSession) => {
      if (!active) return
      setSession(currentSession)
      setAuthLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!authConfigured || !session) return undefined
    let active = true
    setHistoryStatus('loading')
    getStudyItems(session.access_token).then((savedItems) => {
      if (!active) return
      setItems(savedItems)
      setHistoryStatus('ready')
    }).catch((error) => {
      if (!active) return
      setHistoryStatus('error')
      setAuthError(error.message)
    })
    return () => { active = false }
  }, [session?.access_token])

  useEffect(() => {
    const token = session?.access_token
    if (!authConfigured || !token) {
      setAiUsage(null)
      setAiUsageStatus('idle')
      return undefined
    }

    let active = true
    async function refreshUsage() {
      setAiUsageStatus((status) => status === 'ready' ? 'refreshing' : 'loading')
      try {
        const usage = await getAiDailyUsage(token)
        if (!active) return
        setAiUsage(usage)
        setAiUsageStatus('ready')
      } catch {
        if (!active) return
        setAiUsageStatus('error')
      }
    }

    window.addEventListener('studymate:ai-usage-refresh', refreshUsage)
    refreshUsage()
    return () => {
      active = false
      window.removeEventListener('studymate:ai-usage-refresh', refreshUsage)
    }
  }, [session?.access_token])

  useEffect(() => {
    if (authConfigured) return
    try {
      window.localStorage.setItem('studymate.savedItems', JSON.stringify(items))
    } catch {
      // Saved history remains available for this session if browser storage is disabled.
    }
  }, [items])

  useEffect(() => {
    if (!toast) return undefined
    const timeoutId = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timeoutId)
  }, [toast])

  useEffect(() => {
    if (!profileOpen) return undefined
    function closeMenu(event) {
      if (event.type === 'keydown' && event.key === 'Escape') {
        setProfileOpen(false)
        profileTriggerRef.current?.focus()
        return
      }
      if (event.type === 'pointerdown' && !profileMenuRef.current?.contains(event.target)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeMenu)
    document.addEventListener('keydown', closeMenu)
    return () => {
      document.removeEventListener('pointerdown', closeMenu)
      document.removeEventListener('keydown', closeMenu)
    }
  }, [profileOpen])

  function openItem(item) {
    if (item.type === 'quiz') {
      setSelectedQuiz(item)
      setActivePage('quiz')
      return
    }
    setSelectedSummary(item)
    setActivePage('summary')
  }

  async function saveSummary(summary) {
    const item = {
      id: crypto.randomUUID(),
      type: 'summary',
      title: summary.title,
      preview: summary.content.lead,
      dateLabel: 'Just now',
      createdAt: new Date().toISOString(),
      sourceText: summary.sourceText,
      content: summary.content,
    }
    try {
      const savedItem = authConfigured
        ? await createStudyItem({ type: 'summary', title: item.title, sourceText: item.sourceText, content: item.content }, session.access_token)
        : item
      setItems((current) => [savedItem, ...current])
      setSelectedSummary(savedItem)
      setToast('Summary saved to your study history')
      return savedItem
    } catch (error) {
      setToast(error.message || 'Could not save this summary. Please try again.')
      throw error
    }
  }

  async function saveQuiz(quiz) {
    const item = {
      id: crypto.randomUUID(),
      type: 'quiz',
      title: quiz.title,
      preview: `${quiz.questions.length} questions to help you check your understanding.`,
      dateLabel: 'Just now',
      createdAt: new Date().toISOString(),
      score: quiz.score,
      questions: quiz.questions,
    }
    try {
      const savedItem = authConfigured
        ? await createStudyItem({ type: 'quiz', title: item.title, questions: item.questions, score: item.score }, session.access_token)
        : item
      setItems((current) => [savedItem, ...current])
      setToast('Quiz saved to your study history')
      return savedItem
    } catch (error) {
      setToast(error.message || 'Could not save this quiz. Please try again.')
      throw error
    }
  }

  async function submitAuth(mode, email, password) {
    setAuthError('')
    try {
      const nextSession = mode === 'signup' ? await signUp(email, password) : await signIn(email, password)
      if (!nextSession) return 'Check your email for a confirmation link, then sign in.'
      setSession(nextSession)
      setAuthLoading(false)
      return ''
    } catch (error) {
      setAuthError(error.message)
      throw error
    }
  }

  async function handleSignOut() {
    await signOut()
    setProfileOpen(false)
    setSession(null)
    setItems([])
    setHistoryStatus('loading')
    setActivePage('home')
  }

  if (authLoading) return <AuthLoading />
  if (authConfigured && !session) return <AuthScreen error={authError} onSubmit={submitAuth} />

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} aiMode={apiStatus === 'offline' ? 'offline' : aiMode} />
      <div className="workspace">
        <header className="workspace-topbar">
          <div className="mobile-brand"><span className="brand-symbol"><BrandMark className="brand-mark-graphic" /></span><span className="brand-name">StudyMate<span>AI</span></span></div>
          <div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={13} /><strong aria-current="page">{pageNames[activePage]}</strong></div>
          <div className="topbar-actions">
            <button
              className={`study-streak-quick${streakAvailable && currentStreak > 0 ? ' has-streak' : ''}`}
              type="button"
              aria-label={streakAvailable
                ? `Current study streak: ${currentStreak} ${currentStreak === 1 ? 'day' : 'days'}. Open progress dashboard.`
                : 'Study streak is loading or unavailable.'}
              title={streakAvailable
                ? `${currentStreak} ${currentStreak === 1 ? 'day' : 'days'} based on days you save a summary or quiz. Open your progress dashboard.`
                : 'Your study streak appears when saved history is available.'}
              onClick={() => setActivePage('home')}
            >
              <Icon name="flame" size={17} />
              <strong>{streakAvailable ? currentStreak : '—'}</strong>
              <span>day streak</span>
            </button>
            {authConfigured && aiUsage && (
              <div className="ai-usage-quick" role="status" aria-live="polite" aria-label={`${aiUsage.used} of ${aiUsage.dailyLimit} daily AI requests used; ${aiUsage.remaining} remaining`} title={`${aiUsage.used} used today · ${aiUsage.remaining} remaining · resets at ${new Date(aiUsage.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}>
                <span className="ai-usage-quick-dot" />
                <strong>{aiUsage.remaining} / {aiUsage.dailyLimit}</strong>
                <span className="ai-usage-quick-label">left today</span>
              </div>
            )}
            <div className="profile-menu-wrap" ref={profileMenuRef}>
              <button
                className="profile-menu-trigger"
                type="button"
                ref={profileTriggerRef}
                aria-controls="account-popover"
                aria-expanded={profileOpen}
                aria-label={authConfigured ? `Account menu for ${session.user.email}` : 'Open guest profile menu'}
                onClick={() => {
                  const opening = !profileOpen
                  setProfileOpen(opening)
                  if (opening && authConfigured) window.dispatchEvent(new Event('studymate:ai-usage-refresh'))
                }}
              >
                <span className="topbar-avatar">{authConfigured ? session.user.email?.[0]?.toUpperCase() || 'S' : 'S'}</span>
                <span className="profile-trigger-copy"><strong>{authConfigured ? 'My account' : 'Guest session'}</strong><small>{authConfigured ? session.user.email : 'Local workspace'}</small></span>
                <Icon name="chevron" size={15} />
              </button>
              {profileOpen && (
                <div className="profile-menu" id="account-popover" role="region" aria-label="Account and daily usage">
                  <div className="profile-menu-heading">
                    <span className="profile-menu-avatar">{authConfigured ? session.user.email?.[0]?.toUpperCase() || 'S' : 'S'}</span>
                    <span><strong>{authConfigured ? 'Signed in' : 'Guest workspace'}</strong><small>{authConfigured ? session.user.email : 'Your saved work stays in this browser.'}</small></span>
                  </div>
                  {authConfigured && (
                    <section className="ai-usage-card" aria-label="Daily AI request usage" aria-live="polite">
                      <div className="ai-usage-heading"><strong>AI requests today</strong><span>{aiUsageStatus === 'ready' || aiUsageStatus === 'refreshing' ? `${aiUsage.used} / ${aiUsage.dailyLimit}` : 'Daily limit'}</span></div>
                      {aiUsage && <div className="ai-usage-track" role="progressbar" aria-label="Daily AI requests used" aria-valuemin="0" aria-valuemax={aiUsage.dailyLimit} aria-valuenow={aiUsage.used}><span style={{ width: `${Math.min(100, (aiUsage.used / aiUsage.dailyLimit) * 100)}%` }} /></div>}
                      <div className="ai-usage-foot">
                        {aiUsageStatus === 'ready' || aiUsageStatus === 'refreshing'
                          ? <><span>{aiUsage.remaining} remaining</span><small>Resets {new Date(aiUsage.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></>
                          : aiUsageStatus === 'error'
                            ? <><span>Usage unavailable</span><button type="button" onClick={() => window.dispatchEvent(new Event('studymate:ai-usage-refresh'))}>Retry</button></>
                            : <span>Loading your daily allowance…</span>}
                      </div>
                    </section>
                  )}
                  {authConfigured
                    ? <button className="profile-menu-signout" type="button" onClick={handleSignOut}><Icon name="logout" size={16} />Sign out</button>
                    : <div className="profile-menu-note">Sign in becomes available when account authentication is configured.</div>}
                </div>
              )}
            </div>
          </div>
        </header>

        {authConfigured && historyStatus === 'error' && <div className="history-error-banner" role="alert">{authError || 'Study history could not be loaded.'}<button type="button" onClick={() => { setAuthError(''); setHistoryStatus('loading'); getStudyItems(session.access_token).then((saved) => { setItems(saved); setHistoryStatus('ready') }).catch((error) => { setAuthError(error.message); setHistoryStatus('error') }) }}>Retry</button></div>}
        {authConfigured && historyStatus === 'loading' && <div className="history-loading-banner" role="status">Loading your study history…</div>}
        {!authConfigured && <div className="demo-history-banner" role="status">Demo mode: history is saved in this browser. Add Supabase settings to enable your private account history.</div>}

        <main className="main-content" key={activePage}>
          {activePage === 'home' && <Dashboard savedItems={items} onNavigate={setActivePage} onOpenItem={openItem} />}
          {activePage === 'chat' && <ChatPage messages={chatMessages} onMessagesChange={setChatMessages} onNavigate={setActivePage} aiMode={aiMode} accessToken={session?.access_token} learningMode={chatLearningMode} onLearningModeChange={setChatLearningMode} />}
          {activePage === 'summary' && <SummaryPage selectedSummary={selectedSummary} onSave={saveSummary} onToast={setToast} onReset={() => setSelectedSummary(null)} accessToken={session?.access_token} />}
          {activePage === 'quiz' && <QuizPage selectedQuiz={selectedQuiz} savedItems={items} onSave={saveQuiz} onReset={() => setSelectedQuiz(null)} onToast={setToast} accessToken={session?.access_token} />}
          {activePage === 'history' && <HistoryPage items={items} onOpenItem={openItem} onNavigate={setActivePage} />}
          {activePage === 'planner' && <StudyPlanPage accessToken={session?.access_token} onToast={setToast} />}
        </main>
        <SiteFooter
          onNavigate={setActivePage}
          linkedinUrl="https://www.linkedin.com/in/aarish-ali-a20704367/"
          portfolioUrl="https://aarishali.infinityfreeapp.com/"
          contactEmail="itsmeaarish06@gmail.com"
        />
      </div>

      {toast && <div className="toast-message" role="status"><span className="toast-check"><Icon name="check" size={14} /></span>{toast}<button type="button" aria-label="Dismiss message" onClick={() => setToast('')}><Icon name="close" size={15} /></button></div>}
    </div>
  )
}

function AuthLoading() {
  return <main className="auth-shell"><div className="auth-loading-card" role="status"><span className="auth-brand-mark"><BrandMark className="brand-mark-graphic" /></span><span className="button-spinner" /><h1>Loading your study space</h1><p>Getting everything ready for you.</p></div></main>
}

function AuthScreen({ error, onSubmit }) {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const isSignIn = mode === 'signin'

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    setLoading(true)
    try { setMessage(await onSubmit(mode, email.trim(), password)) } catch { /* Error is rendered by the parent. */ } finally { setLoading(false) }
  }

  return (
    <main className="auth-shell">
      <div className="auth-frame">
        <section className="auth-story" aria-label="StudyMate introduction">
          <div className="auth-brand"><span className="auth-brand-mark"><BrandMark className="brand-mark-graphic" /></span><span>StudyMate<span>AI</span></span></div>
          <div className="auth-story-copy">
            <span className="auth-eyebrow"><i /> YOUR PERSONAL STUDY SPACE</span>
            <h2>Make room for<br /><em>what you&apos;ll become.</em></h2>
            <p>Turn big study sessions into small, clear steps. Your notes, practice, and progress all in one calm place.</p>
          </div>
          <div className="auth-preview" aria-hidden="true">
            <div className="auth-preview-top"><span className="preview-spark"><Icon name="spark" size={14} /></span><span>YOUR LEARNING, IN FLOW</span><span className="preview-live">READY</span></div>
            <div className="auth-preview-line"><span className="preview-icon"><Icon name="notes" size={15} /></span><span><strong>Study guides</strong><small>Make complex notes feel clear</small></span><span className="preview-check"><Icon name="check" size={13} /></span></div>
            <div className="auth-preview-line"><span className="preview-icon preview-quiz"><Icon name="quiz" size={15} /></span><span><strong>Quick practice</strong><small>Build confidence one question at a time</small></span><span className="preview-check"><Icon name="check" size={13} /></span></div>
            <div className="auth-preview-footer"><span className="preview-avatars"><i>S</i><i>+</i></span><span>Made for your next breakthrough</span><Icon name="arrow" size={15} /></div>
          </div>
          <div className="auth-story-foot"><span>FOCUS WITH PURPOSE</span><span>LEARN AT YOUR PACE</span><span>GROW EVERY DAY</span></div>
        </section>

        <section className="auth-card">
          <div className="auth-mobile-brand"><span className="auth-brand-mark"><BrandMark className="brand-mark-graphic" /></span><span>StudyMate<span>AI</span></span></div>
          <div className="auth-form-heading"><span className="auth-form-kicker">{isSignIn ? 'WELCOME BACK' : 'A FRESH START'}</span><h1>{isSignIn ? 'Sign in to your space.' : 'Create your account.'}</h1><p>{isSignIn ? 'Pick up right where your learning left off.' : 'Set up your private study space in a moment.'}</p></div>
          <form onSubmit={submit}>
            <label className="field-label" htmlFor="auth-email">Email address</label>
            <div className="auth-input-wrap"><span className="auth-input-icon"><Icon name="chat" size={16} /></span><input className="text-input" id="auth-email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            <label className="field-label" htmlFor="auth-password">Password</label>
            <div className="auth-input-wrap"><span className="auth-input-icon"><Icon name="history" size={16} /></span><input className="text-input" id="auth-password" type="password" autoComplete={isSignIn ? 'current-password' : 'new-password'} placeholder="At least 6 characters" minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            {(error || message) && <p className={error ? 'form-error' : 'auth-success'} role={error ? 'alert' : 'status'}>{error || message}</p>}
            <button className="button button-primary full-button auth-submit" type="submit" disabled={loading}>{loading ? <><span className="button-spinner" /> Please wait...</> : <>{isSignIn ? 'Sign in' : 'Create account'} <Icon name="arrow" size={16} /></>}</button>
          </form>
          <div className="auth-divider"><span /> <small>YOUR PROGRESS, KEPT SAFE</small> <span /></div>
          <p className="auth-privacy"><Icon name="check" size={14} /> Your study history stays private to your account.</p>
          <div className="auth-switch-row"><span>{isSignIn ? 'New to StudyMate?' : 'Already have an account?'}</span><button className="auth-switch" type="button" onClick={() => { setMode(isSignIn ? 'signup' : 'signin'); setMessage('') }}>{isSignIn ? 'Create an account' : 'Sign in'}</button></div>
        </section>
      </div>
    </main>
  )
}

export default App
