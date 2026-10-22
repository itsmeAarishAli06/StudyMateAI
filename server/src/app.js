import cors from 'cors'
import express from 'express'
import dotenv from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import healthRouter from './routes/health.js'
import chatRouter from './routes/chat.js'
import summariesRouter from './routes/summaries.js'
import quizzesRouter from './routes/quizzes.js'
import studyItemsRouter from './routes/studyItems.js'
import { createAiRateLimiterFromEnvironment } from './middleware/rateLimit.js'
import { requireAiAccount } from './middleware/requireSupabaseUser.js'

const serverDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: resolve(serverDirectory, '.env') })

const app = express()
const aiRateLimit = createAiRateLimiterFromEnvironment()
const trustProxySetting = process.env.TRUST_PROXY_HOPS || '0'
const trustProxyHops = /^\d+$/.test(trustProxySetting) ? Number(trustProxySetting) : 0
app.set('trust proxy', Number.isSafeInteger(trustProxyHops) ? trustProxyHops : 0)
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(new Error('Origin is not allowed by CORS.'))
  },
}))
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Cache-Control', 'no-store')
  next()
})
app.use(express.json({ limit: '20kb' }))

app.get('/', (_request, response) => {
  response.json({ name: 'StudyMate API', health: '/api/health' })
})

app.use('/api/health', healthRouter)
app.use('/api/chat', aiRateLimit, requireAiAccount, chatRouter)
app.use('/api/summaries', aiRateLimit, requireAiAccount, summariesRouter)
app.use('/api/quizzes', aiRateLimit, requireAiAccount, quizzesRouter)
app.use('/api/study-items', studyItemsRouter)

app.use((_request, response) => {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested API route was not found.',
    },
  })
})

app.use((error, _request, response, _next) => {
  if (error.status && error.code) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } })
    return
  }

  if (error.message === 'Origin is not allowed by CORS.') {
    response.status(403).json({
      error: { code: 'ORIGIN_NOT_ALLOWED', message: 'This origin is not allowed.' },
    })
    return
  }

  if (error.type === 'entity.too.large') {
    response.status(413).json({
      error: { code: 'REQUEST_TOO_LARGE', message: 'The request body is too large.' },
    })
    return
  }

  if (error.type === 'entity.parse.failed') {
    response.status(400).json({
      error: { code: 'INVALID_JSON', message: 'The request body must be valid JSON.' },
    })
    return
  }

  console.error('Unhandled request error:', error)
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' },
  })
})

export default app
