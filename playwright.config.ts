import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { defineConfig } from '@playwright/test'

const localEnvPath = join(process.cwd(), '.env.local')

if (existsSync(localEnvPath)) {
  for (const line of readFileSync(localEnvPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    if (process.env[key]) continue

    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')
    process.env[key] = value
  }
}

export default defineConfig({})
