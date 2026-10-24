import { Router } from 'express'
import { AppError, validateText } from '../lib/errors.js'
import { consumeAiDailyRequest } from '../services/aiUsage.js'
import { createQuiz } from '../services/study.js'

const router = Router()

router.post('/', async (request, response) => {
  const sourceType = request.body?.sourceType ?? 'topic'
  if (!['topic', 'notes'].includes(sourceType)) throw new AppError(400, 'VALIDATION_ERROR', 'sourceType must be either "topic" or "notes".')
  const source = sourceType === 'topic'
    ? validateText(request.body?.topic, 'topic', { max: 100, label: 'Topic' })
    : validateText(request.body?.notes, 'notes', { max: 12_000, label: 'Notes' })
  const questionCount = request.body?.questionCount ?? 5
  if (![3, 5].includes(questionCount)) throw new AppError(400, 'VALIDATION_ERROR', 'questionCount must be either 3 or 5.')
  const difficulty = request.body?.difficulty ?? 'standard'
  if (!['easy', 'standard', 'challenging'].includes(difficulty)) throw new AppError(400, 'VALIDATION_ERROR', 'difficulty must be "easy", "standard", or "challenging".')
  await consumeAiDailyRequest(request)
  const quiz = await createQuiz(source, questionCount, sourceType, difficulty)
  response.json(quiz)
})

export default router
