import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'

const filters = [
  { id: 'all', label: 'All items' },
  { id: 'summary', label: 'Summaries' },
  { id: 'quiz', label: 'Quizzes' },
]

function HistoryPage({ items, onOpenItem, onNavigate }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const shownItems = useMemo(() => items.filter((item) => {
    const matchesType = filter === 'all' || item.type === filter
    const matchesText = `${item.title} ${item.preview || ''}`.toLowerCase().includes(query.toLowerCase())
    return matchesType && matchesText
  }), [filter, items, query])

  return (
    <div className="page workspace-page history-page">
      <div className="page-kicker"><span className="kicker-dot" /> YOUR LEARNING, IN ONE PLACE</div>
      <div className="page-title-row">
        <div><h1>Study history.</h1><p className="page-subtitle">A little collection of everything you've been learning.</p></div>
        <span className="tool-count"><Icon name="book" size={15} /> {items.length} saved {items.length === 1 ? 'item' : 'items'}</span>
      </div>

      <div className="history-overview"><div className="history-stat"><span className="stat-icon summary-stat-icon"><Icon name="notes" size={17} /></span><span><strong>{items.filter((item) => item.type === 'summary').length}</strong><small>Summaries</small></span></div><span className="stat-divider" /><div className="history-stat"><span className="stat-icon quiz-stat-icon"><Icon name="quiz" size={17} /></span><span><strong>{items.filter((item) => item.type === 'quiz').length}</strong><small>Practice sets</small></span></div><div className="history-overview-note"><Icon name="spark" size={15} /> Keep your best ideas close.</div></div>

      <div className="history-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="Filter study history">
          {filters.map((item) => <button className={filter === item.id ? 'selected' : ''} type="button" role="tab" aria-selected={filter === item.id} key={item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{item.id === 'all' ? items.length : items.filter((saved) => saved.type === item.id).length}</span></button>)}
        </div>
        <label className="history-search"><Icon name="search" size={16} /><span className="sr-only">Search saved items</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your history" /></label>
      </div>

      {shownItems.length ? (
        <section className="history-grid" aria-label="Saved study items">
          {shownItems.map((item) => (
            <article className="history-card" key={item.id}>
              <div className="history-card-head"><span className={`history-type-icon ${item.type}`}><Icon name={item.type === 'quiz' ? 'quiz' : 'notes'} size={17} /></span><span className="history-type-label">{item.type === 'quiz' ? 'PRACTICE QUIZ' : 'STUDY SUMMARY'}</span><span className="history-card-menu"><Icon name="clock" size={14} /> {item.dateLabel}</span></div>
              <h2>{item.title}</h2>
              <p>{item.preview || (item.type === 'quiz' ? `${item.questions.length} questions to help you check your understanding.` : item.content?.lead)}</p>
              <div className="history-card-footer"><span className="history-meta">{item.type === 'quiz' ? <><Icon name="quiz" size={14} /> {item.questions?.length || 0} questions {item.score && <em>· Last score {item.score}</em>}</> : <><Icon name="notes" size={14} /> Summary <em>· 2 min read</em></>}</span><button className="open-item-button" type="button" onClick={() => onOpenItem(item)}>{item.type === 'quiz' ? 'Open quiz' : 'Read summary'} <Icon name="arrow" size={14} /></button></div>
            </article>
          ))}
        </section>
      ) : (
        <div className="history-empty"><span className="history-empty-icon"><Icon name={query ? 'search' : 'book'} size={22} /></span><h2>{query ? 'No matches just yet.' : items.length ? 'Nothing in this view yet.' : 'Your story starts with one saved idea.'}</h2><p>{query ? `We couldn't find anything for “${query}”. Try another search.` : items.length ? 'Try another filter to see more of your study history.' : 'Save a summary or quiz and it will be easy to find again.'}</p>{query ? <button className="button button-secondary" type="button" onClick={() => setQuery('')}>Clear search</button> : !items.length && <button className="button button-primary" type="button" onClick={() => onNavigate('summary')}><Icon name="spark" size={15} /> Make your first summary</button>}</div>
      )}
    </div>
  )
}

export default HistoryPage
