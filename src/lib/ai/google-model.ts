import { createGoogleGenerativeAI } from '@ai-sdk/google'

const GOOGLE_API_KEY_ENV_CANDIDATES = [
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GEMINI_API_KEY',
] as const

export function getGoogleApiKey(): string | null {
  for (const key of GOOGLE_API_KEY_ENV_CANDIDATES) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return null
}

export function getGoogleModel(modelId = 'gemini-2.5-flash') {
  const apiKey = getGoogleApiKey()
  if (!apiKey) {
    throw new Error(
      'Missing Google AI key. Set GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY in .env.local and restart dev server.',
    )
  }
  const google = createGoogleGenerativeAI({ apiKey })
  return google(modelId)
}

