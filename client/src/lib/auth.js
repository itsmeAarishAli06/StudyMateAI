const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const storageKey = 'studymate.supabase.session'

export const authConfigured = Boolean(supabaseUrl && supabaseAnonKey)

function readSession() {
  try { return JSON.parse(window.localStorage.getItem(storageKey) || 'null') } catch { return null }
}

function writeSession(session) {
  if (session) window.localStorage.setItem(storageKey, JSON.stringify(session))
  else window.localStorage.removeItem(storageKey)
}

async function authRequest(path, body, accessToken, method = 'POST') {
  let response
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
      method,
      headers: { apikey: supabaseAnonKey, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error('Could not reach Supabase Auth. Check your connection and project URL.')
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.msg || payload.message || payload.error_description || 'Authentication failed. Please try again.')
  return payload
}

function sessionFrom(payload) {
  if (!payload?.access_token || !payload?.user?.id) return null
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600),
    user: { id: payload.user.id, email: payload.user.email },
  }
}

export async function getSession() {
  const session = readSession()
  if (!session) return null
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session
  if (!session.refresh_token) { writeSession(null); return null }
  try {
    const refreshed = sessionFrom(await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token }))
    writeSession(refreshed)
    return refreshed
  } catch {
    writeSession(null)
    return null
  }
}

export async function signIn(email, password) {
  const session = sessionFrom(await authRequest('token?grant_type=password', { email, password }))
  if (!session) throw new Error('Supabase did not return a signed-in session. Check your email verification settings.')
  writeSession(session)
  return session
}

export async function signUp(email, password) {
  const payload = await authRequest('signup', { email, password })
  const session = sessionFrom(payload)
  if (session) writeSession(session)
  return session
}

export async function requestPasswordReset(email, redirectTo) {
  const redirect = encodeURIComponent(redirectTo)
  await authRequest(`recover?redirect_to=${redirect}`, { email })
}

export async function updatePassword(password, accessToken) {
  if (!accessToken) throw new Error('Your password reset session has expired. Request a new reset email.')
  await authRequest('user', { password }, accessToken, 'PUT')
}

export async function consumePasswordRecovery() {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const recoveryRequested = fragment.get('type') === 'recovery' || query.get('flow') === 'recovery'
  if (!recoveryRequested) return null

  const clearRecoveryUrl = () => {
    query.delete('flow')
    const remainingQuery = query.toString()
    window.history.replaceState({}, document.title, `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}`)
  }

  if (fragment.has('error') || query.has('error')) {
    clearRecoveryUrl()
    throw new Error('This password reset link is invalid or has expired. Request a new one.')
  }

  const accessToken = fragment.get('access_token')
  const refreshToken = fragment.get('refresh_token')
  const expiresIn = Number(fragment.get('expires_in')) || 3600
  if (!accessToken || !refreshToken) {
    clearRecoveryUrl()
    throw new Error('This password reset link is incomplete or has expired. Request a new one.')
  }

  let response
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error('Could not verify this reset link. Check your connection and try again.')
  }
  const user = await response.json().catch(() => ({}))
  if (!response.ok || !user?.id) {
    clearRecoveryUrl()
    throw new Error('This password reset link is invalid or has expired. Request a new one.')
  }

  const session = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user: { id: user.id, email: user.email },
  }
  writeSession(session)
  clearRecoveryUrl()
  return session
}

export async function signOut() {
  const session = readSession()
  writeSession(null)
  if (!session?.access_token) return
  try {
    fetch(`${supabaseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: supabaseAnonKey, authorization: `Bearer ${session.access_token}` },
    }).catch(() => {})
  } catch { /* Local session is cleared even if the revoke request is offline. */ }
}
