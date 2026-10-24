import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQuiz, createStudyItem, createSummary, getAiDailyUsage, getStudyItems, sendChatMessage } from './api.js'

function jsonResponse(payload, ok = true, status = ok ? 200 : 400) {
  return { ok, status, json: async () => payload }
}

describe('StudyMate API client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('posts chat message and conversation history, then returns the answer', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ answer: 'ATP stores usable cell energy.' }))
    vi.stubGlobal('fetch', fetch)
    const answer = await sendChatMessage('What is ATP?', [{ id: 'message-1', role: 'user', text: 'Explain energy', displayText: 'Explain this simply' }])

    expect(answer).toBe('ATP stores usable cell energy.')
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/chat', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ message: 'What is ATP?', history: [{ role: 'user', text: 'Explain energy' }] }),
    }))
  })

  it('loads the signed-in account daily AI usage', async () => {
    const usage = { used: 7, remaining: 33, dailyLimit: 40, resetsAt: '2026-10-25T00:00:00Z' }
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ usage }))
    vi.stubGlobal('fetch', fetch)

    await expect(getAiDailyUsage('user-token')).resolves.toEqual(usage)
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/ai-usage', expect.objectContaining({
      method: 'GET',
      headers: { authorization: 'Bearer user-token' },
    }))
  })

  it('strips UI fields and bounds history to the server chat contract', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ answer: 'Done.' }))
    vi.stubGlobal('fetch', fetch)
    const history = Array.from({ length: 22 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 ? 'assistant' : 'user',
      text: index === 21 ? ` ${'x'.repeat(1201)} ` : `Message ${index}`,
      displayText: 'UI-only label',
    }))

    await sendChatMessage('Continue', history)
    const payload = JSON.parse(fetch.mock.calls[0][1].body)
    expect(payload.history).toHaveLength(20)
    expect(payload.history[0]).toEqual({ role: 'user', text: 'Message 2' })
    expect(payload.history.at(-1)).toEqual({ role: 'assistant', text: 'x'.repeat(1200) })
    expect(payload.history.every((item) => Object.keys(item).sort().join(',') === 'role,text')).toBe(true)
  })

  it('posts notes and title, then returns the structured summary', async () => {
    const payload = { title: 'Cell energy', sourceText: 'Cells use glucose.', content: { lead: 'Cells use glucose.', points: [], takeaway: 'Energy matters.' } }
    const fetch = vi.fn().mockResolvedValue(jsonResponse(payload))
    vi.stubGlobal('fetch', fetch)

    await expect(createSummary('Cells use glucose.', 'Cell energy')).resolves.toEqual(payload)
    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/summaries', expect.objectContaining({
      body: JSON.stringify({ notes: 'Cells use glucose.', title: 'Cell energy' }),
    }))
  })

  it('posts topic or notes quiz requests with the requested count', async () => {
    const payload = { title: 'Cell energy', questions: [] }
    const fetch = vi.fn().mockResolvedValue(jsonResponse(payload))
    vi.stubGlobal('fetch', fetch)

    await expect(createQuiz({ topic: 'Cell energy', sourceType: 'topic', questionCount: 3 })).resolves.toEqual(payload)
    expect(fetch).toHaveBeenLastCalledWith('http://localhost:3000/api/quizzes', expect.objectContaining({
      body: JSON.stringify({ topic: 'Cell energy', sourceType: 'topic', questionCount: 3 }),
    }))

    await createQuiz({ notes: 'Study text', sourceType: 'notes', questionCount: 5 })
    expect(fetch).toHaveBeenLastCalledWith('http://localhost:3000/api/quizzes', expect.objectContaining({
      body: JSON.stringify({ notes: 'Study text', sourceType: 'notes', questionCount: 5 }),
    }))
  })

  it('shows server validation and network errors to the UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'Notes must be 12,000 characters or fewer.' } }, false, 400)))
    await expect(createSummary('x'.repeat(12_001))).rejects.toThrow('Notes must be 12,000 characters or fewer.')

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(sendChatMessage('What is ATP?')).rejects.toThrow('Could not reach the StudyMate API.')
  })

  it('loads and saves per-user study history with the Supabase access token', async () => {
    const items = [{ id: 'saved-1', type: 'summary', title: 'Cell energy' }]
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items }))
      .mockResolvedValueOnce(jsonResponse({ item: items[0] }))
    vi.stubGlobal('fetch', fetch)

    await expect(getStudyItems('access-token')).resolves.toEqual(items)
    expect(fetch).toHaveBeenNthCalledWith(1, 'http://localhost:3000/api/study-items', expect.objectContaining({
      method: 'GET',
      headers: { authorization: 'Bearer access-token' },
    }))

    await expect(createStudyItem({ type: 'summary', title: 'Cell energy' }, 'access-token')).resolves.toEqual(items[0])
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:3000/api/study-items', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer access-token' },
      body: JSON.stringify({ type: 'summary', title: 'Cell energy' }),
    }))
  })
})
