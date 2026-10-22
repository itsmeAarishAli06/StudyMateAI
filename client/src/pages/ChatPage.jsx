import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { promptSuggestions } from '../data/mockData.js'
import { sendChatMessage } from '../lib/api.js'

function ChatPage({ messages, onMessagesChange, onNavigate, aiMode, accessToken }) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function sendQuestion(question = input) {
    const text = question.trim()
    if (!text || isLoading) return

    setError('')
    setInput('')
    setIsLoading(true)
    onMessagesChange((current) => [...current, { id: crypto.randomUUID(), role: 'user', text }])

    try {
      const answer = await sendChatMessage(text, messages, accessToken)
      onMessagesChange((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: answer }])
    } catch (requestError) {
      setError(requestError.message || 'Your tutor could not answer just now. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  function resetChat() {
    onMessagesChange([])
    setError('')
  }

  return (
    <div className="page workspace-page chat-page">
      <div className="page-kicker"><span className="kicker-dot" /> YOUR AI TUTOR</div>
      <div className="page-title-row">
        <div><h1>Ask anything.</h1><p className="page-subtitle">A patient study partner for the questions on your mind.</p></div>
        <button className="button button-secondary" type="button" onClick={resetChat}><Icon name="plus" size={16} /> New chat</button>
      </div>

      <div className="chat-layout">
        <section className="chat-panel" aria-label="Chat with your AI tutor">
          <div className="chat-topline"><span className="tutor-avatar"><Icon name="spark" size={17} /></span><span><strong>StudyMate tutor</strong><small><span className="online-dot" /> Ready to help</small></span><span className="demo-pill">{aiMode === 'gemini' ? 'GEMINI' : 'DEMO'}</span></div>
          <div className="chat-messages" aria-live="polite">
            {!messages.length && !isLoading && (
              <div className="chat-empty">
                <div className="chat-welcome-icon"><Icon name="spark" size={24} /></div>
                <h2>Hey, what are you working on?</h2>
                <p>Ask a question, or choose a prompt to get started.</p>
                <div className="prompt-list">
                  {promptSuggestions.map((prompt) => <button key={prompt} type="button" onClick={() => sendQuestion(prompt)}>{prompt}<Icon name="arrow" size={14} /></button>)}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <article className={`message message-${message.role}`} key={message.id}>
                {message.role === 'assistant' && <span className="message-avatar"><Icon name="spark" size={14} /></span>}
                <div className="message-body">
                  <span className="message-author">{message.role === 'assistant' ? 'StudyMate' : 'You'}</span>
                  <p>{message.text}</p>
                </div>
              </article>
            ))}
            {isLoading && <div className="message message-assistant"><span className="message-avatar"><Icon name="spark" size={14} /></span><div className="message-body"><span className="message-author">StudyMate is thinking</span><div className="typing-indicator"><i /><i /><i /></div></div></div>}
            {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => sendQuestion(messages.at(-1)?.text || '')}>Try again</button></div>}
          </div>
          <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); sendQuestion() }}>
            <label className="sr-only" htmlFor="chat-input">Your question</label>
            <textarea id="chat-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendQuestion() } }} placeholder="Ask a question or paste a tricky concept..." rows="2" maxLength={1200} />
            <div className="composer-bottom"><span>StudyMate can make mistakes. Check important facts.</span><button className="send-button" type="submit" aria-label="Send question" disabled={!input.trim() || isLoading}><Icon name="send" size={17} /></button></div>
          </form>
        </section>

        <aside className="chat-aside">
          <div className="aside-card tutor-tip-card"><span className="aside-card-icon"><Icon name="bolt" size={17} /></span><span className="aside-label">A GOOD WAY TO ASK</span><h3>Give a little context.</h3><p>Tell your tutor what class you're in or which part is confusing. The more it knows, the more useful it can be.</p></div>
          <div className="aside-card mini-prompt-card"><span className="aside-label">NEED A STARTER?</span><button type="button" onClick={() => onNavigate('summary')}><Icon name="notes" size={16} /> Turn my notes into a study guide <Icon name="chevron" size={15} /></button><button type="button" onClick={() => onNavigate('quiz')}><Icon name="quiz" size={16} /> Quiz me on a topic <Icon name="chevron" size={15} /></button></div>
          <div className="privacy-note"><Icon name="book" size={15} /><span>Chat stays in this browser session and is sent to the configured AI provider for a response.</span></div>
        </aside>
      </div>
    </div>
  )
}

export default ChatPage
