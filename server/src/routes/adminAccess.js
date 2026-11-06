import { Router } from 'express'
import { AppError } from '../lib/errors.js'
import { requireSupabaseUser } from '../middleware/requireSupabaseUser.js'
import { callStudyAccessRpc } from '../services/studyAccess.js'

const router = Router()

router.get('/payment-requests', requireSupabaseUser, async (request, response) => {
  const result = await callStudyAccessRpc(request, 'admin_list_study_payment_requests')
  response.json({ requests: result || [] })
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
