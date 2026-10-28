import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import DocumentImport from '../components/DocumentImport.jsx'
import { createExamAttempt, getExamAttempts, submitExamAttempt } from '../lib/api.js'

const localStorageKey = 'studymate.examAttempts'
const questionCounts = [5, 10, 15]
const durations = [1, 3, 5, 10, 15, 20]
const difficulties = ['easy', 'standard', 'challenging']
const difficultyLabels = { easy: 'Easy', standard: 'Standard', challenging: 'Challenging' }

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateInDays(days) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return localDateKey(date)
}

function normalizeTopics(value) {
  return value.split('\n').map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
}

function readLocalAttempts() {
  try {
    const value = JSON.parse(window.localStorage.getItem(localStorageKey) || '[]')
    return Array.isArray(value) ? value.filter((attempt) => attempt && typeof attempt.title === 'string' && Array.isArray(attempt.questions)) : []
  } catch { return [] }
}

function saveLocalAttempts(attempts) {
  try { window.localStorage.setItem(localStorageKey, JSON.stringify(attempts.slice(0, 30))) } catch { /* The current exam remains available in memory. */ }
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function analyzeLocally(questions, answers, startedAt) {
  let score = 0
  const topics = new Map()
  const reviewedQuestions = questions.map((question, index) => {
    const selected = Number.isInteger(answers[index]) ? answers[index] : null
    const isCorrect = selected === question.answer
    if (isCorrect) score += 1
    const stats = topics.get(question.topic) || { topic: question.topic, total: 0, correct: 0 }
    stats.total += 1
    if (isCorrect) stats.correct += 1
    topics.set(question.topic, stats)
    return { ...question, selected, isCorrect }
  })
  const topicResults = [...topics.values()].map((topic) => ({ ...topic, accuracy: Math.round(topic.correct / topic.total * 100) }))
    .sort((left, right) => left.accuracy - right.accuracy || left.topic.localeCompare(right.topic))
  const weakTopics = topicResults.filter((topic) => topic.accuracy < 70).slice(0, 5)
  return {
    score,
    total: questions.length,
    percentage: Math.round(score / questions.length * 100),
    timeUsedSeconds: Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000)),
    topics: topicResults,
    weakTopics: weakTopics.map((topic) => topic.topic),
    revisionPlan: weakTopics.map((topic, index) => ({
      topic: topic.topic,
      accuracy: topic.accuracy,
      minutes: topic.accuracy < 40 ? 30 : 20,
      task: topic.accuracy < 40 ? `Relearn the core ideas in ${topic.topic}, then retry missed questions.` : `Review ${topic.topic} and practice the questions you missed.`,
      priority: index + 1,
    })),
    questions: reviewedQuestions,
  }
}

function ExamPreparationPage({ accessToken, onNavigate, onPracticeTopic, onToast }) {
  const [title, setTitle] = useState('')
  const [examDate, setExamDate] = useState(() => dateInDays(30))
  const [topicsText, setTopicsText] = useState('')
  const [notes, setNotes] = useState('')
  const [questionCount, setQuestionCount] = useState(15)
  const [durationMinutes, setDurationMinutes] = useState(10)
  const [difficulty, setDifficulty] = useState('standard')
  const [attempts, setAttempts] = useState([])
  const [activeExam, setActiveExam] = useState(null)
  const [answers, setAnswers] = useState({})
  const [remainingMs, setRemainingMs] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loadStatus, setLoadStatus] = useState(accessToken ? 'loading' : 'ready')
  const [error, setError] = useState('')
  const submitGuard = useRef(false)
  const autoSubmitAttempted = useRef(false)

  const activeTopics = useMemo(() => normalizeTopics(topicsText), [topicsText])
  const result = activeExam?.status === 'submitted' ? activeExam.result : null
  const localOnly = !accessToken

  useEffect(() => {
    let active = true
    if (!accessToken) {
      const saved = readLocalAttempts()
      if (active) {
        setAttempts(saved)
        setActiveExam(saved.find((attempt) => attempt.status === 'in_progress') || null)
        setLoadStatus('ready')
      }
      return () => { active = false }
    }
    getExamAttempts(accessToken).then((saved) => {
      if (!active) return
      setAttempts(saved)
      setActiveExam(saved.find((attempt) => attempt.status === 'in_progress') || null)
      setLoadStatus('ready')
    }).catch((loadError) => {
      if (!active) return
      setError(loadError.message || 'Could not load your exam history.')
      setLoadStatus('error')
    })
    return () => { active = false }
  }, [accessToken])

  useEffect(() => {
    if (!activeExam || activeExam.status !== 'in_progress') return undefined
    try {
      const draft = JSON.parse(window.localStorage.getItem(`studymate.examDraft.${activeExam.id || 'local'}`) || '{}')
      if (draft && typeof draft === 'object' && !Array.isArray(draft)) setAnswers(draft)
    } catch { setAnswers({}) }
    return undefined
  }, [activeExam?.id, activeExam?.status])

  const finishExam = useCallback(async (automatic = false) => {
    if (!activeExam || activeExam.status !== 'in_progress' || submitGuard.current) return
    submitGuard.current = true
    setIsSubmitting(true)
    setError('')
    try {
      const answerList = activeExam.questions.map((_, index) => Number.isInteger(answers[index]) ? answers[index] : null)
      const nextResult = activeExam.id && !activeExam.localOnly
        ? await submitExamAttempt(activeExam.id, answerList, accessToken)
        : analyzeLocally(activeExam.localQuestions || activeExam.questions, answers, activeExam.startedAt)
      const completed = { ...activeExam, status: 'submitted', result: nextResult, submittedAt: new Date().toISOString() }
      setActiveExam(completed)
      setAttempts((current) => {
        const next = [completed, ...current.filter((attempt) => attempt.id !== completed.id)].slice(0, 30)
        if (localOnly) saveLocalAttempts(next)
        return next
      })
      try { window.localStorage.removeItem(`studymate.examDraft.${activeExam.id || 'local'}`) } catch { /* Ignore unavailable browser storage. */ }
      if (automatic) onToast('Time is up. Your exam was submitted automatically.')
      else onToast('Mock exam submitted. Review your topic results and next steps.')
    } catch (submitError) {
      setError(submitError.message || 'Could not submit your exam. Your answers are still here; please retry.')
      submitGuard.current = false
    } finally {
      setIsSubmitting(false)
    }
  }, [accessToken, activeExam, answers, localOnly, onToast])

  useEffect(() => {
    if (!activeExam || activeExam.status !== 'in_progress') return undefined
    function tick() {
      const next = Date.parse(activeExam.expiresAt) - Date.now()
      setRemainingMs(next)
      if (next <= 0 && !autoSubmitAttempted.current) {
        autoSubmitAttempted.current = true
        finishExam(true)
      }
    }
    tick()
    const timer = window.setInterval(tick, 500)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [activeExam, finishExam])

  function setAnswer(questionIndex, optionIndex) {
    if (!activeExam || activeExam.status !== 'in_progress') return
    setAnswers((current) => {
      const next = { ...current, [questionIndex]: optionIndex }
      try { window.localStorage.setItem(`studymate.examDraft.${activeExam.id || 'local'}`, JSON.stringify(next)) } catch { /* Answers remain in memory if storage is unavailable. */ }
      return next
    })
    setError('')
  }

  async function startExam(event) {
    event.preventDefault()
    const topics = normalizeTopics(topicsText)
    const uniqueTopics = [...new Set(topics.map((topic) => topic.toLocaleLowerCase()))]
    if (!title.trim()) return setError('Add a name for this exam, such as Biology final.')
    if (!examDate || examDate < localDateKey(new Date())) return setError('Choose today or a future exam date.')
    if (!topics.length || topics.length > 15 || uniqueTopics.length !== topics.length || topics.some((topic) => topic.length > 120)) return setError('Add 1 to 15 unique syllabus topics, one per line. Each can be up to 120 characters.')
    if (questionCount < topics.length) return setError(`Choose at least ${topics.length} questions so every syllabus topic is covered.`)

    setError('')
    setIsLoading(true)
    try {
      const generated = await createExamAttempt({ title: title.trim(), examDate, topics, notes, questionCount, durationMinutes, difficulty }, accessToken)
      const exam = { ...generated, ...(generated.id ? {} : { id: crypto.randomUUID(), localOnly: true }), localQuestions: generated.localQuestions || generated.questions }
      setActiveExam(exam)
      setAnswers({})
      setRemainingMs(Date.parse(exam.expiresAt) - Date.now())
      submitGuard.current = false
      autoSubmitAttempted.current = false
      if (localOnly) {
        const next = [exam, ...attempts.filter((attempt) => attempt.id !== exam.id)].slice(0, 30)
        setAttempts(next)
        saveLocalAttempts(next)
      }
      try { window.localStorage.removeItem(`studymate.examDraft.${exam.id || 'local'}`) } catch { /* Ignore unavailable browser storage. */ }
    } catch (requestError) {
      setError(requestError.message || 'The mock exam could not be generated. Please retry.')
    } finally {
      setIsLoading(false)
    }
  }

  function openAttempt(attempt) {
    setError('')
    submitGuard.current = false
    autoSubmitAttempted.current = false
    setAnswers({})
    setActiveExam(attempt)
    if (attempt.status === 'submitted') {
      try {
        const saved = JSON.parse(window.localStorage.getItem(`studymate.examDraft.${attempt.id || 'local'}`) || '{}')
        setAnswers(saved)
      } catch { /* Results do not need a saved draft. */ }
    }
  }

  function returnToSetup() {
    setActiveExam(null)
    setAnswers({})
    setError('')
    submitGuard.current = false
    autoSubmitAttempted.current = false
  }

  const answeredCount = Object.keys(answers).filter((key) => Number.isInteger(answers[key])).length
  const timeLow = remainingMs <= 60_000
  const warningLevel = remainingMs <= 0 ? 'expired' : remainingMs <= 10_000 ? 'ten-seconds' : remainingMs <= 30_000 ? 'thirty-seconds' : ''
  const timerWarning = warningLevel === 'expired'
    ? isSubmitting ? 'Time is up. Submitting your answers now.' : 'Time is up. If submission failed, retry below; your answers are still here.'
    : warningLevel === 'ten-seconds'
    ? '10 seconds remaining. Your answers will submit automatically when time runs out.'
    : warningLevel === 'thirty-seconds'
      ? '30 seconds remaining. Finish your current answer; the exam submits automatically at zero.'
      : ''

  return (
    <div className="page workspace-page exam-page">
      <div className="page-kicker"><span className="kicker-dot" /> PREPARE WITH PURPOSE</div>
      <div className="page-title-row exam-title-row">
        <div><h1>Exam preparation.</h1><p className="page-subtitle">Build a timed mock from your syllabus, then turn weak areas into a clear revision plan.</p></div>
        <span className="tool-count"><Icon name="clock" size={15} /> Up to 15 MCQs</span>
      </div>

      {!activeExam && <>
        <div className="exam-intro-strip"><span className="exam-intro-icon"><Icon name="spark" size={18} /></span><span><strong>One AI generation. A focused practice exam.</strong><small>Choose up to 15 questions, balanced across your topics. Generate another mock whenever you want; each generation uses one daily AI request.</small></span></div>

        <form className="input-card exam-setup-card" onSubmit={startExam}>
          <div className="exam-form-heading"><span className="exam-form-icon"><Icon name="quiz" size={21} /></span><div><span className="result-overline">SET UP YOUR MOCK EXAM</span><h2>What are you preparing for?</h2><p>Choose your exam details and list the syllabus topics to include.</p></div></div>

          <div className="exam-form-grid">
            <label><span className="field-label">Exam name</span><input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Biology midterm" maxLength={100} required /></label>
            <label><span className="field-label">Exam date</span><input className="text-input" type="date" value={examDate} min={localDateKey(new Date())} onChange={(event) => setExamDate(event.target.value)} required /></label>
          </div>

          <label className="field-label" htmlFor="exam-topics">Syllabus topics <span>one topic per line, up to 15</span></label>
          <textarea id="exam-topics" className="exam-topics-input" value={topicsText} onChange={(event) => setTopicsText(event.target.value)} placeholder={'Cell structure\nPhotosynthesis\nCellular respiration'} maxLength={2600} required />
          <div className="exam-topic-count">{activeTopics.length} {activeTopics.length === 1 ? 'topic' : 'topics'} added</div>

          <label className="field-label exam-notes-label">Optional syllabus notes <span>use your class material for more focused questions</span></label>
          <DocumentImport onImport={(text) => { setNotes(text); setError('') }} disabled={isLoading} />
          <textarea className="exam-notes-input" value={notes} onChange={(event) => { setNotes(event.target.value); setError('') }} placeholder="Paste key definitions, learning objectives, or syllabus details..." maxLength={12000} />

          <div className="exam-form-grid exam-settings-grid">
            <label><span className="field-label">Question format</span><select className="text-input" value="mcq" disabled aria-label="Question format: single-answer multiple choice"><option value="mcq">Single-answer MCQ</option></select><small>Four options, one correct answer</small></label>
            <label><span className="field-label">Questions</span><select className="text-input" value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}>{questionCounts.map((count) => <option key={count} value={count} disabled={count < activeTopics.length}>{count} questions</option>)}</select><small>One AI request generates the whole exam</small></label>
            <label><span className="field-label">Time limit</span><select id="exam-time-limit" aria-label="Time limit" className="text-input" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>{durations.map((duration) => <option key={duration} value={duration}>{duration} {duration === 1 ? 'minute' : 'minutes'}</option>)}</select><small>Timer begins when generation finishes</small></label>
            <label><span className="field-label">Difficulty</span><select id="exam-difficulty" aria-label="Difficulty" className="text-input" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>{difficulties.map((level) => <option key={level} value={level}>{difficultyLabels[level]}</option>)}</select><small>Choose the level for this mock exam</small></label>
          </div>

          {error && <div className="form-error" role="alert"><Icon name="close" size={15} /> {error}</div>}
          <button className="button button-primary exam-generate-button" type="submit" disabled={isLoading || loadStatus === 'loading'}><Icon name="spark" size={16} /> Generate timed mock exam <Icon name="arrow" size={15} /></button>
          <p className="ai-accuracy-notice exam-form-footnote" role="note">AI-generated questions, answers, and explanations may occasionally contain errors. Verify important information with reliable educational sources.</p>
        </form>

        <section className="exam-history-section" aria-labelledby="exam-history-heading">
          <div className="section-heading"><div><h2 id="exam-history-heading">Previous mock exams</h2><p>Review your scores and see which topics need attention.</p></div></div>
          {loadStatus === 'loading' ? <div className="empty-card" role="status"><span className="button-spinner" /> Loading exam history…</div>
            : loadStatus === 'error' ? <div className="form-error" role="alert">{error}<button className="quiet-button" type="button" onClick={() => window.location.reload()}>Reload</button></div>
              : attempts.filter((attempt) => attempt.status === 'submitted').length ? <div className="exam-history-list">{attempts.filter((attempt) => attempt.status === 'submitted').slice(0, 8).map((attempt) => <button className="exam-history-row" type="button" key={attempt.id || attempt.createdAt} onClick={() => openAttempt(attempt)}><span className="exam-history-mark"><Icon name="quiz" size={17} /></span><span className="exam-history-copy"><strong>{attempt.title}</strong><small>{new Date(attempt.submittedAt || attempt.createdAt).toLocaleDateString()} · {attempt.questionCount || attempt.questions.length} questions · {attempt.durationMinutes} min · {difficultyLabels[attempt.difficulty] || 'Standard'}</small></span><strong className="exam-history-score">{attempt.result?.percentage ?? 0}%</strong><Icon name="chevron" size={16} /></button>)}</div>
                : <div className="empty-card exam-history-empty"><span className="empty-icon"><Icon name="clock" size={19} /></span><strong>Your mock exam results will appear here</strong><span>Finish an exam to see your score and topic analysis.</span></div>}
        </section>
      </>}

      {activeExam && activeExam.status === 'in_progress' && <section className="exam-session-card input-card" aria-labelledby="exam-session-title">
        <div className="exam-session-header"><div><span className="result-overline">TIMED MOCK EXAM · {activeExam.format === 'mcq' ? 'MCQ' : activeExam.format}</span><h2 id="exam-session-title">{activeExam.title}</h2><p>{activeExam.questions.length} questions <span>·</span> {activeExam.durationMinutes} min <span>·</span> {difficultyLabels[activeExam.difficulty] || 'Standard'} difficulty <span>·</span> {activeExam.topics.join(' · ')}</p></div></div>
        <div className={`exam-sticky-timer${timeLow ? ' is-low' : ''}${warningLevel === 'ten-seconds' || warningLevel === 'expired' ? ' is-urgent' : ''}`}>
          <div className="exam-sticky-clock" role="timer" aria-label={`${formatTime(remainingMs)} remaining`}><Icon name="clock" size={20} /><span><small>TIME REMAINING</small><strong>{formatTime(remainingMs)}</strong></span></div>
          {timerWarning && <div className="exam-timer-warning" role={warningLevel === 'ten-seconds' || (warningLevel === 'expired' && !isSubmitting) ? 'alert' : 'status'} aria-live={warningLevel === 'ten-seconds' || (warningLevel === 'expired' && !isSubmitting) ? 'assertive' : 'polite'}><Icon name={warningLevel === 'ten-seconds' || warningLevel === 'expired' ? 'close' : 'clock'} size={16} /><span>{timerWarning}</span></div>}
          {isSubmitting && <span className="exam-timer-submitting" role="status"><span className="button-spinner" /> Submitting your answers…</span>}
        </div>
        <div className="exam-session-progress"><span>{answeredCount} of {activeExam.questions.length} answered</span><div role="progressbar" aria-label="Exam questions answered" aria-valuemin="0" aria-valuemax={activeExam.questions.length} aria-valuenow={answeredCount}><i style={{ width: `${answeredCount / activeExam.questions.length * 100}%` }} /></div><span>{activeExam.questions.length} total</span></div>
        <div className="exam-question-list">{activeExam.questions.map((question, index) => <article className="exam-question" key={`${question.topic}-${index}`}><div className="exam-question-heading"><span>QUESTION {String(index + 1).padStart(2, '0')}</span><span>{question.topic}</span></div><h3>{question.question}</h3><div className="exam-options">{question.options.map((option, optionIndex) => <button className={`exam-option${answers[index] === optionIndex ? ' selected' : ''}`} type="button" key={`${index}-${optionIndex}`} onClick={() => setAnswer(index, optionIndex)} aria-pressed={answers[index] === optionIndex}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div></article>)}</div>
        {error && <div className="form-error" role="alert">{error}<button className="quiet-button" type="button" onClick={() => finishExam(false)}>Retry submission</button></div>}
        <div className="exam-submit-row"><span>Unanswered questions count as incorrect.</span><button className="button button-primary" type="button" disabled={isSubmitting} onClick={() => { if (window.confirm('Submit your mock exam now? You will not be able to change your answers.')) finishExam(false) }}>{isSubmitting ? <><span className="button-spinner" /> Submitting…</> : <>Submit exam <Icon name="arrow" size={15} /></>}</button></div>
      </section>}

      {activeExam && activeExam.status === 'submitted' && result && <section className="exam-results" aria-labelledby="exam-results-title">
        <div className="exam-results-heading"><div><span className="result-overline">MOCK EXAM RESULTS</span><h2 id="exam-results-title">{activeExam.title}</h2><p>{new Date(activeExam.examDate + 'T12:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} · {result.total} questions · {activeExam.durationMinutes} min limit · {difficultyLabels[activeExam.difficulty] || 'Standard'} difficulty · {Math.floor((result.timeUsedSeconds || 0) / 60)} min {String((result.timeUsedSeconds || 0) % 60).padStart(2, '0')} used</p></div><button className="button button-secondary" type="button" onClick={returnToSetup}><Icon name="plus" size={15} /> New mock exam</button></div>
        <div className="exam-score-panel"><span className="exam-score-icon"><Icon name={result.percentage >= 80 ? 'spark' : 'quiz'} size={21} /></span><div><span className="result-overline">YOUR SCORE</span><strong>{result.score}<small> / {result.total}</small></strong><p>{result.percentage >= 80 ? 'Strong work. Keep your knowledge fresh with a quick review.' : result.percentage >= 50 ? 'Good progress. A little focused review can lift your score.' : 'This is a useful starting point. Focus on the topics below one step at a time.'}</p></div><span className="exam-score-percent">{result.percentage}%</span></div>

        <div className="exam-analysis-grid"><section className="exam-analysis-card"><div className="section-heading"><div><h3>Topic breakdown</h3><p>Your accuracy in each syllabus area.</p></div></div><div className="exam-topic-results">{result.topics.map((topic) => <div className="exam-topic-result" key={topic.topic}><div><strong>{topic.topic}</strong><span>{topic.correct} / {topic.total} correct</span></div><div className="exam-topic-bar" role="progressbar" aria-label={`${topic.topic} accuracy`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={topic.accuracy}><i className={topic.accuracy < 70 ? 'is-weak' : ''} style={{ width: `${topic.accuracy}%` }} /></div><strong className={topic.accuracy < 70 ? 'is-weak-text' : ''}>{topic.accuracy}%</strong></div>)}</div></section>
          <section className="exam-analysis-card exam-revision-card"><div className="section-heading"><div><h3>Revision plan</h3><p>Prioritized from topics below 70% accuracy.</p></div></div>{result.revisionPlan.length ? <ol className="exam-revision-list">{result.revisionPlan.map((item) => <li key={item.topic}><span className="exam-revision-priority">{item.priority}</span><span><strong>{item.topic} <small>{item.minutes} min</small></strong><span>{item.task}</span></span></li>)}</ol> : <div className="exam-all-strong"><Icon name="check" size={17} /><span><strong>Great coverage across your topics.</strong><small>No topic fell below 70% in this attempt.</small></span></div>}<button className="quiet-button exam-open-planner" type="button" onClick={() => onNavigate('planner')}>Open study planner <Icon name="arrow" size={14} /></button></section></div>

        {result.weakTopics?.length > 0 && <div className="exam-weak-topic-callout"><Icon name="lightbulb" size={17} /><span><strong>Start with {result.weakTopics.slice(0, 2).join(' and ')}.</strong><small>These topics had the lowest accuracy. Add them to your planner or create a focused quiz.</small></span><button className="quiet-button" type="button" onClick={() => onPracticeTopic(result.weakTopics[0])}>Quiz this topic <Icon name="arrow" size={14} /></button></div>}

        <details className="exam-answer-review" open>
          <summary>Answer review <span>{result.questions.length} questions · correct answers and explanations</span></summary>
          <div className="exam-review-legend" aria-label="Answer color key">
            <span><i className="legend-correct" /> Correct answer</span>
            <span><i className="legend-incorrect" /> Your incorrect choice</span>
          </div>
          <p className="ai-accuracy-notice exam-results-accuracy" role="note">AI-generated content can occasionally be inaccurate. Confirm important answers with your class material or another reliable educational source.</p>
          <div className="exam-review-list">
            {result.questions.map((question, index) => {
              const isCorrect = question.isCorrect ?? question.selected === question.answer
              const unanswered = question.selected === null || question.selected === undefined
              return (
                <article className={`exam-review-question ${isCorrect ? 'correct' : 'incorrect'}`} key={`${question.topic}-${index}`}>
                  <div className="exam-review-question-topline">
                    <span>QUESTION {String(index + 1).padStart(2, '0')} <span className="exam-review-topic">{question.topic}</span></span>
                    <span className={`exam-review-status ${isCorrect ? 'status-correct' : unanswered ? 'status-unanswered' : 'status-incorrect'}`}>
                      <Icon name={isCorrect ? 'check' : unanswered ? 'clock' : 'close'} size={14} />
                      {isCorrect ? 'Correct' : unanswered ? 'Not answered' : 'Incorrect'}
                    </span>
                  </div>
                  <h3>{question.question}</h3>
                  {!isCorrect && <p className="exam-review-your-answer"><strong>Your answer:</strong> {unanswered ? 'No option selected' : question.options[question.selected]}</p>}
                  <div className="exam-review-options" aria-label={`Answer choices for question ${index + 1}`}>
                    {question.options.map((option, optionIndex) => {
                      const correctOption = optionIndex === question.answer
                      const selectedOption = optionIndex === question.selected
                      const optionState = correctOption ? 'option-correct' : selectedOption ? 'option-incorrect' : ''
                      return (
                        <div className={`exam-review-option ${optionState}`} key={`${index}-${optionIndex}`}>
                          <span className="exam-review-option-letter">{String.fromCharCode(65 + optionIndex)}</span>
                          <span className="exam-review-option-text">{option}</span>
                          {correctOption && <span className="exam-review-option-label"><Icon name="check" size={14} /> Correct answer</span>}
                          {!correctOption && selectedOption && <span className="exam-review-option-label"><Icon name="close" size={14} /> Your choice</span>}
                        </div>
                      )
                    })}
                  </div>
                  <div className="answer-explanation"><Icon name="lightbulb" size={16} /><p><strong>Why:</strong> {question.explanation}</p></div>
                </article>
              )
            })}
          </div>
        </details>
      </section>}
    </div>
  )
}

export default ExamPreparationPage
