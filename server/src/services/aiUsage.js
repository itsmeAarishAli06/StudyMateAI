import { AppError } from '../lib/errors.js'

async function callUsageRpc(request, functionName) {
  const config = request.supabase
  if (!config?.url || !config?.anonKey || !config?.token || !config?.userId) {
    throw new AppError(503, 'AI_QUOTA_UNAVAILABLE', 'Daily AI usage is unavailable. Sign in and try again.')
  }

  let response
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(8_000),
    })
  } catch (error) {
    console.error('Supabase AI usage request failed:', error.cause?.code || error.name || 'network error')
    throw new AppError(503, 'AI_QUOTA_UNAVAILABLE', 'Could not check your daily AI limit. Please retry shortly.')
  }

  if (!response.ok) {
    console.error('Supabase AI usage request was rejected:', response.status)
    throw new AppError(503, 'AI_QUOTA_UNAVAILABLE', 'Could not check your daily AI limit. Please retry shortly.')
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new AppError(503, 'AI_QUOTA_UNAVAILABLE', 'Could not check your daily AI limit. Please retry shortly.')
  }
  const row = Array.isArray(payload) ? payload[0] : payload
  if (!row || !Number.isInteger(row.used) || !Number.isInteger(row.remaining) || !Number.isInteger(row.daily_limit) || typeof row.resets_at !== 'string') {
    throw new AppError(503, 'AI_QUOTA_UNAVAILABLE', 'Could not check your daily AI limit. Please retry shortly.')
  }
  return {
    ...(typeof row.allowed === 'boolean' ? { allowed: row.allowed } : {}),
    used: row.used,
    remaining: row.remaining,
    dailyLimit: row.daily_limit,
    resetsAt: row.resets_at,
  }
}

export function getAiDailyUsage(request) {
  return callUsageRpc(request, 'get_ai_daily_usage')
}

export async function consumeAiDailyRequest(request) {
  if (!request.supabase) {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError(503, 'AI_QUOTA_UNAVAILABLE', 'Daily AI limits require Supabase account configuration.')
    }
    return null
  }

  const usage = await callUsageRpc(request, 'consume_ai_daily_request')
  request.aiDailyUsage = usage
  if (usage.allowed === false) {
    const error = new AppError(429, 'AI_DAILY_LIMIT_REACHED', `You have used all ${usage.dailyLimit} AI requests for today. Your limit resets at midnight UTC.`)
    error.details = { usage }
    throw error
  }
  if (usage.allowed !== true) {
    throw new AppError(503, 'AI_QUOTA_UNAVAILABLE', 'Could not check your daily AI limit. Please retry shortly.')
  }
  return usage
}
