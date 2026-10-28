import { useEffect, useRef, useState } from 'react'
import Icon from './components/Icon.jsx'
import BrandMark from './components/BrandMark.jsx'
import SiteFooter from './components/SiteFooter.jsx'
import Sidebar from './components/Sidebar.jsx'
import { createStudyItem, getAiDailyUsage, getHealth, getStudyItems } from './lib/api.js'
import { authConfigured, consumePasswordRecovery, getSession, requestPasswordReset, signIn, signOut, signUp, updatePassword } from './lib/auth.js'
import { getPasswordStrength } from './lib/passwordStrength.js'
import { getCurrentStreak } from './lib/progress.js'
import ChatPage from './pages/ChatPage.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ExamPreparationPage from './pages/ExamPreparationPage.jsx'
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
  exam: 'Exam preparation',
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
  const [authFlow, setAuthFlow] = useState('')
  const [activePage, setActivePage] = useState('home')
  const [items, setItems] = useState(() => authConfigured ? [] : loadSavedItems())
  const [chatMessages, setChatMessages] = useState([])
  const [chatLearningMode, setChatLearningMode] = useState('tutor')
  const [selectedSummary, setSelectedSummary] = useState(null)
  const [selectedQuiz, setSelectedQuiz] = useState(null)
  const [quizTopicSeed, setQuizTopicSeed] = useState(null)
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
    async function restoreSession() {
      try {
        const recoverySession = await consumePasswordRecovery()
        const currentSession = recoverySession || await getSession()
        if (!active) return
        if (recoverySession) setAuthFlow('recovery')
        setSession(currentSession)
      } catch (error) {
        if (!active) return
        setAuthError(error.message)
        setSession(null)
      } finally {
        if (active) setAuthLoading(false)
      }
    }
    restoreSession()
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
    setQuizTopicSeed(null)
    if (item.type === 'quiz') {
      setSelectedQuiz(item)
      setActivePage('quiz')
      return
    }
    setSelectedSummary(item)
    setActivePage('summary')
  }

  function practiceExamWeakTopic(topic) {
    setSelectedQuiz(null)
    setQuizTopicSeed({ topic, id: crypto.randomUUID() })
    setActivePage('quiz')
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
      if (mode === 'forgot') {
        const redirectTo = `${window.location.origin}/?flow=recovery`
        await requestPasswordReset(email, redirectTo)
        return 'If an account exists for this email, a password reset link will be sent shortly.'
      }
      if (mode === 'reset') {
        await updatePassword(password, session?.access_token)
        return 'Your password has been updated. You can now continue to StudyMate.'
      }
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
  if (authConfigured && ['recovery', 'password-change'].includes(authFlow) && session) return <AuthScreen initialMode="reset" passwordChange={authFlow === 'password-change'} email={session.user.email || ''} error={authError} onSubmit={submitAuth} onRecoveryComplete={() => { setAuthError(''); setAuthFlow('') }} />
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
                    ? <div className="profile-menu-actions">
                      <button className="profile-menu-change-password" type="button" onClick={() => { setProfileOpen(false); setAuthError(''); setAuthFlow('password-change') }}><Icon name="history" size={16} />Change password<Icon className="profile-menu-action-arrow" name="arrow" size={14} /></button>
                      <button className="profile-menu-signout" type="button" onClick={handleSignOut}><Icon name="logout" size={16} />Sign out</button>
                    </div>
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
          {activePage === 'quiz' && <QuizPage selectedQuiz={selectedQuiz} topicSeed={quizTopicSeed} onTopicSeedConsumed={() => setQuizTopicSeed(null)} savedItems={items} onSave={saveQuiz} onReset={() => { setSelectedQuiz(null); setQuizTopicSeed(null) }} onToast={setToast} accessToken={session?.access_token} />}
          {activePage === 'exam' && <ExamPreparationPage accessToken={session?.access_token} onNavigate={setActivePage} onPracticeTopic={practiceExamWeakTopic} onToast={setToast} />}
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

export function AuthScreen({ error, onSubmit, initialMode = 'signin', email: initialEmail = '', onRecoveryComplete, passwordChange = false }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmationVisible, setConfirmationVisible] = useState(false)
  const [message, setMessage] = useState('')
  const [localError, setLocalError] = useState('')
  const [loading, setLoading] = useState(false)
  const [passwordUpdated, setPasswordUpdated] = useState(false)
  const isSignIn = mode === 'signin'
  const isForgot = mode === 'forgot'
  const isReset = mode === 'reset'
  const showPasswordStrength = mode === 'signup' || isReset
  const passwordStrength = getPasswordStrength(password)

  const heading = isSignIn
    ? ['WELCOME BACK', 'Sign in to your space.', 'Pick up right where your learning left off.']
    : mode === 'signup'
      ? ['A FRESH START', 'Create your account.', 'Set up your private study space in a moment.']
      : isForgot
        ? ['ACCOUNT RECOVERY', 'Reset your password.', 'We’ll email you a secure link to get back into your study space.']
        : passwordChange
          ? ['ACCOUNT SETTINGS', 'Change your password.', 'Choose a new password to keep your StudyMate account secure.']
          : ['SECURE YOUR ACCOUNT', 'Choose a new password.', 'Create a fresh password for your StudyMate account.']

  async function submit(event) {
    event.preventDefault()
    setMessage('')
    if (isReset && password !== passwordConfirmation) {
      setLocalError('Your passwords do not match. Check both fields and try again.')
      return
    }
    setLocalError('')
    setLoading(true)
    try {
      setMessage(await onSubmit(mode, email.trim(), password))
      if (isReset) setPasswordUpdated(true)
    } catch { /* Error is rendered by the parent. */ } finally { setLoading(false) }
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
          <div className="auth-form-heading"><span className="auth-form-kicker">{heading[0]}</span><h1>{heading[1]}</h1><p>{heading[2]}</p></div>
          {passwordUpdated ? <div className="auth-recovery-complete" role="status"><span className="auth-recovery-check"><Icon name="check" size={19} /></span><strong>Password updated</strong><p>{passwordChange ? 'Your StudyMate password has changed. Your current session is still active.' : 'Your new password is ready. Sign in with it the next time you return.'}</p><button className="button button-primary full-button auth-submit" type="button" onClick={onRecoveryComplete}>Continue to StudyMate <Icon name="arrow" size={16} /></button></div> : <form onSubmit={submit}>
            <label className="field-label" htmlFor="auth-email">Email address</label>
            <div className="auth-input-wrap"><span className="auth-input-icon"><Icon name="mail" size={16} /></span><input className="text-input" id="auth-email" type="email" autoComplete="email" placeholder="you@example.com" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={isReset} /></div>
            {!isForgot && <>
              <label className="field-label" htmlFor="auth-password">{isReset ? 'New password' : 'Password'}</label>
              <div className="auth-input-wrap"><span className="auth-input-icon"><Icon name="history" size={16} /></span><input className="text-input" id="auth-password" type={passwordVisible ? 'text' : 'password'} autoComplete={isSignIn ? 'current-password' : 'new-password'} placeholder={isReset ? 'Choose at least 6 characters' : 'At least 6 characters'} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /><button className="auth-password-toggle" type="button" aria-label={passwordVisible ? 'Hide password' : 'Show password'} aria-pressed={passwordVisible} onClick={() => setPasswordVisible((visible) => !visible)}><Icon name={passwordVisible ? 'eyeOff' : 'eye'} size={18} /></button></div>
              {showPasswordStrength && <div className={`auth-password-strength strength-${passwordStrength.level}`}>
                <div className="auth-password-strength-heading"><span>Password strength</span><strong aria-live="polite">{passwordStrength.label}</strong></div>
                <div className="auth-password-strength-meter" role="progressbar" aria-label="Password strength" aria-valuemin="0" aria-valuemax="4" aria-valuenow={passwordStrength.barLevel} aria-valuetext={passwordStrength.label}>
                  {[1, 2, 3, 4].map((segment) => <span key={segment} className={segment <= passwordStrength.barLevel ? 'is-filled' : ''} />)}
                </div>
                <small aria-live="polite">{passwordStrength.hint}</small>
              </div>}
              {isReset && <><label className="field-label" htmlFor="auth-password-confirm">Confirm new password</label><div className="auth-input-wrap"><span className="auth-input-icon"><Icon name="history" size={16} /></span><input className="text-input" id="auth-password-confirm" type={confirmationVisible ? 'text' : 'password'} autoComplete="new-password" placeholder="Enter the new password again" minLength={6} required value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} /><button className="auth-password-toggle" type="button" aria-label={confirmationVisible ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={confirmationVisible} onClick={() => setConfirmationVisible((visible) => !visible)}><Icon name={confirmationVisible ? 'eyeOff' : 'eye'} size={18} /></button></div>{passwordConfirmation && passwordConfirmation !== password && <small className="auth-password-match" role="alert">Passwords do not match.</small>}</>}
              {isSignIn && <button className="auth-forgot-link" type="button" onClick={() => { setMode('forgot'); setMessage('') }}>Forgot password?</button>}
            </>}
            {(error || localError || message) && <p className={error || localError ? 'form-error' : 'auth-success'} role={error || localError ? 'alert' : 'status'}>{error || localError || message}</p>}
            <button className="button button-primary full-button auth-submit" type="submit" disabled={loading}>{loading ? <><span className="button-spinner" /> Please wait...</> : <>{isSignIn ? 'Sign in' : mode === 'signup' ? 'Create account' : isForgot ? 'Send reset link' : 'Update password'} <Icon name="arrow" size={16} /></>}</button>
            {passwordChange && <button className="auth-cancel-change" type="button" onClick={onRecoveryComplete}><Icon name="arrow" size={15} />Back to StudyMate</button>}
          </form>}
          <div className="auth-divider"><span /> <small>YOUR PROGRESS, KEPT SAFE</small> <span /></div>
          <p className="auth-privacy"><Icon name="check" size={14} /> Your study history stays private to your account.</p>
          {!isReset && !passwordUpdated && <div className="auth-switch-row">{isForgot ? <><span>Remembered your password?</span><button className="auth-switch" type="button" onClick={() => { setMode('signin'); setMessage('') }}>Back to sign in</button></> : <><span>{isSignIn ? 'New to StudyMate?' : 'Already have an account?'}</span><button className="auth-switch" type="button" onClick={() => { setMode(isSignIn ? 'signup' : 'signin'); setMessage('') }}>{isSignIn ? 'Create an account' : 'Sign in'}</button></>}</div>}
        </section>
      </div>
    </main>
  )
}

export default App
