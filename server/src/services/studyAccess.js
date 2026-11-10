import { AppError } from '../lib/errors.js'

function accessConfig(request) {
  const config = request.supabase
  if (!config?.url || !config?.anonKey || !config?.token || !config?.userId) {
    throw new AppError(503, 'ACCESS_UNAVAILABLE', 'Study plans need a verified account and Supabase configuration.')
  }
  return config
}

export async function callStudyAccessRpc(request, functionName, args = {}) {
  const config = accessConfig(request)
  let response
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    console.error('Study access database request failed:', error.cause?.code || error.name || 'network error')
    throw new AppError(503, 'ACCESS_UNAVAILABLE', 'Study plan information is temporarily unavailable. Please retry.')
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    let payload
    try { payload = JSON.parse(errorText) } catch { payload = null }
    const code = payload?.code || /"code"\s*:\s*"([A-Z0-9]+)"/.exec(errorText)?.[1]
    const databaseMessage = typeof payload?.message === 'string' ? payload.message.slice(0, 240) : 'database error'
    if (code === '42501' || response.status === 403) throw new AppError(403, 'ADMIN_REQUIRED', 'This action is available to StudyMate administrators only.')
    if (code === '23505') {
      if (functionName === 'admin_grant_study_access') throw new AppError(409, 'PAYMENT_REQUEST_PENDING', 'This student has a pending payment request. Review it from the Payment requests tab before granting access manually.')
      throw new AppError(409, 'REQUEST_PENDING', 'You already have a payment request waiting for review.')
    }
    if (code === 'P0002') {
      if (functionName === 'create_study_friends_payment_request') throw new AppError(400, 'FRIEND_ACCOUNTS_REQUIRED', 'All three friends must already have confirmed StudyMate accounts. Check the email addresses or ask them to sign up and confirm first.')
      if (functionName === 'admin_grant_study_access') throw new AppError(409, 'STUDENT_NOT_ELIGIBLE', 'This account was not found or its email has not been confirmed yet.')
      throw new AppError(404, 'REQUEST_NOT_FOUND', 'That pending payment request could not be found.')
    }
    if (code === '22023') {
      if (functionName === 'admin_grant_study_access') throw new AppError(400, 'INVALID_ACCESS_REQUEST', 'This account cannot receive the selected Premium access.')
      throw new AppError(400, 'INVALID_ACCESS_REQUEST', 'The access request is invalid. Check the details and try again.')
    }
    if (code === '28000') throw new AppError(401, 'INVALID_SESSION', 'Your StudyMate session has expired. Sign in again.')
    if (['PGRST202', '42702', '42883', '42P01', '42703'].includes(code)) {
      console.error(`Study access database RPC ${functionName} is unavailable:`, code, databaseMessage)
      const migrationMessage = functionName === 'admin_list_studymate_students'
        ? 'The student directory setup is incomplete. Apply the latest student profile migration in Supabase, then retry.'
        : functionName === 'admin_grant_study_access'
          ? 'Manual Premium grants are not set up yet. Apply the latest admin Premium grant migration in Supabase, then retry.'
          : ['create_study_friends_payment_request', 'admin_list_study_friends_payment_requests', 'admin_review_study_friends_payment_request'].includes(functionName)
            ? 'Friends Premium is not set up yet. Apply the Friends Premium migration in Supabase, then retry.'
            : 'StudyMate plan setup is incomplete. Apply the manual Premium access migration in Supabase, then retry.'
      throw new AppError(503, 'ACCESS_SETUP_REQUIRED', migrationMessage)
    }
    console.error(`Study access database RPC ${functionName} failed:`, response.status, code || 'unknown database code', databaseMessage)
    throw new AppError(503, 'ACCESS_UNAVAILABLE', 'Study plan information is temporarily unavailable. Please retry.')
  }

  try {
    return await response.json()
  } catch {
    throw new AppError(503, 'ACCESS_UNAVAILABLE', 'Study plan information returned an unreadable response. Please retry.')
  }
}

export async function getStudyAccess(request) {
  const result = await callStudyAccessRpc(request, 'get_studymate_access')
  const row = Array.isArray(result) ? result[0] : result
  if (!row || typeof row.is_admin !== 'boolean' || typeof row.premium_active !== 'boolean' || !Number.isInteger(row.daily_limit)) {
    throw new AppError(503, 'ACCESS_UNAVAILABLE', 'Study plan information is temporarily unavailable. Please retry.')
  }
  return {
    isAdmin: row.is_admin,
    planKey: row.plan_key,
    premiumActive: row.premium_active,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    dailyLimit: row.daily_limit,
    pendingRequest: row.pending_request,
    latestRequest: row.latest_request,
  }
}
