import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { sampleNotes } from '../data/mockData.js'
import { createQuiz } from '../lib/api.js'

function QuizPage({ selectedQuiz, onSave, onReset, onToast, accessToken }) {
  const [topic, setTopic] = useState(selectedQuiz?.title || '')
  const [sourceMode, setSourceMode] = useState('topic')
  const [studyNotes, setStudyNotes] = useState('')
  const [questionCount, setQuestionCount] = useState(selectedQuiz?.questions?.length || 5)
  const [quiz, setQuiz] = useState(selectedQuiz?.questions ? selectedQuiz : null)
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [isSaved, setIsSaved] = useState(Boolean(selectedQuiz?.id))

  useEffect(() => {
    if (selectedQuiz?.questions) {
      setTopic(selectedQuiz.title)
      setQuestionCount(selectedQuiz.questions.length)
      setQuiz(selectedQuiz)
      setAnswers({})
      setSubmitted(false)
      setIsSaved(Boolean(selectedQuiz.id))
      setError('')
    }
  }, [selectedQuiz?.id])

  const score = useMemo(() => quiz ? quiz.questions.reduce((total, item, index) => total + (answers[index] === item.answer ? 1 : 0), 0) : 0, [answers, quiz])

  async function generateQuiz(event) {
    event.preventDefault()
    const source = sourceMode === 'topic' ? topic.trim() : studyNotes.trim()
    if (!source) {
      setError(sourceMode === 'topic' ? 'Add a topic to build your practice quiz.' : 'Paste study material or use the sample notes to build your practice quiz.')
      return
    }

    setError('')
    setIsLoading(true)
    setQuiz(null)
    setAnswers({})
    setSubmitted(false)
    try {
      const generated = await createQuiz({
        ...(sourceMode === 'topic' ? { topic: source } : { notes: source }),
        sourceType: sourceMode,
        questionCount,
      }, accessToken)
      setQuiz(generated)
      setIsSaved(false)
    } catch (requestError) {
      setError(requestError.message || 'Your quiz could not be created just now. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  function submitAnswers() {
    if (!quiz) return
    if (Object.keys(answers).length < quiz.questions.length) {
      setError('Choose an answer for every question before checking your results.')
      return
    }
    setError('')
    setSubmitted(true)
    onToast('Quiz complete. Take a moment to review the explanations.')
  }

  function startOver() {
    setQuiz(null)
    setAnswers({})
    setSubmitted(false)
    setError('')
    setIsSaved(false)
    onReset()
  }

  async function saveQuiz() {
    if (!quiz) return
    setIsSaving(true)
    try {
      await onSave({ title: quiz.title, questions: quiz.questions, score: `${score} / ${quiz.questions.length}` })
      setIsSaved(true)
    } catch (saveError) {
      setError(saveError.message || 'Could not save this quiz. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="page workspace-page quiz-page">
      <div className="page-kicker"><span className="kicker-dot" /> PRACTICE MAKES PROGRESS</div>
      <div className="page-title-row">
        <div><h1>Make it stick.</h1><p className="page-subtitle">A quick check-in helps turn what you studied into what you know.</p></div>
        <span className="tool-count"><Icon name="quiz" size={15} /> Study tool 03</span>
      </div>

      <div className="quiz-layout">
        <section className="quiz-main">
          {!quiz && !isLoading && (
            <form className="input-card quiz-setup" onSubmit={generateQuiz}>
              <div className="quiz-setup-art"><div className="quiz-art-circle"><Icon name="quiz" size={24} /></div><span className="quiz-art-star star-a">+</span><span className="quiz-art-star star-b">+</span></div>
              <div className="quiz-setup-copy"><span className="result-overline">YOUR NEXT STUDY SESSION</span><h2>What are we practicing?</h2><p>Pick a topic and we'll put together a short set of questions with explanations.</p></div>
              <div className="quiz-source-label"><span className="field-label">Make a quiz from</span><div className="source-mode-tabs" role="tablist" aria-label="Quiz source type"><button className={sourceMode === 'topic' ? 'selected' : ''} role="tab" aria-selected={sourceMode === 'topic'} type="button" onClick={() => { setSourceMode('topic'); setError('') }}>A topic</button><button className={sourceMode === 'notes' ? 'selected' : ''} role="tab" aria-selected={sourceMode === 'notes'} type="button" onClick={() => { setSourceMode('notes'); setError('') }}>Study material</button></div></div>
              {sourceMode === 'topic' ? <><label className="field-label" htmlFor="quiz-topic">Topic or subject</label><div className="quiz-topic-wrap"><Icon name="search" size={17} /><input id="quiz-topic" value={topic} onChange={(event) => { setTopic(event.target.value); setError('') }} placeholder="e.g. Cellular respiration" maxLength={100} /></div></> : <><label className="field-label" htmlFor="quiz-notes">Paste study material</label><textarea id="quiz-notes" className="quiz-notes-input" value={studyNotes} onChange={(event) => { setStudyNotes(event.target.value); setError('') }} placeholder="Paste a few paragraphs from your notes..." maxLength={12000} /><button className="quiet-button quiz-notes-sample" type="button" onClick={() => { setStudyNotes(sampleNotes); setError('') }}>Use sample notes</button></>}
              <div className="quiz-controls">
                <label><span className="field-label">Question count</span><select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}><option value={3}>3 questions</option><option value={5}>5 questions</option></select></label>
                <div className="difficulty-control"><span className="field-label">Pace</span><div><span className="difficulty-active">Steady</span><span>One step at a time</span></div></div>
              </div>
              {error && <div className="form-error" role="alert"><Icon name="close" size={15} /> {error}</div>}
              <button className="button button-primary full-button" type="submit"><Icon name="spark" size={16} /> Build my quiz <Icon name="arrow" size={15} /></button>
              {sourceMode === 'topic' && <div className="quiz-sample-row"><span>Try a sample topic</span><button type="button" onClick={() => { setTopic('Cellular respiration'); setError('') }}>Cellular respiration <Icon name="arrow" size={13} /></button><button type="button" onClick={() => { setTopic('Photosynthesis'); setError('') }}>Photosynthesis <Icon name="arrow" size={13} /></button></div>}
            </form>
          )}

          {isLoading && <div className="quiz-loading input-card"><div className="loading-orbit"><Icon name="spark" size={20} /></div><h2>Putting your practice set together...</h2><p>Finding the ideas that are worth remembering.</p><div className="quiz-skeleton"><i /><i /><i /></div></div>}

          {quiz && (
            <div className="quiz-session">
              <div className="quiz-session-head"><div><span className="result-overline">YOUR PRACTICE SET</span><h2>{quiz.title}</h2><p>{quiz.questions.length} questions <span className="head-separator">/</span> about 3 minutes</p></div><button className="button button-secondary" type="button" onClick={startOver}><Icon name="refresh" size={15} /> New quiz</button></div>
              {submitted && <div className={`score-banner ${score === quiz.questions.length ? 'perfect-score' : ''}`}><span className="score-icon"><Icon name={score === quiz.questions.length ? 'spark' : 'check'} size={20} /></span><div><strong>{score === quiz.questions.length ? 'Perfect score. You have this down.' : `You got ${score} out of ${quiz.questions.length}.`}</strong><span>{score === quiz.questions.length ? 'Keep your momentum going.' : 'Review the explanations, then try again when you are ready.'}</span></div><span className="score-fraction">{score}<small>/{quiz.questions.length}</small></span></div>}
              <div className="question-list">
                {quiz.questions.map((item, questionIndex) => {
                  const selected = answers[questionIndex]
                  const isCorrect = selected === item.answer
                  return (
                    <article className={`question-card ${submitted ? (isCorrect ? 'answer-correct' : 'answer-incorrect') : ''}`} key={`${item.question}-${questionIndex}`}>
                      <div className="question-heading"><span className="question-number">Q{String(questionIndex + 1).padStart(2, '0')}</span><h3>{item.question}</h3>{submitted && <span className={`answer-mark ${isCorrect ? 'correct-mark' : 'incorrect-mark'}`}><Icon name={isCorrect ? 'check' : 'close'} size={14} /></span>}</div>
                      <div className="answer-options">
                        {item.options.map((option, optionIndex) => {
                          const isSelected = selected === optionIndex
                          const isAnswer = item.answer === optionIndex
                          return (
                            <button className={`answer-option ${isSelected ? 'selected' : ''} ${submitted && isAnswer ? 'show-correct' : ''} ${submitted && isSelected && !isCorrect ? 'show-wrong' : ''}`} key={option} type="button" disabled={submitted} onClick={() => { setAnswers({ ...answers, [questionIndex]: optionIndex }); setError('') }}>
                              <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span>{submitted && isAnswer && <Icon name="check" size={15} className="option-check" />}
                            </button>
                          )
                        })}
                      </div>
                      {submitted && <div className="answer-explanation"><Icon name="lightbulb" size={15} /><p><strong>{isCorrect ? "That's right." : 'The correct answer is ' + String.fromCharCode(65 + item.answer) + '.'}</strong> {item.explanation}</p></div>}
                    </article>
                  )
                })}
              </div>
              {error && <div className="form-error" role="alert"><Icon name="close" size={15} /> {error}</div>}
              {!submitted ? <button className="button button-primary check-answers-button" type="button" onClick={submitAnswers}>Check my answers <Icon name="arrow" size={15} /></button> : <div className="quiz-completion-actions"><button className="button button-secondary" type="button" onClick={startOver}><Icon name="refresh" size={15} /> Try another quiz</button><button className="button button-primary" type="button" onClick={saveQuiz} disabled={isSaved || isSaving}><Icon name={isSaved ? 'check' : 'save'} size={15} /> {isSaving ? 'Saving…' : isSaved ? 'Saved to history' : 'Save this quiz'}</button></div>}
            </div>
          )}
        </section>

        <aside className="quiz-aside">
          <div className="quiz-progress-card"><div className="progress-card-top"><span className="aside-label">YOUR PRACTICE RHYTHM</span><span className="progress-streak"><Icon name="bolt" size={13} /> 1 day</span></div><div className="practice-days">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <div className={`practice-day ${index === 2 ? 'today' : ''}`} key={`${day}-${index}`}><span>{day}</span><i>{index < 2 ? <Icon name="check" size={12} /> : ''}</i></div>)}</div><p>Every bit of practice counts. You're building a good habit.</p></div>
          <div className="aside-card quiz-tip"><span className="aside-card-icon"><Icon name="spark" size={17} /></span><span className="aside-label">LEARNING TIP</span><h3>It's okay to get one wrong.</h3><p>Retrieving an answer from memory helps strengthen it. The explanation is part of the practice.</p></div>
        </aside>
      </div>
    </div>
  )
}

export default QuizPage
