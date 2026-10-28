import { afterEach, describe, expect, it, vi } from 'vitest'

describe('Supabase auth client', () => {
  afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('signs in with Supabase and stores only the session fields needed by the app', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://study.example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key')
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      access_token: 'access-123', refresh_token: 'refresh-123', expires_in: 3600,
      user: { id: 'user-123', email: 'learner@example.com', app_metadata: { private: 'discarded' } },
    }) })
    vi.stubGlobal('fetch', fetch)
    const { authConfigured, signIn } = await import('./auth.js')

    expect(authConfigured).toBe(true)
    const session = await signIn('learner@example.com', 'correct-password')
    expect(session.user).toEqual({ id: 'user-123', email: 'learner@example.com' })
    expect(fetch).toHaveBeenCalledWith('https://study.example.supabase.co/auth/v1/token?grant_type=password', expect.objectContaining({
      method: 'POST',
      headers: { apikey: 'public-test-key', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'learner@example.com', password: 'correct-password' }),
    }))
    expect(JSON.parse(window.localStorage.getItem('studymate.supabase.session')).access_token).toBe('access-123')
  })

  it('handles email-confirmation signup without pretending a session exists', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://study.example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user: { id: 'user-123', email: 'learner@example.com' } }) }))
    const { signUp } = await import('./auth.js')

    await expect(signUp('learner@example.com', 'correct-password')).resolves.toBeNull()
    expect(window.localStorage.getItem('studymate.supabase.session')).toBeNull()
  })

  it('refreshes expired sessions and clears sessions that cannot be renewed', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://study.example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key')
    window.localStorage.setItem('studymate.supabase.session', JSON.stringify({ access_token: 'expired', refresh_token: 'refresh-123', expires_at: 1, user: { id: 'user-123' } }))
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'renewed', refresh_token: 'refresh-456', expires_in: 3600, user: { id: 'user-123', email: 'learner@example.com' } }) })
    vi.stubGlobal('fetch', fetch)
    const { getSession } = await import('./auth.js')

    await expect(getSession()).resolves.toMatchObject({ access_token: 'renewed', refresh_token: 'refresh-456' })
    expect(fetch).toHaveBeenCalledWith('https://study.example.supabase.co/auth/v1/token?grant_type=refresh_token', expect.any(Object))

    window.localStorage.setItem('studymate.supabase.session', JSON.stringify({ access_token: 'expired', refresh_token: 'bad', expires_at: 1, user: { id: 'user-123' } }))
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'invalid refresh token' }) })
    await expect(getSession()).resolves.toBeNull()
    expect(window.localStorage.getItem('studymate.supabase.session')).toBeNull()
  })

  it('requests password reset through Supabase Auth with the configured redirect URL', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://study.example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key')
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetch)
    const { requestPasswordReset } = await import('./auth.js')

    await requestPasswordReset('learner@example.com', 'https://studymate.onrender.com/?flow=recovery')
    expect(fetch).toHaveBeenCalledWith('https://study.example.supabase.co/auth/v1/recover?redirect_to=https%3A%2F%2Fstudymate.onrender.com%2F%3Fflow%3Drecovery', expect.objectContaining({
      method: 'POST',
      headers: { apikey: 'public-test-key', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'learner@example.com' }),
    }))
  })

  it('verifies the recovery token with Supabase, stores the recovery session, and removes tokens from the URL', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://study.example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key')
    window.history.replaceState({}, '', '/?flow=recovery#access_token=recovery-access&refresh_token=recovery-refresh&expires_in=3600&type=recovery')
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'user-123', email: 'learner@example.com' }) })
    vi.stubGlobal('fetch', fetch)
    const { consumePasswordRecovery } = await import('./auth.js')

    await expect(consumePasswordRecovery()).resolves.toMatchObject({
      access_token: 'recovery-access',
      refresh_token: 'recovery-refresh',
      user: { id: 'user-123', email: 'learner@example.com' },
    })
    expect(fetch).toHaveBeenCalledWith('https://study.example.supabase.co/auth/v1/user', expect.objectContaining({
      headers: { apikey: 'public-test-key', authorization: 'Bearer recovery-access' },
    }))
    expect(window.localStorage.getItem('studymate.supabase.session')).toContain('recovery-access')
    expect(window.location.href).not.toContain('recovery-access')
  })
})
