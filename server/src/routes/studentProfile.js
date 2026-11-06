import { Router } from 'express'
import { AppError, validateText } from '../lib/errors.js'
import { requireSupabaseUser } from '../middleware/requireSupabaseUser.js'

const router = Router()
const phonePattern = /^\+[1-9][0-9]{7,14}$/

function profileUnavailable() {
  return new AppError(503, 'PROFILE_UNAVAILABLE', 'Your StudyMate profile could not be loaded or saved. Please retry.')
}

async function profileRequest(request, path, options = {}) {
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
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw profileUnavailable()
  }
  const result = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    if (['42P01', '42703', 'PGRST204', 'PGRST205'].includes(result?.code)) {
      throw new AppError(503, 'PROFILE_SETUP_REQUIRED', 'Student profile setup is incomplete. Apply the latest student profile migration in Supabase, then retry.')
    }
    throw profileUnavailable()
  }
  return result
}

function mapProfile(row) {
  if (!row) return null
  const profile = {
    fullName: row.full_name || '',
    className: row.class_name || '',
    phone: row.phone_e164 || '',
    whatsappPhone: row.whatsapp_phone_e164 || '',
    updatedAt: row.updated_at,
  }
  profile.complete = Boolean(profile.fullName && profile.className && profile.phone && profile.whatsappPhone)
  return profile
}

router.get('/', requireSupabaseUser, async (request, response) => {
  const rows = await profileRequest(
    request,
    `student_profiles?select=full_name,class_name,phone_e164,whatsapp_phone_e164,updated_at&user_id=eq.${encodeURIComponent(request.supabase.userId)}&limit=1`,
  )
  if (!Array.isArray(rows)) throw profileUnavailable()
  response.json({ profile: mapProfile(rows[0]) })
})

router.patch('/', requireSupabaseUser, async (request, response) => {
  const body = request.body || {}
  const fullName = validateText(body.fullName, 'fullName', { min: 2, max: 100, label: 'Full name' }).replace(/\s+/g, ' ')
  const className = validateText(body.className, 'className', { max: 80, label: 'Class or grade' }).replace(/\s+/g, ' ')
  const phone = validateText(body.phone, 'phone', { max: 16, label: 'Phone number' })
  const whatsappPhone = validateText(body.whatsappPhone, 'whatsappPhone', { max: 16, label: 'WhatsApp number' })
  if (!phonePattern.test(phone) || !phonePattern.test(whatsappPhone)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Enter both phone numbers in international format, for example +923001234567.')
  }

  const rows = await profileRequest(
    request,
    `student_profiles?user_id=eq.${encodeURIComponent(request.supabase.userId)}&select=full_name,class_name,phone_e164,whatsapp_phone_e164,updated_at`,
    {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        full_name: fullName,
        class_name: className,
        phone_e164: phone,
        whatsapp_phone_e164: whatsappPhone,
      }),
    },
  )
  if (!Array.isArray(rows) || !rows[0]) throw profileUnavailable()
  response.json({ profile: mapProfile(rows[0]) })
})

export default router
