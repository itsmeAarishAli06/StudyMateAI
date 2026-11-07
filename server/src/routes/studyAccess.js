import { Router } from 'express'
import { AppError } from '../lib/errors.js'
import { requireSupabaseUser } from '../middleware/requireSupabaseUser.js'
import { callStudyAccessRpc, getStudyAccess } from '../services/studyAccess.js'

const router = Router()

async function ensureCompleteStudentProfile(request) {
  let response
  try {
    const query = new URLSearchParams({
      select: 'full_name,class_name,phone_e164,whatsapp_phone_e164',
      user_id: `eq.${request.supabase.userId}`,
      limit: '1',
    })
    response = await fetch(`${request.supabase.url}/rest/v1/student_profiles?${query}`, {
      headers: {
        apikey: request.supabase.anonKey,
        authorization: `Bearer ${request.supabase.token}`,
      },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new AppError(503, 'PROFILE_UNAVAILABLE', 'We could not verify your student profile. Please retry before requesting a plan.')
  }

  const rows = await response.json().catch(() => null)
  if (!response.ok || !Array.isArray(rows)) {
    throw new AppError(503, 'PROFILE_UNAVAILABLE', 'We could not verify your student profile. Please retry before requesting a plan.')
  }
  const profile = rows[0]
  const complete = Boolean(profile?.full_name?.trim() && profile?.class_name?.trim() && profile?.phone_e164?.trim() && profile?.whatsapp_phone_e164?.trim())
  if (!complete) {
    throw new AppError(409, 'PROFILE_INCOMPLETE', 'Complete your student profile with your full name, class or grade, phone number, and WhatsApp number before requesting Premium access.')
  }
}

router.get('/', requireSupabaseUser, async (request, response) => {
  response.json({ access: await getStudyAccess(request) })
})

router.post('/requests', requireSupabaseUser, async (request, response) => {
  const planKey = request.body?.planKey
  if (!['weekly', 'monthly'].includes(planKey)) throw new AppError(400, 'VALIDATION_ERROR', 'Choose the weekly or monthly plan.')
  await ensureCompleteStudentProfile(request)
  const result = await callStudyAccessRpc(request, 'create_study_payment_request', { p_plan_key: planKey })
  response.status(201).json({ request: result })
})

router.delete('/requests/:id', requireSupabaseUser, async (request, response) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.id)) throw new AppError(400, 'VALIDATION_ERROR', 'Payment request ID is invalid.')
  const result = await callStudyAccessRpc(request, 'cancel_study_payment_request', { p_request_id: request.params.id })
  response.json({ cancelled: result === true })
})

export default router
