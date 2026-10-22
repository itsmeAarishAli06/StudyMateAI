import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { sampleNotes } from '../data/mockData.js'
import { createSummary } from '../lib/api.js'

function SummaryPage({ selectedSummary, onSave, onToast, onReset, accessToken }) {
  const [notes, setNotes] = useState(selectedSummary?.sourceText || '')
  const [title, setTitle] = useState(selectedSummary?.title || '')
  const [result, setResult] = useState(selectedSummary?.content || null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [isSaved, setIsSaved] = useState(Boolean(selectedSummary?.id))
  const noteCount = notes.length

  useEffect(() => {
    setNotes(selectedSummary?.sourceText || '')
    setTitle(selectedSummary?.title || '')
    setResult(selectedSummary?.content || null)
    setIsSaved(Boolean(selectedSummary?.id))
    setError('')
  }, [selectedSummary?.id])

  const formattedSummary = useMemo(() => result ? [result.lead, ...result.points, `Key takeaway: ${result.takeaway}`].join('\n\n') : '', [result])

  async function generateSummary(event) {
    event.preventDefault()
    if (!notes.trim()) {
      setError('Paste your notes first, or try the sample notes to see how it works.')
      return
    }

    setError('')
    setIsLoading(true)
    try {
      const response = await createSummary(notes.trim(), title.trim() || undefined, accessToken)
      const summary = response.content
      const summaryTitle = response.title
      setNotes(response.sourceText)
      setResult(summary)
      setTitle(summaryTitle)
      setIsSaved(false)
    } catch (requestError) {
      setError(requestError.message || 'We could not make your summary just now. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(formattedSummary)
      onToast('Summary copied to clipboard')
    } catch {
      setError('Clipboard access is unavailable in this browser. You can select and copy the summary text.')
    }
  }

  async function saveSummary() {
    if (!result) return
    setIsSaving(true)
    try {
      await onSave({ title: title.trim() || 'Untitled study summary', sourceText: notes, content: result })
      setIsSaved(true)
    } catch (saveError) {
      setError(saveError.message || 'Could not save this summary. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  function resetSummary() {
    setNotes('')
    setTitle('')
    setResult(null)
    setError('')
    setIsSaved(false)
    onReset()
  }

  return (
    <div className="page workspace-page summary-page">
      <div className="page-kicker"><span className="kicker-dot" /> NOTES TO KNOWLEDGE</div>
      <div className="page-title-row">
        <div><h1>Make your notes make sense.</h1><p className="page-subtitle">Pull out the key ideas and keep the details that matter.</p></div>
        <span className="tool-count"><Icon name="notes" size={15} /> Study tool 02</span>
      </div>

      <div className="summary-layout">
        <form className="input-card summary-input-card" onSubmit={generateSummary}>
          <div className="card-heading"><div><span className="card-step">01</span><div><h2>Your study material</h2><p>Paste the notes you'd like to simplify.</p></div></div><span className="private-label"><Icon name="book" size={13} /> PRIVATE</span></div>
          <label className="field-label" htmlFor="summary-title">Give it a name <span>Optional</span></label>
          <input id="summary-title" className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Cellular respiration" maxLength={80} />
          <div className="textarea-label-row"><label className="field-label" htmlFor="notes-input">Your notes</label><button className="quiet-button" type="button" onClick={() => { setNotes(sampleNotes); setError('') }}>Use sample notes</button></div>
          <textarea id="notes-input" className="notes-textarea" value={notes} onChange={(event) => { setNotes(event.target.value); setError('') }} placeholder="Paste your lecture notes, textbook excerpts, or study material here..." maxLength={12000} />
          <div className="input-meta"><span><Icon name="clock" size={13} /> About 2 min to read</span><span>{noteCount.toLocaleString()} / 12,000</span></div>
          {error && <div className="form-error" role="alert"><Icon name="close" size={15} /> {error}</div>}
          <button className="button button-primary full-button" type="submit" disabled={isLoading}>
            {isLoading ? <><span className="button-spinner" /> Finding the key ideas...</> : <><Icon name="spark" size={16} /> Create my summary <Icon name="arrow" size={15} /></>}
          </button>
          <p className="form-footnote">Your notes are sent securely to the StudyMate API to create this summary.</p>
        </form>

        <section className={`summary-result-card ${result ? 'has-result' : ''}`} aria-live="polite" aria-label="Summary result">
          <div className="result-topline"><span className="result-badge"><Icon name="spark" size={14} /> YOUR SUMMARY</span>{result && <button className="icon-button" type="button" title="Start a new summary" aria-label="Start a new summary" onClick={resetSummary}><Icon name="refresh" size={16} /></button>}</div>
          {isLoading ? (
            <div className="summary-loading"><div className="loading-orbit"><Icon name="spark" size={20} /></div><strong>Finding the big picture...</strong><span>Connecting the ideas in your notes.</span><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-line short" /></div>
          ) : result ? (
            <div className="summary-result">
              <span className="result-overline">QUICK STUDY GUIDE</span>
              <h2>{title || 'Your study summary'}</h2>
              <p className="summary-lead">{result.lead}</p>
              <div className="key-points-heading"><span className="point-line" /> KEY IDEAS</div>
              <ul className="key-points">{result.points.map((point, index) => <li key={`${point}-${index}`}><span className="point-number">0{index + 1}</span><span>{point}</span></li>)}</ul>
              <div className="takeaway-card"><span><Icon name="bolt" size={15} /> REMEMBER THIS</span><p>{result.takeaway}</p></div>
              <div className="result-actions"><button className="button button-secondary" type="button" onClick={copySummary}><Icon name="copy" size={15} /> Copy</button><button className="button button-primary" type="button" onClick={saveSummary} disabled={isSaved || isSaving}><Icon name={isSaved ? 'check' : 'save'} size={15} /> {isSaving ? 'Saving…' : isSaved ? 'Saved to history' : 'Save summary'}</button></div>
            </div>
          ) : (
            <div className="summary-empty"><div className="empty-illustration"><span className="paper paper-back" /><span className="paper paper-front"><i /><i /><i /></span><span className="paper-spark"><Icon name="spark" size={16} /></span></div><h2>Your clear version starts here.</h2><p>Paste your notes and we'll pull out the main idea, key points, and one takeaway to remember.</p><div className="empty-tip"><Icon name="lightbulb" size={15} /><span>Tip: include your class notes as-is. You can keep the headings and bullet points.</span></div></div>
          )}
        </section>
      </div>
    </div>
  )
}

export default SummaryPage
