import { Router } from 'express'
import { requireSupabaseUser } from '../middleware/requireSupabaseUser.js'

const router = Router()
const validTypes = new Set(['summary', 'quiz'])

function validateItem(body = {}) {
  if (!validTypes.has(body.type)) return 'Choose a valid study item type.'
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 120) return 'Title must be between 1 and 120 characters.'
  if (body.type === 'summary') {
    const content = body.content
    if (!content || typeof content.lead !== 'string' || content.lead.length > 2000 || !Array.isArray(content.points) || content.points.length > 20 || !content.points.every((point) => typeof point === 'string' && point.length <= 1200) || typeof content.takeaway !== 'string' || content.takeaway.length > 2000) return 'Provide a complete summary to save.'
    if (typeof body.sourceText !== 'string' || !body.sourceText.trim() || body.sourceText.length > 12000) return 'Summary source text must be between 1 and 12,000 characters.'
  }
  if (body.type === 'quiz') {
    if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 10) return 'Provide between 1 and 10 quiz questions.'
    if (!body.questions.every((question) => typeof question.question === 'string' && question.question.length > 0 && question.question.length <= 500 && Array.isArray(question.options) && question.options.length === 4 && question.options.every((option) => typeof option === 'string' && option.length > 0 && option.length <= 500) && Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4 && typeof question.explanation === 'string' && question.explanation.length <= 1200)) return 'Quiz questions have an invalid format.'
    if (body.score !== undefined && (typeof body.score !== 'string' || !/^(\d{1,2}) \/ (\d{1,2})$/.test(body.score) || Number(body.score.split(' / ')[0]) > Number(body.score.split(' / ')[1]) || Number(body.score.split(' / ')[1]) !== body.questions.length)) return 'Quiz score has an invalid format.'
  }
  return null
}

function mapRow(row) {
  const date = new Date(row.created_at)
  return {
    id: row.id,
    type: row.item_type,
    title: row.title,
    preview: row.item_type === 'summary' ? row.content.lead : `${row.content.questions.length} questions to help you check your understanding.`,
    dateLabel: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }),
    createdAt: row.created_at,
    ...(row.item_type === 'summary' ? { sourceText: row.source_text, content: row.content } : { questions: row.content.questions, score: row.score }),
  }
}

function databaseError() {
  const error = new Error('Study history could not be loaded or saved. Please try again.')
  error.code = 'DATABASE_ERROR'
  error.status = 503
  return error
}

async function supabaseRequest(request, path, options = {}) {
  let response
  try {
    response = await fetch(`${request.supabase.url}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: request.supabase.anonKey,
        authorization: `Bearer ${request.supabase.token}`,
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw databaseError()
  }
  const result = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    throw databaseError()
  }
  return result
}

router.get('/', requireSupabaseUser, async (request, response, next) => {
  try {
    const rows = await supabaseRequest(request, 'study_items?select=id,item_type,title,source_text,content,score,created_at&order=created_at.desc&limit=200')
    if (!Array.isArray(rows)) throw databaseError()
    response.json({ items: rows.map(mapRow) })
  } catch (error) { next(error) }
})

router.post('/', requireSupabaseUser, async (request, response, next) => {
  const validationError = validateItem(request.body)
  if (validationError) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: validationError } })
    return
  }
  const body = request.body
  const row = {
    user_id: request.supabase.userId,
    item_type: body.type,
    title: body.title.trim(),
    source_text: body.type === 'summary' ? body.sourceText : null,
    content: body.type === 'summary' ? body.content : { questions: body.questions },
    score: body.type === 'quiz' ? (body.score || null) : null,
  }
  try {
    const result = await supabaseRequest(request, 'study_items?select=id,item_type,title,source_text,content,score,created_at', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify(row),
    })
    if (!Array.isArray(result) || !result[0]) throw databaseError()
    response.status(201).json({ item: mapRow(result[0]) })
  } catch (error) { next(error) }
})

export default router
