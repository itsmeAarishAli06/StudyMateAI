import { Router } from 'express'
import { requireSupabaseUser } from '../middleware/requireSupabaseUser.js'
import { getAiDailyUsage } from '../services/aiUsage.js'

const router = Router()

router.get('/', requireSupabaseUser, async (request, response) => {
  const usage = await getAiDailyUsage(request)
  response.json({ usage })
})

export default router
