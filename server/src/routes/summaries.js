import { Router } from 'express'
import { validateText } from '../lib/errors.js'
import { consumeAiDailyRequest } from '../services/aiUsage.js'
import { summarizeNotes } from '../services/study.js'

const router = Router()

router.post('/', async (request, response) => {
  const notes = validateText(request.body?.notes, 'notes', { max: 12_000, label: 'Notes' })
  const title = request.body?.title === undefined ? 'Untitled study summary' : validateText(request.body.title, 'title', { min: 1, max: 80, label: 'Title' })
  await consumeAiDailyRequest(request)
  const content = await summarizeNotes(notes)
  response.status(200).json({ title, sourceText: notes, content })
})

export default router
