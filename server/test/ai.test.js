import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AppError } from '../src/lib/errors.js'

test('Gemini adapter reads configuration loaded after module initialization', async () => {
  const previousKey = process.env.GEMINI_API_KEY
  const previousFetch = globalThis.fetch
  delete process.env.GEMINI_API_KEY
  const { generateJson } = await import('../src/services/ai.js?late-config-test')
  process.env.GEMINI_API_KEY = 'test-only-server-secret'
  globalThis.fetch = async () => new Response(JSON.stringify({ output_text: '{"answer":"Configured after import"}' }), { status: 200 })
  try {
    assert.deepEqual(await generateJson('test prompt', {}), { answer: 'Configured after import' })
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})

test('Gemini adapter sends its API key in a server-side request header', async () => {
  const previousKey = process.env.GEMINI_API_KEY
  const previousFetch = globalThis.fetch
  process.env.GEMINI_API_KEY = 'test-only-server-secret'
  const { generateJson } = await import('../src/services/ai.js?provider-test')
  let capturedRequest
  globalThis.fetch = async (url, options) => {
    capturedRequest = { url, options }
    return new Response(JSON.stringify({
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"answer":"Test response"}' }] }],
    }), { status: 200 })
  }

  try {
    assert.deepEqual(await generateJson('test prompt', {
      type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'],
    }), { answer: 'Test response' })
    assert.equal(capturedRequest.url, 'https://generativelanguage.googleapis.com/v1beta/interactions')
    assert.equal(capturedRequest.options.headers['x-goog-api-key'], 'test-only-server-secret')
    assert.equal(capturedRequest.options.headers['content-type'], 'application/json')
    const body = JSON.parse(capturedRequest.options.body)
    assert.equal(body.model, 'gemini-3.6-flash')
    assert.equal(body.store, false)
    assert.equal(body.generation_config, undefined)
    assert.equal(body.response_format.mime_type, 'application/json')
    assert.equal(body.response_format.schema.required[0], 'answer')
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})

test('Gemini configuration failures return a safe actionable error', async () => {
  const previousKey = process.env.GEMINI_API_KEY
  const previousFetch = globalThis.fetch
  process.env.GEMINI_API_KEY = 'test-only-server-secret'
  const { generateJson } = await import('../src/services/ai.js?provider-error-test')
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'invalid API key detail' } }), { status: 403 })

  try {
    await assert.rejects(generateJson('test prompt'), (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'AI_CONFIGURATION_ERROR')
      assert.match(error.message, /server\/\.env/)
      assert.doesNotMatch(error.message, /invalid API key detail/)
      return true
    })
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})

test('Gemini capacity failures return a retryable service error', async () => {
  const previousKey = process.env.GEMINI_API_KEY
  const previousFetch = globalThis.fetch
  process.env.GEMINI_API_KEY = 'test-only-server-secret'
  const { generateJson } = await import('../src/services/ai.js?provider-capacity-test')
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'model is experiencing high demand' } }), { status: 503 })

  try {
    await assert.rejects(generateJson('test prompt', {}), (error) => {
      assert.ok(error instanceof AppError)
      assert.equal(error.code, 'AI_UNAVAILABLE')
      assert.match(error.message, /temporarily unavailable/)
      return true
    })
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})

test('Gemini retries a capacity failure with the configured fallback model', async () => {
  const previousKey = process.env.GEMINI_API_KEY
  const previousFallback = process.env.GEMINI_FALLBACK_MODEL
  const previousFetch = globalThis.fetch
  process.env.GEMINI_API_KEY = 'test-only-server-secret'
  process.env.GEMINI_FALLBACK_MODEL = 'gemini-test-fallback'
  const { generateJson } = await import('../src/services/ai.js?provider-fallback-test')
  const models = []
  globalThis.fetch = async (_url, options) => {
    const selectedModel = JSON.parse(options.body).model
    models.push(selectedModel)
    if (models.length === 1) return new Response(JSON.stringify({ error: { message: 'primary model busy' } }), { status: 503 })
    return new Response(JSON.stringify({ output_text: '{"answer":"Recovered response"}' }), { status: 200 })
  }

  try {
    assert.deepEqual(await generateJson('test prompt', { type: 'object' }), { answer: 'Recovered response' })
    assert.deepEqual(models, ['gemini-3.6-flash', 'gemini-test-fallback'])
  } finally {
    globalThis.fetch = previousFetch
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
    if (previousFallback === undefined) delete process.env.GEMINI_FALLBACK_MODEL
    else process.env.GEMINI_FALLBACK_MODEL = previousFallback
  }
})
