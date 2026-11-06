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
    const code = /"code"\s*:\s*"([A-Z0-9]+)"/.exec(errorText)?.[1]
    if (code === '42501' || response.status === 403) throw new AppError(403, 'ADMIN_REQUIRED', 'This action is available to StudyMate administrators only.')
    if (code === '23505') throw new AppError(409, 'REQUEST_PENDING', 'You already have a payment request waiting for review.')
    if (code === 'P0002') throw new AppError(404, 'REQUEST_NOT_FOUND', 'That pending payment request could not be found.')
    if (code === '22023') throw new AppError(400, 'INVALID_ACCESS_REQUEST', 'The access request is invalid. Check the details and try again.')
    console.error(`Study access database RPC ${functionName} failed:`, response.status, code || 'database error')
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
