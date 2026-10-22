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

export function requireSupabaseUser(request, response, next) {
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

  fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.anonKey, authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  })
    .then(async (authResponse) => {
      if (!authResponse.ok) {
        response.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Your session has expired. Sign in again.' } })
        return
      }
      const user = await authResponse.json()
      if (!user?.id) {
        response.status(401).json({ error: { code: 'INVALID_SESSION', message: 'Your session could not be verified.' } })
        return
      }
      request.supabase = { ...config, token, userId: user.id }
      next()
    })
    .catch(() => {
      response.status(503).json({ error: { code: 'AUTH_UNAVAILABLE', message: 'Could not verify your StudyMate session. Please retry.' } })
    })
}
