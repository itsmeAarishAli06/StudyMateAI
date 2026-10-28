const defaultNow = () => Date.now()

export function createRateLimiter({ limit = 20, windowMs = 60_000, maxClients = 10_000, now = defaultNow } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || !Number.isFinite(windowMs) || windowMs < 1) {
    throw new TypeError('Rate limit and window must be positive values.')
  }
  const clients = new Map()
  let nextSweepAt = 0

  return (request, response, next) => {
    const currentTime = now()
    const clientId = request.ip || request.socket?.remoteAddress || 'unknown'
    let bucket = clients.get(clientId)

    if (!bucket || bucket.resetAt <= currentTime) {
      bucket = { count: 0, resetAt: currentTime + windowMs }
      clients.set(clientId, bucket)
    }

    if (clients.size > maxClients || currentTime >= nextSweepAt) {
      for (const [key, entry] of clients) {
        if (entry.resetAt <= currentTime) clients.delete(key)
      }
      while (clients.size > maxClients) clients.delete(clients.keys().next().value)
      nextSweepAt = currentTime + windowMs
    }

    bucket.count += 1
    const remaining = Math.max(0, limit - bucket.count)
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000))
    response.setHeader('RateLimit-Limit', String(limit))
    response.setHeader('RateLimit-Remaining', String(remaining))
    response.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)))

    if (bucket.count > limit) {
      response.setHeader('Retry-After', String(retryAfter))
      response.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many AI requests. Please try again shortly.' },
      })
      return
    }

    next()
  }
}

export function createAiRateLimiterFromEnvironment() {
  const configuredLimit = Number.parseInt(process.env.AI_RATE_LIMIT_PER_MINUTE || '20', 10)
  return createRateLimiter({ limit: Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 20 })
}

let sharedAiRateLimiter
export function getSharedAiRateLimiter() {
  if (!sharedAiRateLimiter) sharedAiRateLimiter = createAiRateLimiterFromEnvironment()
  return sharedAiRateLimiter
}
