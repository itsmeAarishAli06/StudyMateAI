import { AppError } from '../lib/errors.js'

function getAiConfig() {
  return {
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    fallbackModel: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite',
    apiKey: process.env.GEMINI_API_KEY,
  }
}

export function hasAiProvider() {
  return Boolean(getAiConfig().apiKey)
}

async function requestModel(selectedModel, prompt, schema, apiKey) {
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
      signal: AbortSignal.timeout(30_000),
    })
}

export async function generateJson(prompt, schema) {
  const { model, fallbackModel, apiKey } = getAiConfig()
  if (!apiKey) return null

  let response
  let activeModel = model
  try {
    response = await requestModel(model, prompt, schema, apiKey)
  } catch (error) {
    console.error('Gemini connection failed:', error.cause?.code || error.name || 'network error')
    throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service could not be reached. Please try again.')
  }

  if ((response.status === 429 || response.status >= 500) && fallbackModel && fallbackModel !== model) {
    console.warn(`Gemini model ${model} is busy; retrying with the configured fallback model.`)
    activeModel = fallbackModel
    try {
      response = await requestModel(fallbackModel, prompt, schema, apiKey)
    } catch (error) {
      console.error('Gemini fallback connection failed:', error.cause?.code || error.name || 'network error')
      throw new AppError(503, 'AI_UNAVAILABLE', 'The AI service could not be reached. Please try again.')
    }
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
      throw new AppError(503, 'AI_RATE_LIMITED', 'The AI service is busy. Please try again shortly.')
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
