import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRateLimiter } from '../src/middleware/rateLimit.js'

function responseRecorder() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name] = value },
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

test('AI rate limiter allows the configured quota then returns a retryable 429', () => {
  let now = 1_000
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => now })
  let passed = 0
  const request = { ip: '192.0.2.5' }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = responseRecorder()
    limiter(request, response, () => { passed += 1 })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['RateLimit-Remaining'], String(1 - attempt))
  }

  const blocked = responseRecorder()
  limiter(request, blocked, () => { passed += 1 })
  assert.equal(blocked.statusCode, 429)
  assert.equal(blocked.headers['Retry-After'], '60')
  assert.equal(blocked.body.error.code, 'RATE_LIMITED')
  assert.equal(passed, 2)

  now += 60_001
  const reset = responseRecorder()
  limiter(request, reset, () => { passed += 1 })
  assert.equal(reset.statusCode, 200)
  assert.equal(passed, 3)
})

test('AI rate limiter keeps separate quotas for separate client IPs', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 })
  const makeRequest = (ip) => {
    const response = responseRecorder()
    let passed = false
    limiter({ ip }, response, () => { passed = true })
    return { response, passed }
  }

  assert.equal(makeRequest('192.0.2.10').passed, true)
  assert.equal(makeRequest('192.0.2.10').response.statusCode, 429)
  assert.equal(makeRequest('192.0.2.11').passed, true)
})
