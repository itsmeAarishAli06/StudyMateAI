import { Router } from 'express'
import { AppError, validateText } from '../lib/errors.js'
import { consumeAiDailyRequest } from '../services/aiUsage.js'
import { answerQuestion } from '../services/study.js'

const router = Router()
const learningModes = new Set(['tutor', 'simple', 'hint', 'quiz'])

router.post('/', async (request, response) => {
  const message = validateText(request.body?.message, 'message', { max: 1200, label: 'Message' })
  const history = request.body?.history ?? []
  if (!Array.isArray(history) || history.length > 20 || history.some((item) => !item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !['role', 'text'].includes(key)) || !['user', 'assistant'].includes(item.role) || typeof item.text !== 'string' || !item.text.trim() || item.text.length > 1200)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'History must contain up to 20 user or assistant messages, each with text of 1,200 characters or fewer.')
  }
  const mode = request.body?.mode ?? 'tutor'
  if (typeof mode !== 'string' || !learningModes.has(mode)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Learning mode must be tutor, simple, hint, or quiz.')
  }
  await consumeAiDailyRequest(request)
  const answer = await answerQuestion(message, history.map(({ role, text }) => ({ role, text: text.trim() })), mode)
  response.json({ answer })
})

export default router
