import { Router } from 'express'
import { hasAiProvider } from '../services/ai.js'

const router = Router()

router.get('/', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'studymate-api',
    aiProvider: hasAiProvider() ? 'gemini' : 'demo',
    timestamp: new Date().toISOString(),
  })
})

export default router
