import { readFile } from 'node:fs/promises'
import path from 'node:path'

export interface ApiDocEndpoint {
  method: string
  path: string
  body: string
  purpose: string
  auth: string
}

function extractLine(body: string, label: string) {
  const line = body.split('\n').find(item => item.startsWith(`${label}:`))
  return line?.replace(`${label}:`, '').trim() || 'Not specified'
}

export function parseApiInventory(markdown: string) {
  const endpoints: ApiDocEndpoint[] = []
  const endpointRegex = /^### `([A-Z]+) ([^`]+)`\n([\s\S]*?)(?=^### `|^## Apidog Sprint Notes|(?![\s\S]))/gm
  let match: RegExpExecArray | null

  while ((match = endpointRegex.exec(markdown)) !== null) {
    const body = match[3].trim()
    endpoints.push({
      method: match[1],
      path: match[2],
      body,
      purpose: extractLine(body, 'Purpose'),
      auth: extractLine(body, 'Auth'),
    })
  }

  const folders = Array.from(markdown.matchAll(/^- `([^`]+)`$/gm)).map(folder => folder[1])
  return { endpoints, folders }
}

export async function readApiInventory() {
  const docPath = path.join(process.cwd(), 'docs', 'apidog-api-inventory.md')
  const markdown = await readFile(docPath, 'utf8')
  return parseApiInventory(markdown)
}
