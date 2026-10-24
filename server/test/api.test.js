import assert from 'node:assert/strict'
import { after, test } from 'node:test'

// Keep endpoint tests deterministic even when a developer has a local Gemini key.
process.env.GEMINI_API_KEY = ''
process.env.SUPABASE_URL = ''
process.env.SUPABASE_ANON_KEY = ''
const { default: app } = await import('../src/app.js')

const server = app.listen(0)
await new Promise((resolve) => server.once('listening', resolve))
const baseUrl = `http://127.0.0.1:${server.address().port}`
after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))

async function post(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function authorizedRequest(path, { method = 'GET', body, fakeFetch } = {}) {
  const nativeFetch = globalThis.fetch
  globalThis.fetch = (input, init) => new URL(input).origin === new URL(baseUrl).origin
    ? nativeFetch(input, init)
    : fakeFetch(input, init)
  try {
    return await nativeFetch(`${baseUrl}${path}`, {
      method,
      headers: { authorization: 'Bearer test-access-token', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } finally {
    globalThis.fetch = nativeFetch
  }
}

test('POST /api/chat returns an answer and rejects blank input', async () => {
  const success = await post('/api/chat', { message: 'Explain photosynthesis simply' })
  assert.equal(success.status, 200)
  assert.match((await success.json()).answer, /Photosynthesis/)

  const invalid = await post('/api/chat', { message: '  ' })
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR')
})

test('POST /api/summaries returns a structured summary and validates note length', async () => {
  const success = await post('/api/summaries', {
    title: 'Cell energy',
    notes: 'Cells use glucose to release energy. Glycolysis begins in the cytoplasm. Oxygen supports later stages.',
  })
  assert.equal(success.status, 200)
  const payload = await success.json()
  assert.equal(payload.title, 'Cell energy')
  assert.equal(typeof payload.content.lead, 'string')
  assert.ok(Array.isArray(payload.content.points))
  assert.equal(typeof payload.content.takeaway, 'string')

  const invalid = await post('/api/summaries', { notes: 'x'.repeat(12_001) })
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR')
})

test('POST /api/quizzes returns requested questions and validates count', async () => {
  const success = await post('/api/quizzes', { topic: 'Photosynthesis', questionCount: 3 })
  assert.equal(success.status, 200)
  const payload = await success.json()
  assert.equal(payload.questions.length, 3)
  assert.equal(typeof payload.title, 'string')
  for (const question of payload.questions) {
    assert.equal(question.options.length, 4)
    assert.ok(question.answer >= 0 && question.answer < 4)
    assert.equal(typeof question.explanation, 'string')
  }

  const invalid = await post('/api/quizzes', { topic: 'Biology', questionCount: 4 })
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR')
})

test('AI routes require a verified account when Supabase is configured', async () => {
  const oldUrl = process.env.SUPABASE_URL
  const oldKey = process.env.SUPABASE_ANON_KEY
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'public-test-key'
  try {
    const missing = await post('/api/chat', { message: 'Explain photosynthesis' })
    assert.equal(missing.status, 401)
    assert.equal((await missing.json()).error.code, 'AUTH_REQUIRED')

    const authorized = await authorizedRequest('/api/chat', {
      method: 'POST',
      body: { message: 'Explain photosynthesis' },
      fakeFetch: async (input) => new URL(input).pathname === '/auth/v1/user'
        ? Response.json({ id: 'user-123' })
        : Response.json([{ allowed: true, used: 1, remaining: 39, daily_limit: 40, resets_at: '2026-10-25T00:00:00Z' }]),
    })
    assert.equal(authorized.status, 200)
    assert.match((await authorized.json()).answer, /Photosynthesis/)
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY
    else process.env.SUPABASE_ANON_KEY = oldKey
  }
})

test('GET /api/ai-usage returns only the verified user daily quota', async () => {
  const oldUrl = process.env.SUPABASE_URL
  const oldKey = process.env.SUPABASE_ANON_KEY
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'public-test-key'
  try {
    const missing = await fetch(`${baseUrl}/api/ai-usage`)
    assert.equal(missing.status, 401)

    const response = await authorizedRequest('/api/ai-usage', {
      fakeFetch: async (input) => {
        const url = new URL(input)
        if (url.pathname === '/auth/v1/user') return Response.json({ id: 'user-usage-123' })
        assert.equal(url.pathname, '/rest/v1/rpc/get_ai_daily_usage')
        return Response.json([{ used: 7, remaining: 33, daily_limit: 40, resets_at: '2026-10-25T00:00:00Z' }])
      },
    })
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).usage, {
      used: 7, remaining: 33, dailyLimit: 40, resetsAt: '2026-10-25T00:00:00Z',
    })
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY
    else process.env.SUPABASE_ANON_KEY = oldKey
  }
})

test('AI generation enforces the persistent per-user daily limit and fails closed on quota database errors', async () => {
  const oldUrl = process.env.SUPABASE_URL
  const oldKey = process.env.SUPABASE_ANON_KEY
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'public-test-key'
  const fakeFetch = async (input) => {
    const url = new URL(input)
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'user-quota-123' })
    if (url.pathname === '/rest/v1/rpc/consume_ai_daily_request') {
      return Response.json([{ allowed: false, used: 40, remaining: 0, daily_limit: 40, resets_at: '2026-10-25T00:00:00Z' }])
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }
  try {
    const limited = await authorizedRequest('/api/chat', {
      method: 'POST', body: { message: 'Explain photosynthesis' }, fakeFetch,
    })
    assert.equal(limited.status, 429)
    const payload = await limited.json()
    assert.equal(payload.error.code, 'AI_DAILY_LIMIT_REACHED')
    assert.equal(payload.error.details.usage.remaining, 0)

    const unavailable = await authorizedRequest('/api/chat', {
      method: 'POST', body: { message: 'Explain photosynthesis' },
      fakeFetch: async (input) => {
        if (new URL(input).pathname === '/auth/v1/user') return Response.json({ id: 'user-quota-123' })
        return Response.json({ message: 'private database detail' }, { status: 500 })
      },
    })
    assert.equal(unavailable.status, 503)
    assert.equal((await unavailable.json()).error.code, 'AI_QUOTA_UNAVAILABLE')
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY
    else process.env.SUPABASE_ANON_KEY = oldKey
  }
})

test('production AI generation fails closed when account quota configuration is missing', async () => {
  const oldNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    const response = await post('/api/chat', { message: 'Explain photosynthesis' })
    assert.equal(response.status, 503)
    assert.equal((await response.json()).error.code, 'AI_QUOTA_UNAVAILABLE')
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = oldNodeEnv
  }
})

test('chat, summary, and quiz all consume one quota unit after request validation', async () => {
  const oldUrl = process.env.SUPABASE_URL
  const oldKey = process.env.SUPABASE_ANON_KEY
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'public-test-key'
  let consumeCalls = 0
  const fakeFetch = async (input) => {
    const url = new URL(input)
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'user-tools-123' })
    if (url.pathname === '/rest/v1/rpc/consume_ai_daily_request') {
      consumeCalls += 1
      return Response.json([{ allowed: true, used: consumeCalls, remaining: 40 - consumeCalls, daily_limit: 40, resets_at: '2026-10-25T00:00:00Z' }])
    }
    throw new Error(`Unexpected request: ${url.pathname}`)
  }
  try {
    const invalid = await authorizedRequest('/api/chat', { method: 'POST', body: { message: ' ' }, fakeFetch })
    assert.equal(invalid.status, 400)
    assert.equal(consumeCalls, 0)

    const requests = [
      ['/api/chat', { message: 'Explain photosynthesis' }],
      ['/api/summaries', { notes: 'Photosynthesis turns light, water, and carbon dioxide into glucose and oxygen.' }],
      ['/api/quizzes', { topic: 'Photosynthesis', questionCount: 3 }],
    ]
    for (const [path, body] of requests) {
      const response = await authorizedRequest(path, { method: 'POST', body, fakeFetch })
      assert.equal(response.status, 200, path)
    }
    assert.equal(consumeCalls, 3)
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY
    else process.env.SUPABASE_ANON_KEY = oldKey
  }
})

test('GET /api/study-items requires Supabase configuration and a verified session', async () => {
  const oldUrl = process.env.SUPABASE_URL
  const oldKey = process.env.SUPABASE_ANON_KEY
  delete process.env.SUPABASE_URL
  delete process.env.SUPABASE_ANON_KEY
  try {
    const unconfigured = await fetch(`${baseUrl}/api/study-items`)
    assert.equal(unconfigured.status, 503)
    assert.equal((await unconfigured.json()).error.code, 'SUPABASE_NOT_CONFIGURED')

    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'public-test-key'
    const missing = await fetch(`${baseUrl}/api/study-items`)
    assert.equal(missing.status, 401)
    assert.equal((await missing.json()).error.code, 'AUTH_REQUIRED')

    const invalidSession = await authorizedRequest('/api/study-items', { fakeFetch: async () => new Response('{}', { status: 401 }) })
    assert.equal(invalidSession.status, 401)
    assert.equal((await invalidSession.json()).error.code, 'INVALID_SESSION')
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY
    else process.env.SUPABASE_ANON_KEY = oldKey
  }
})

test('study item API validates input and persists user-scoped summary and quiz records', async () => {
  const oldUrl = process.env.SUPABASE_URL
  const oldKey = process.env.SUPABASE_ANON_KEY
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'public-test-key'
  const rows = []
  const nativeFetch = globalThis.fetch
  globalThis.fetch = (input, init) => {
    const url = new URL(input)
    if (url.origin === new URL(baseUrl).origin) return nativeFetch(input, init)
    if (url.pathname === '/auth/v1/user') return Promise.resolve(Response.json({ id: 'user-123', email: 'learner@example.com' }))
    if (url.pathname === '/rest/v1/study_items' && init?.method === 'POST') {
      const row = JSON.parse(init.body)
      rows.unshift({ id: `row-${rows.length + 1}`, created_at: '2026-10-22T10:00:00.000Z', ...row })
      return Promise.resolve(Response.json(rows.slice(0, 1), { status: 201 }))
    }
    if (url.pathname === '/rest/v1/study_items') return Promise.resolve(Response.json(rows))
    throw new Error(`Unexpected mock Supabase request: ${url.pathname}`)
  }
  try {
    const invalid = await authorizedRequest('/api/study-items', { method: 'POST', body: { type: 'summary', title: '' }, fakeFetch: globalThis.fetch })
    assert.equal(invalid.status, 400)
    assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR')
    assert.equal(rows.length, 0)

    const invalidQuiz = await authorizedRequest('/api/study-items', {
      method: 'POST',
      body: { type: 'quiz', title: 'Bad score', score: '9 / 1', questions: [{ question: 'Question?', options: ['A', 'B', 'C', 'D'], answer: 0, explanation: 'Because.' }] },
      fakeFetch: globalThis.fetch,
    })
    assert.equal(invalidQuiz.status, 400)
    assert.equal(rows.length, 0)

    const summaryBody = { type: 'summary', title: 'Cell energy', sourceText: 'Cells use glucose to release energy.', content: { lead: 'Cells release usable energy.', points: ['Glucose is metabolized.'], takeaway: 'ATP powers work.' } }
    const savedSummary = await authorizedRequest('/api/study-items', { method: 'POST', body: summaryBody, fakeFetch: globalThis.fetch })
    assert.equal(savedSummary.status, 201)
    const summary = (await savedSummary.json()).item
    assert.equal(summary.type, 'summary')
    assert.equal(summary.content.takeaway, 'ATP powers work.')
    assert.equal(rows[0].user_id, 'user-123')

    const savedQuiz = await authorizedRequest('/api/study-items', {
      method: 'POST',
      body: { type: 'quiz', title: 'Cell energy quiz', score: '1 / 1', questions: [{ question: 'What stores cellular energy?', options: ['ATP', 'DNA', 'RNA', 'Water'], answer: 0, explanation: 'ATP is the main energy currency.' }] },
      fakeFetch: globalThis.fetch,
    })
    assert.equal(savedQuiz.status, 201)
    assert.equal((await savedQuiz.json()).item.questions.length, 1)

    const history = await authorizedRequest('/api/study-items', { fakeFetch: globalThis.fetch })
    assert.equal(history.status, 200)
    assert.deepEqual((await history.json()).items.map((item) => item.type), ['quiz', 'summary'])
  } finally {
    globalThis.fetch = nativeFetch
    if (oldUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY
    else process.env.SUPABASE_ANON_KEY = oldKey
  }
})

test('study item API returns a safe service error when Postgres is unavailable', async () => {
  const oldUrl = process.env.SUPABASE_URL
  const oldKey = process.env.SUPABASE_ANON_KEY
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_ANON_KEY = 'public-test-key'
  try {
    const failed = await authorizedRequest('/api/study-items', { fakeFetch: async (input) => {
      if (new URL(input).pathname === '/auth/v1/user') return Response.json({ id: 'user-123' })
      return Response.json({ message: 'database details must not leak' }, { status: 500 })
    } })
    assert.equal(failed.status, 503)
    const payload = await failed.json()
    assert.equal(payload.error.code, 'DATABASE_ERROR')
    assert.doesNotMatch(payload.error.message, /database details/)
  } finally {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = oldUrl
    if (oldKey === undefined) delete process.env.SUPABASE_ANON_KEY
    else process.env.SUPABASE_ANON_KEY = oldKey
  }
})
