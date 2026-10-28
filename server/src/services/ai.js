import { AppError } from '../lib/errors.js'

function getAiConfig() {
  const configuredTimeout = Number.parseInt(process.env.GEMINI_REQUEST_TIMEOUT_MS || '20000', 10)
  const model = process.env.GEMINI_MODEL?.trim()
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL?.trim()
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  return {
    model: model || 'gemini-3.6-flash',
    fallbackModel: fallbackModel || 'gemini-3.5-flash-lite',
    apiKey,
    timeoutMs: Number.isInteger(configuredTimeout) && configuredTimeout >= 5000 && configuredTimeout <= 30000
      ? configuredTimeout
      : 20000,
  }
}

export function hasAiProvider() {
  return Boolean(getAiConfig().apiKey)
}

async function requestModel(selectedModel, prompt, schema, apiKey, timeoutMs) {
  return fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: selectedModel,
        input: prompt,
        response_format: { type: 'text', mime_type: 'application/json', schema },
        store: false,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
}

export async function generateJson(prompt, schema) {
  const { model, fallbackModel, apiKey, timeoutMs } = getAiConfig()
  if (!apiKey) return null

  let response
  let activeModel = model
  let primaryError
  try {
    response = await requestModel(model, prompt, schema, apiKey, timeoutMs)
  } catch (error) {
    primaryError = error
    console.warn(`Gemini model ${model} request failed; checking the configured fallback model.`, error.cause?.code || error.name || 'network error')
  }

  if ((!response || response.status === 429 || response.status >= 500) && fallbackModel && fallbackModel !== model) {
    console.warn(`Gemini model ${model} had a transient failure; retrying with the configured fallback model.`)
    activeModel = fallbackModel
    try {
      response = await requestModel(fallbackModel, prompt, schema, apiKey, timeoutMs)
    } catch (error) {
      console.error('Gemini fallback connection failed:', error.cause?.code || error.name || 'network error')
      if (error.name === 'TimeoutError') {
        throw new AppError(503, 'AI_TIMEOUT', 'Gemini is taking too long to respond. Please try again shortly.')
      }
      throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service could not be reached. Please try again.')
    }
  }

  if (!response) {
    if (primaryError?.name === 'TimeoutError') {
      throw new AppError(503, 'AI_TIMEOUT', 'Gemini is taking too long to respond. Please try again shortly.')
    }
    throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service could not be reached. Please try again.')
  }

  if (!response.ok) {
    let providerMessage = ''
    try {
      providerMessage = (await response.json()).error?.message || ''
    } catch {
      // Provider error bodies are not always JSON.
    }
    if (response.status === 429) {
      console.error(`Gemini request rate limited on ${activeModel}:`, providerMessage || response.status)
      throw new AppError(503, 'AI_RATE_LIMITED', 'Gemini has reached its current request limit. Wait about a minute and try again; if this keeps happening, check your Gemini API quota in Google AI Studio.')
    }
    if (response.status >= 500) {
      console.error(`Gemini service unavailable on ${activeModel}:`, providerMessage || response.status)
      throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service is temporarily unavailable.')
    }
    console.error(`Gemini request rejected on ${activeModel}:`, response.status, providerMessage || 'Provider returned a client error.')
    if ([400, 401, 403].includes(response.status)) {
      throw new AppError(502, 'AI_CONFIGURATION_ERROR', 'Gemini rejected the request. Check the API key and model configured in server/.env.')
    }
    throw new AppError(502, 'AI_REQUEST_FAILED', 'The AI service could not process this request.')
  }

  let payload
  try {
    payload = await response.json()
    const text = payload.output_text || payload.steps
      ?.filter((step) => step.type === 'model_output')
      .flatMap((step) => step.content || [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text || '')
      .join('')
    if (!text) throw new Error('Empty model response')
    return JSON.parse(text)
  } catch {
    throw new AppError(502, 'AI_INVALID_RESPONSE', 'The AI service returned an invalid response. Please try again.')
  }
}
