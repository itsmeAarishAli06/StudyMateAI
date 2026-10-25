import { getSession } from './auth.js'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000')
  .replace(/\/$/, '')

async function request(path, body, token, method = body === undefined ? 'GET' : 'POST') {
  async function send(accessToken) {
    try {
      return await fetch(`${apiBaseUrl}${path}`, {
        method,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(65_000),
      })
    } catch (error) {
      if (error.name === 'TimeoutError') {
        throw new Error('StudyMate took too long to respond. Please try again in a moment.')
      }
      throw new Error('Could not reach the StudyMate API. Make sure the backend is running and try again.')
    }
  }

  let response = await send(token)
  if (response.status === 401 && token) {
    const refreshedSession = await getSession()
    if (refreshedSession?.access_token && refreshedSession.access_token !== token) response = await send(refreshedSession.access_token)
  }

  let payload
  if (response.status === 204) return null
  try {
    payload = await response.json()
  } catch {
    throw new Error('The StudyMate API returned an unreadable response. Please try again.')
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || `The StudyMate API returned an error (${response.status}).`)
  }
  return payload
}

export function getHealth() {
  return request('/api/health')
}

export function getAiDailyUsage(token) {
  return request('/api/ai-usage', undefined, token).then((result) => result.usage)
}

function notifyAiUsageRefresh() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('studymate:ai-usage-refresh'))
}

export function getStudyItems(token) {
  return request('/api/study-items', undefined, token).then((result) => result.items)
}

export function createStudyItem(item, token) {
  return request('/api/study-items', item, token).then((result) => result.item)
}

export function getStudyPlans(token) {
  return request('/api/study-plans', undefined, token).then((result) => result.plans)
}

export function createStudyPlan(plan, token) {
  return request('/api/study-plans', plan, token).then((result) => result.plan)
}

export function updateStudyPlan(id, plan, token) {
  return request(`/api/study-plans/${encodeURIComponent(id)}`, plan, token, 'PATCH').then((result) => result.plan)
}

export function deleteStudyPlan(id, token) {
  return request(`/api/study-plans/${encodeURIComponent(id)}`, undefined, token, 'DELETE')
}

export async function sendChatMessage(message, history = [], token, mode = 'tutor') {
  const normalizedHistory = Array.isArray(history)
    ? history
      .filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.text === 'string' && item.text.trim())
      .slice(-20)
      .map(({ role, text }) => ({ role, text: text.trim().slice(0, 1200) }))
    : []
  try {
    const result = await request('/api/chat', { message, history: normalizedHistory, ...(mode === 'tutor' ? {} : { mode }) }, token)
    return result.answer
  } finally {
    notifyAiUsageRefresh()
  }
}

export async function createSummary(notes, title, token) {
  try {
    return await request('/api/summaries', { notes, title }, token)
  } finally {
    notifyAiUsageRefresh()
  }
}

export async function createQuiz({ topic, notes, sourceType = 'topic', questionCount = 5, difficulty }, token) {
  try {
    return await request('/api/quizzes', {
      ...(sourceType === 'topic' ? { topic } : { notes }),
      sourceType,
      questionCount,
      ...(difficulty ? { difficulty } : {}),
    }, token)
  } finally {
    notifyAiUsageRefresh()
  }
}
