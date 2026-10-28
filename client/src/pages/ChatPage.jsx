import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { promptSuggestions } from '../data/mockData.js'
import { sendChatMessage } from '../lib/api.js'

const learningModes = [
  { id: 'tutor', label: 'Tutor', description: 'Clear answers with a balanced explanation.' },
  { id: 'simple', label: 'Explain simply', description: 'Plain language, short steps, and a helpful example.' },
  { id: 'hint', label: 'Give me a hint', description: 'One clue at a time, without giving away the answer.' },
  { id: 'quiz', label: 'Quiz me', description: 'One question at a time, with feedback after you answer.' },
]

function ChatPage({ messages, onMessagesChange, onNavigate, aiMode, accessToken, learningMode = 'tutor', onLearningModeChange = () => {} }) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [voicePreview, setVoicePreview] = useState('')
  const recognitionRef = useRef(null)
  const voiceBaseRef = useRef('')

  useEffect(() => () => recognitionRef.current?.abort(), [])

  async function sendQuestion(question = input, options = {}) {
    const text = question.trim()
    if (!text || isLoading) return

    recognitionRef.current?.abort()
    recognitionRef.current = null
    setIsListening(false)
    setVoicePreview('')
    setError('')
    setInput('')
    setIsLoading(true)
    onMessagesChange((current) => [...current, { id: crypto.randomUUID(), role: 'user', text, displayText: options.displayText }])

    try {
      const answer = await sendChatMessage(text, options.history ?? messages, accessToken, options.mode ?? learningMode)
      onMessagesChange((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: answer }])
    } catch (requestError) {
      setError(requestError.message || 'Your tutor could not answer just now. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  function askForHelp(action, messageIndex) {
    const prompts = {
      simple: { displayText: 'Explain that more simply', prompt: 'Explain your previous answer in simpler words for a student. Use short sentences, keep the facts accurate, and avoid jargon.' },
      example: { displayText: 'Give me an example', prompt: 'Give one concrete, accurate example that helps me understand your previous answer. Briefly explain how the example connects to the idea.' },
    }
    const request = prompts[action]
    if (request) sendQuestion(request.prompt, { displayText: request.displayText, history: messages.slice(0, messageIndex + 1), mode: 'tutor' })
  }

  function resetChat() {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setIsListening(false)
    setVoicePreview('')
    onMessagesChange([])
    setError('')
  }

  function toggleVoiceInput() {
    setVoiceError('')
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceError('Voice input is not supported in this browser. Please type your question instead.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = navigator.language || 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    voiceBaseRef.current = input.trim()
    recognition.onresult = (event) => {
      const finalText = Array.from(event.results).filter((result) => result.isFinal).map((result) => result[0].transcript.trim()).filter(Boolean).join(' ')
      const interimText = Array.from(event.results).filter((result) => !result.isFinal).map((result) => result[0].transcript.trim()).filter(Boolean).join(' ')
      const combined = [voiceBaseRef.current, finalText].filter(Boolean).join(' ')
      setInput(combined.slice(0, 1200))
      setVoicePreview(interimText)
    }
    recognition.onerror = (event) => {
      setIsListening(false)
      setVoicePreview('')
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceError('Microphone access was denied. Allow microphone access in your browser settings, or type your question.')
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setVoiceError('Voice input stopped unexpectedly. Please try again or type your question.')
      }
    }
    recognition.onend = () => {
      setIsListening(false)
      setVoicePreview('')
      recognitionRef.current = null
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      setIsListening(true)
    } catch {
      recognitionRef.current = null
      setIsListening(false)
      setVoiceError('Could not start voice input. Check microphone permission and try again.')
    }
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
            {messages.map((message, messageIndex) => (
              <article className={`message message-${message.role}`} key={message.id}>
                {message.role === 'assistant' && <span className="message-avatar"><Icon name="spark" size={14} /></span>}
                <div className="message-body">
                  <span className="message-author">{message.role === 'assistant' ? 'StudyMate' : 'You'}</span>
                  <p>{message.displayText || message.text}</p>
                  {message.role === 'assistant' && <><small className="ai-accuracy-inline">AI-generated response. Verify important facts with your course materials.</small><div className="message-study-actions" aria-label="More ways to understand this answer"><button type="button" onClick={() => askForHelp('simple', messageIndex)} disabled={isLoading}><Icon name="spark" size={13} /> Explain simply</button><button type="button" onClick={() => askForHelp('example', messageIndex)} disabled={isLoading}><Icon name="lightbulb" size={13} /> Give an example</button></div></>}
                </div>
              </article>
            ))}
            {isLoading && <div className="message message-assistant"><span className="message-avatar"><Icon name="spark" size={14} /></span><div className="message-body"><span className="message-author">StudyMate is thinking</span><div className="typing-indicator"><i /><i /><i /></div></div></div>}
            {error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => sendQuestion(messages.at(-1)?.text || '')}>Try again</button></div>}
          </div>
          <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); sendQuestion() }}>
            <div className="learning-mode-picker">
              <span className="learning-mode-label" id="learning-mode-label">Learning mode</span>
              <div className="learning-mode-options" role="group" aria-labelledby="learning-mode-label">
                {learningModes.map((mode) => (
                  <button
                    className={`learning-mode-option${learningMode === mode.id ? ' is-selected' : ''}`}
                    key={mode.id}
                    type="button"
                    aria-pressed={learningMode === mode.id}
                    title={mode.description}
                    disabled={isLoading}
                    onClick={() => onLearningModeChange(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <span className="learning-mode-description" aria-live="polite">{learningModes.find((mode) => mode.id === learningMode)?.description || learningModes[0].description}</span>
            </div>
            <label className="sr-only" htmlFor="chat-input">Your question</label>
            <textarea id="chat-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendQuestion() } }} placeholder="Ask a question or paste a tricky concept..." rows="2" maxLength={1200} />
            {isListening && <div className="voice-listening-status" role="status"><span className="voice-pulse" /> Listening{voicePreview ? `: ${voicePreview}` : '…'}</div>}
            {voiceError && <div className="voice-input-error" role="alert">{voiceError}</div>}
            <div className="composer-bottom"><span>StudyMate can make mistakes. Check important facts.</span><div className="composer-controls"><button className={`voice-button ${isListening ? 'is-listening' : ''}`} type="button" onClick={toggleVoiceInput} aria-label={isListening ? 'Stop voice input' : 'Ask by voice'} title={isListening ? 'Stop voice input' : 'Ask by voice'} disabled={isLoading}><Icon name="mic" size={17} /></button><button className="send-button" type="submit" aria-label="Send question" disabled={!input.trim() || isLoading}><Icon name="send" size={17} /></button></div></div>
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
