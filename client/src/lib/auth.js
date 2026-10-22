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

async function authRequest(path, body) {
  let response
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: supabaseAnonKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
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
