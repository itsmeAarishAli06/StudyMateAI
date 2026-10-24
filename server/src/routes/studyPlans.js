import { Router } from 'express'
import { requireSupabaseUser } from '../middleware/requireSupabaseUser.js'

const router = Router()
const planFields = 'id,title,exam_date,daily_minutes,topics,schedule,created_at,updated_at'

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function validateSchedule(schedule, dailyMinutes) {
  if (!Array.isArray(schedule) || schedule.length < 1 || schedule.length > 120) return false
  const dates = new Set()
  let previousDate = ''
  return schedule.every((day) => {
    if (!day || typeof day !== 'object' || !validDate(day.date) || dates.has(day.date) || day.date <= previousDate || !Array.isArray(day.tasks) || day.tasks.length > 8) return false
    dates.add(day.date)
    previousDate = day.date
    const taskIds = new Set()
    const validTasks = day.tasks.every((task) => task && typeof task === 'object' && typeof task.id === 'string' && task.id.length <= 80 && !taskIds.has(task.id)
      && typeof task.title === 'string' && task.title.trim().length > 0 && task.title.length <= 160
      && Number.isInteger(task.minutes) && task.minutes >= 5 && task.minutes <= 240
      && typeof task.completed === 'boolean'
      && (task.customized === undefined || typeof task.customized === 'boolean')
      && taskIds.add(task.id))
    const dayMinutes = day.tasks.reduce((sum, task) => sum + (Number.isInteger(task.minutes) ? task.minutes : 0), 0)
    return validTasks && (!Number.isInteger(dailyMinutes) || dayMinutes <= dailyMinutes)
  })
}

function validatePlan(body = {}, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) body = {}
  const fields = ['title', 'examDate', 'dailyMinutes', 'topics', 'schedule']
  if (partial && fields.some((field) => !Object.hasOwn(body, field))) return 'Include all study plan fields when saving schedule changes.'
  if (Object.hasOwn(body, 'title') && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 100)) return 'Plan name must be between 1 and 100 characters.'
  if (Object.hasOwn(body, 'examDate') && !validDate(body.examDate)) return 'Choose a valid exam date.'
  if (Object.hasOwn(body, 'dailyMinutes') && (!Number.isInteger(body.dailyMinutes) || body.dailyMinutes < 15 || body.dailyMinutes > 240)) return 'Daily study time must be between 15 and 240 minutes.'
  if (Object.hasOwn(body, 'topics') && (!Array.isArray(body.topics) || body.topics.length < 1 || body.topics.length > 30 || !body.topics.every((topic) => typeof topic === 'string' && topic.trim().length > 0 && topic.length <= 120))) return 'Add between 1 and 30 study topics, each up to 120 characters.'
  if (Object.hasOwn(body, 'schedule') && !validateSchedule(body.schedule, body.dailyMinutes)) return 'The study schedule has an invalid format or exceeds its daily time budget.'
  if (Object.hasOwn(body, 'schedule') && Object.hasOwn(body, 'examDate') && body.schedule.some((day) => day.date > body.examDate)) return 'Study tasks cannot be scheduled after the exam date.'
  return null
}

function mapPlan(row) {
  return {
    id: row.id,
    title: row.title,
    examDate: row.exam_date,
    dailyMinutes: row.daily_minutes,
    topics: row.topics,
    schedule: row.schedule,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function databaseError() {
  const error = new Error('Your study plan could not be loaded or saved. Confirm the study_plans migration is applied, then retry.')
  error.status = 503
  error.code = 'DATABASE_ERROR'
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
  if (!response.ok) throw databaseError()
  return result
}

router.get('/', requireSupabaseUser, async (request, response, next) => {
  try {
    const rows = await supabaseRequest(request, `study_plans?select=${planFields}&order=updated_at.desc&limit=30`)
    if (!Array.isArray(rows)) throw databaseError()
    response.json({ plans: rows.map(mapPlan) })
  } catch (error) { next(error) }
})

router.post('/', requireSupabaseUser, async (request, response, next) => {
  const validationError = validatePlan(request.body)
  if (validationError) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: validationError } })
    return
  }
  const body = request.body
  try {
    const rows = await supabaseRequest(request, `study_plans?select=${planFields}`, {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: request.supabase.userId,
        title: body.title.trim(),
        exam_date: body.examDate,
        daily_minutes: body.dailyMinutes,
        topics: body.topics.map((topic) => topic.trim()),
        schedule: body.schedule,
      }),
    })
    if (!Array.isArray(rows) || !rows[0]) throw databaseError()
    response.status(201).json({ plan: mapPlan(rows[0]) })
  } catch (error) { next(error) }
})

router.patch('/:id', requireSupabaseUser, async (request, response, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Study plan ID is invalid.' } })
    return
  }
  const validationError = validatePlan(request.body, true)
  if (validationError) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: validationError } })
    return
  }
  const body = request.body
  const updates = {
    ...(Object.hasOwn(body, 'title') ? { title: body.title.trim() } : {}),
    ...(Object.hasOwn(body, 'examDate') ? { exam_date: body.examDate } : {}),
    ...(Object.hasOwn(body, 'dailyMinutes') ? { daily_minutes: body.dailyMinutes } : {}),
    ...(Object.hasOwn(body, 'topics') ? { topics: body.topics.map((topic) => topic.trim()) } : {}),
    ...(Object.hasOwn(body, 'schedule') ? { schedule: body.schedule } : {}),
  }
  try {
    const rows = await supabaseRequest(request, `study_plans?${new URLSearchParams({ id: `eq.${request.params.id}`, select: planFields })}`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify(updates),
    })
    if (!Array.isArray(rows)) throw databaseError()
    if (!rows[0]) {
      response.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'This study plan no longer exists.' } })
      return
    }
    response.json({ plan: mapPlan(rows[0]) })
  } catch (error) { next(error) }
})

router.delete('/:id', requireSupabaseUser, async (request, response, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Study plan ID is invalid.' } })
    return
  }
  try {
    const rows = await supabaseRequest(request, `study_plans?${new URLSearchParams({ id: `eq.${request.params.id}`, select: 'id' })}`, {
      method: 'DELETE',
      headers: { prefer: 'return=representation' },
    })
    if (!Array.isArray(rows) || !rows.length) {
      response.status(404).json({ error: { code: 'PLAN_NOT_FOUND', message: 'This study plan no longer exists.' } })
      return
    }
    response.status(204).end()
  } catch (error) { next(error) }
})

export default router
