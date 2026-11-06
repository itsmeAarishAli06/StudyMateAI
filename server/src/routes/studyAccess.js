import { Router } from 'express'
import { AppError } from '../lib/errors.js'
import { requireSupabaseUser } from '../middleware/requireSupabaseUser.js'
import { callStudyAccessRpc, getStudyAccess } from '../services/studyAccess.js'

const router = Router()

router.get('/', requireSupabaseUser, async (request, response) => {
  response.json({ access: await getStudyAccess(request) })
})

router.post('/requests', requireSupabaseUser, async (request, response) => {
  const planKey = request.body?.planKey
  if (!['weekly', 'monthly'].includes(planKey)) throw new AppError(400, 'VALIDATION_ERROR', 'Choose the weekly or monthly plan.')
  const result = await callStudyAccessRpc(request, 'create_study_payment_request', { p_plan_key: planKey })
  response.status(201).json({ request: result })
})

router.delete('/requests/:id', requireSupabaseUser, async (request, response) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.id)) throw new AppError(400, 'VALIDATION_ERROR', 'Payment request ID is invalid.')
  const result = await callStudyAccessRpc(request, 'cancel_study_payment_request', { p_request_id: request.params.id })
  response.json({ cancelled: result === true })
})

export default router
