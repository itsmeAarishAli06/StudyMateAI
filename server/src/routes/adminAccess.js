import { Router } from 'express'
import { AppError } from '../lib/errors.js'
import { requireSupabaseUser } from '../middleware/requireSupabaseUser.js'
import { callStudyAccessRpc } from '../services/studyAccess.js'

const router = Router()

router.get('/payment-requests', requireSupabaseUser, async (request, response) => {
  const result = await callStudyAccessRpc(request, 'admin_list_study_payment_requests')
  response.json({ requests: result || [] })
})

router.get('/students', requireSupabaseUser, async (request, response) => {
  const status = request.query.status || 'all'
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : ''
  const limit = Number(request.query.limit ?? 30)
  const offset = Number(request.query.offset ?? 0)
  if (!['all', 'premium', 'free'].includes(status)) throw new AppError(400, 'VALIDATION_ERROR', 'Choose all, premium, or free students.')
  if (search.length > 100) throw new AppError(400, 'VALIDATION_ERROR', 'Search must be 100 characters or fewer.')
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100_000) {
    throw new AppError(400, 'VALIDATION_ERROR', 'The student list page is invalid. Refresh and try again.')
  }
  const result = await callStudyAccessRpc(request, 'admin_list_studymate_students', {
    p_status: status,
    p_search: search,
    p_limit: limit,
    p_offset: offset,
  })
  response.json({ students: result?.students || [], total: result?.total || 0, counts: result?.counts || { all: 0, premium: 0, free: 0, admins: 0 } })
})

router.post('/students/:userId/grant', requireSupabaseUser, async (request, response) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.userId)) throw new AppError(400, 'VALIDATION_ERROR', 'User ID is invalid.')
  const planKey = request.body?.planKey
  if (!['weekly', 'monthly'].includes(planKey)) throw new AppError(400, 'VALIDATION_ERROR', 'Choose the 7-day or 30-day plan.')
  const result = await callStudyAccessRpc(request, 'admin_grant_study_access', {
    p_user_id: request.params.userId,
    p_plan_key: planKey,
  })
  response.json({ result })
})

router.post('/payment-requests/:id/review', requireSupabaseUser, async (request, response) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.id)) throw new AppError(400, 'VALIDATION_ERROR', 'Payment request ID is invalid.')
  const { decision, transactionReference = '', note = '' } = request.body || {}
  if (!['approve', 'reject'].includes(decision)) throw new AppError(400, 'VALIDATION_ERROR', 'Choose approve or reject.')
  if (typeof transactionReference !== 'string' || transactionReference.length > 120 || typeof note !== 'string' || note.length > 300) {
    throw new AppError(400, 'VALIDATION_ERROR', 'The transaction reference or note is too long.')
  }
  const result = await callStudyAccessRpc(request, 'admin_review_study_payment_request', {
    p_request_id: request.params.id,
    p_decision: decision,
    p_transaction_reference: transactionReference.trim() || null,
    p_review_note: note.trim() || null,
  })
  response.json({ result })
})

router.post('/access/:userId/revoke', requireSupabaseUser, async (request, response) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.userId)) throw new AppError(400, 'VALIDATION_ERROR', 'User ID is invalid.')
  const note = request.body?.note || null
  if (note !== null && (typeof note !== 'string' || note.length > 300)) throw new AppError(400, 'VALIDATION_ERROR', 'The note must be 300 characters or fewer.')
  const revoked = await callStudyAccessRpc(request, 'admin_revoke_study_access', {
    p_user_id: request.params.userId,
    p_note: typeof note === 'string' ? note.trim() || null : null,
  })
  response.json({ revoked: revoked === true })
})

export default router
