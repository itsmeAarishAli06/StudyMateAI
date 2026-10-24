function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const anonKey = process.env.SUPABASE_ANON_KEY
  return url && anonKey ? { url, anonKey } : null
}

export function requireAiAccount(request, response, next) {
  const hasUrl = Boolean(process.env.SUPABASE_URL?.trim())
  const hasKey = Boolean(process.env.SUPABASE_ANON_KEY?.trim())
  if (!hasUrl && !hasKey) {
    next()
    return
  }
  if (!hasUrl || !hasKey) {
    response.status(503).json({ error: { code: 'SUPABASE_NOT_CONFIGURED', message: 'Account protection needs both SUPABASE_URL and SUPABASE_ANON_KEY configured.' } })
    return
  }
  requireSupabaseUser(request, response, next)
}

export async function requireSupabaseUser(request, response, next) {
  const config = supabaseConfig()
  if (!config) {
    response.status(503).json({ error: { code: 'SUPABASE_NOT_CONFIGURED', message: 'Study history needs Supabase configuration. Add SUPABASE_URL and SUPABASE_ANON_KEY to the server environment.' } })
    return
  }

  const token = request.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) {
    response.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to access your study history.' } })
    return
  }

  let authResponse
  try {
    authResponse = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.anonKey, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    const networkCode = error.cause?.code || error.name || 'network error'
    console.error('Supabase Auth verification request failed:', networkCode)
    const message = error.name === 'TimeoutError'
      ? 'Supabase Auth took too long to respond. Check the server Supabase URL and try again.'
      : 'The server could not reach Supabase Auth. Check the server Supabase URL and try again.'
    response.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message } })
    return
  }

  if (!authResponse.ok) {
    console.warn('Supabase Auth rejected a session verification request:', authResponse.status)
    if (authResponse.status === 429 || authResponse.status >= 500) {
      response.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Supabase Auth is temporarily unavailable. Please retry.' } })
      return
    }
    response.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Your session has expired. Sign in again.' } })
    return
  }

  let user
  try {
    user = await authResponse.json()
  } catch {
    console.error('Supabase Auth returned an unreadable session verification response.')
    response.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Supabase Auth returned an unreadable response. Please retry.' } })
    return
  }
  if (!user?.id) {
    response.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Your session could not be verified.' } })
    return
  }

  request.supabase = { ...config, token, userId: user.id }
  next()
}
