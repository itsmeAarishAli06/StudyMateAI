import { Router } from 'express'
import { AppError } from '../lib/errors.js'
import { requireAiAccount, requireSupabaseUser } from '../middleware/requireSupabaseUser.js'
import { getSharedAiRateLimiter } from '../middleware/rateLimit.js'
import { consumeAiDailyRequest } from '../services/aiUsage.js'
import { hasAiProvider } from '../services/ai.js'
import { createMockExam } from '../services/study.js'

const router = Router()
const questionCounts = new Set([5, 10, 15])
const durations = new Set([1, 3, 5, 10, 15, 20])
const difficulties = new Set(['easy', 'standard', 'challenging'])
const selectFields = 'id,title,exam_date,topics,format,question_count,duration_minutes,difficulty,questions,answers,result,status,started_at,expires_at,submitted_at,created_at'

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function cleanTopics(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 15) return null
  const topics = value.map((topic) => typeof topic === 'string' ? topic.trim() : '')
  if (topics.some((topic) => topic.length < 1 || topic.length > 120)) return null
  const unique = [...new Map(topics.map((topic) => [topic.toLocaleLowerCase(), topic])).values()]
  return unique.length === topics.length ? topics : null
}

function databaseError() {
  return new AppError(503, 'EXAM_DATABASE_ERROR', 'Your exam could not be saved or loaded. Confirm the exam preparation migration is applied, then retry.')
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
      signal: AbortSignal.timeout(12_000),
    })
  } catch {
    throw databaseError()
  }
  const result = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw databaseError()
  return result
}

function safeQuestions(questions) {
  return questions.map(({ topic, question, options, explanation }) => ({
    topic,
    question,
    options,
    explanation,
  }))
}

function mapAttempt(row) {
  return {
    id: row.id,
    title: row.title,
    examDate: row.exam_date,
    topics: row.topics,
    format: row.format,
    questionCount: row.question_count,
    durationMinutes: row.duration_minutes,
    difficulty: row.difficulty || 'standard',
    questions: safeQuestions(row.questions || []),
    status: row.status,
    result: row.result,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
  }
}

function analyzeExam(questions, answers, startedAt) {
  let correct = 0
  const byTopic = new Map()
  const reviewedQuestions = questions.map((question, index) => {
    const selected = answers[index] ?? null
    const isCorrect = selected === question.answer
    if (isCorrect) correct += 1
    const stats = byTopic.get(question.topic) || { topic: question.topic, total: 0, correct: 0 }
    stats.total += 1
    if (isCorrect) stats.correct += 1
    byTopic.set(question.topic, stats)
    return { ...question, selected, isCorrect }
  })
  const topics = [...byTopic.values()]
    .map((topic) => ({ ...topic, accuracy: Math.round((topic.correct / topic.total) * 100) }))
    .sort((left, right) => left.accuracy - right.accuracy || left.topic.localeCompare(right.topic))
  const weakest = topics.filter((topic) => topic.accuracy < 70).slice(0, 5)
  const revisionPlan = weakest.map((topic, index) => ({
    topic: topic.topic,
    accuracy: topic.accuracy,
    minutes: topic.accuracy < 40 ? 30 : 20,
    task: topic.accuracy < 40 ? `Relearn the core ideas in ${topic.topic}, then retry missed questions.` : `Review ${topic.topic} and practice the questions you missed.`,
    priority: index + 1,
  }))
  return {
    score: correct,
    total: questions.length,
    percentage: Math.round((correct / questions.length) * 100),
    timeUsedSeconds: Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000)),
    topics,
    weakTopics: weakest.map((topic) => topic.topic),
    revisionPlan,
    questions: reviewedQuestions,
  }
}

router.get('/', requireSupabaseUser, async (request, response, next) => {
  try {
    const rows = await supabaseRequest(request, `exam_attempts?select=${selectFields}&order=created_at.desc&limit=30`)
    if (!Array.isArray(rows)) throw databaseError()
    response.json({ exams: rows.map(mapAttempt) })
  } catch (error) { next(error) }
})

router.post('/', (request, response, next) => getSharedAiRateLimiter()(request, response, next), requireAiAccount, async (request, response, next) => {
  const body = request.body || {}
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const topics = cleanTopics(body.topics)
  const examDate = body.examDate
  const questionCount = body.questionCount ?? 15
  const durationMinutes = body.durationMinutes ?? 10
  const difficulty = body.difficulty ?? 'standard'
  const notes = body.notes === undefined ? '' : body.notes

  if (!title || title.length > 100) throw new AppError(400, 'VALIDATION_ERROR', 'Exam name must be between 1 and 100 characters.')
  const minimumExamDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  if (!validDate(examDate) || examDate < minimumExamDate) throw new AppError(400, 'VALIDATION_ERROR', 'Choose today or a future exam date.')
  if (!topics) throw new AppError(400, 'VALIDATION_ERROR', 'Add 1 to 15 unique syllabus topics, each up to 120 characters.')
  if (!questionCounts.has(questionCount)) throw new AppError(400, 'VALIDATION_ERROR', 'Choose 5, 10, or 15 MCQs per mock exam.')
  if (questionCount < topics.length) throw new AppError(400, 'VALIDATION_ERROR', 'Choose at least as many questions as syllabus topics so every topic can be covered.')
  if (!durations.has(durationMinutes)) throw new AppError(400, 'VALIDATION_ERROR', 'Choose 1, 3, 5, 10, 15, or 20 minutes.')
  if (!difficulties.has(difficulty)) throw new AppError(400, 'VALIDATION_ERROR', 'Choose easy, standard, or challenging difficulty.')
  if (typeof notes !== 'string' || notes.length > 12_000) throw new AppError(400, 'VALIDATION_ERROR', 'Optional syllabus notes must be 12,000 characters or fewer.')
  if (!hasAiProvider()) throw new AppError(503, 'AI_NOT_CONFIGURED', 'Exam generation needs a Gemini API key configured on the server.')

  try {
    await consumeAiDailyRequest(request)
    const generated = await createMockExam({ title, topics, syllabusNotes: notes.trim(), questionCount, difficulty })
    const startedAt = new Date()
    const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60_000)
    const exam = {
      title: generated.title || title,
      exam_date: examDate,
      topics,
      format: 'mcq',
      question_count: questionCount,
      duration_minutes: durationMinutes,
      difficulty,
      questions: generated.questions,
      answers: null,
      result: null,
      status: 'in_progress',
      started_at: startedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    }

    if (request.supabase) {
      const rows = await supabaseRequest(request, `exam_attempts?select=${selectFields}`, {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({ user_id: request.supabase.userId, ...exam }),
      })
      if (!Array.isArray(rows) || !rows[0]) throw databaseError()
      response.status(201).json({ exam: mapAttempt(rows[0]) })
      return
    }

    response.status(201).json({ exam: {
      id: null,
      title: exam.title,
      examDate,
      topics,
      format: 'mcq',
      questionCount,
      durationMinutes,
      difficulty,
      questions: safeQuestions(generated.questions),
      localQuestions: generated.questions,
      status: 'in_progress',
      startedAt: exam.started_at,
      expiresAt: exam.expires_at,
      createdAt: exam.started_at,
    } })
  } catch (error) { next(error) }
})

router.post('/:id/submit', requireSupabaseUser, async (request, response, next) => {
  const id = request.params.id
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError(400, 'VALIDATION_ERROR', 'Exam attempt ID is invalid.')
  const answers = request.body?.answers
  if (!Array.isArray(answers) || answers.length < 5 || answers.length > 25
    || answers.some((answer) => answer !== null && (!Number.isInteger(answer) || answer < 0 || answer > 3))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Submit one option index or null for every exam question.')
  }

  try {
    const rows = await supabaseRequest(request, `exam_attempts?${new URLSearchParams({ id: `eq.${id}`, select: selectFields })}`)
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row) throw new AppError(404, 'EXAM_NOT_FOUND', 'This exam attempt could not be found.')
    if (row.status === 'submitted' && row.result) {
      response.json({ result: row.result })
      return
    }
    if (!Array.isArray(row.questions) || answers.length !== row.questions.length) throw new AppError(400, 'VALIDATION_ERROR', 'Your answer list does not match the exam.')

    const result = analyzeExam(row.questions, answers, row.started_at)
    const updates = await supabaseRequest(request, `exam_attempts?${new URLSearchParams({ id: `eq.${id}`, status: 'eq.in_progress', select: selectFields })}`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ answers, result, status: 'submitted', submitted_at: new Date().toISOString() }),
    })
    if (!Array.isArray(updates) || !updates[0]) {
      const latest = await supabaseRequest(request, `exam_attempts?${new URLSearchParams({ id: `eq.${id}`, select: 'result,status' })}`)
      if (latest?.[0]?.status === 'submitted' && latest[0].result) {
        response.json({ result: latest[0].result })
        return
      }
      throw databaseError()
    }
    response.json({ result })
  } catch (error) { next(error) }
})

export default router
