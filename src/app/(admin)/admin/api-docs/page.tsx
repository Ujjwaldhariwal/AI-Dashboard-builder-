import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { BookOpen, CheckCircle2, FolderTree, LockKeyhole } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

interface ApiDocEndpoint {
  method: string
  path: string
  body: string
}

function parseApiInventory(markdown: string) {
  const endpoints: ApiDocEndpoint[] = []
  const endpointRegex = /^### `([A-Z]+) ([^`]+)`\n([\s\S]*?)(?=^### `|^## Apidog Sprint Notes|(?![\s\S]))/gm
  let match: RegExpExecArray | null

  while ((match = endpointRegex.exec(markdown)) !== null) {
    endpoints.push({
      method: match[1],
      path: match[2],
      body: match[3].trim(),
    })
  }

  const folders = Array.from(markdown.matchAll(/^- `([^`]+)`$/gm)).map(folder => folder[1])
  return { endpoints, folders }
}

function methodClass(method: string) {
  if (method === 'GET') return 'border-[#66d9ef]/30 bg-[#66d9ef]/10 text-[#9beaff]'
  if (method === 'POST') return 'border-[#a6e22e]/30 bg-[#a6e22e]/10 text-[#d7ff8f]'
  if (method === 'PATCH') return 'border-[#fd971f]/30 bg-[#fd971f]/10 text-[#ffd866]'
  return 'border-white/15 bg-white/5 text-slate-300'
}

function extractLine(body: string, label: string) {
  const line = body.split('\n').find(item => item.startsWith(`${label}:`))
  return line?.replace(`${label}:`, '').trim() || 'Not specified'
}

export default async function AdminApiDocsPage() {
  const docPath = path.join(process.cwd(), 'docs', 'apidog-api-inventory.md')
  const markdown = await readFile(docPath, 'utf8')
  const { endpoints, folders } = parseApiInventory(markdown)
  const adminCount = endpoints.filter(endpoint => endpoint.path.startsWith('/api/admin')).length
  const clientCount = endpoints.filter(endpoint => endpoint.path.startsWith('/api/client')).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[#a6e22e]">Apidog Sync</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-50">DB to Dashboard API Inventory</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Internal checklist for mirroring platform endpoints into the Apidog `DB to DASHBOARD` folder.
          </p>
        </div>
        <Badge className="bg-[#66d9ef]/15 text-[#9beaff] hover:bg-[#66d9ef]/20">
          {endpoints.length} endpoints
        </Badge>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <BookOpen className="h-4 w-4 text-[#66d9ef]" />
            API Methods
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-50">{endpoints.length}</p>
          <p className="mt-1 text-xs text-slate-500">Tracked from `docs/apidog-api-inventory.md`</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <LockKeyhole className="h-4 w-4 text-[#a6e22e]" />
            Access Split
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-50">{adminCount} / {clientCount}</p>
          <p className="mt-1 text-xs text-slate-500">Admin endpoints / client runtime endpoints</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <FolderTree className="h-4 w-4 text-[#fd971f]" />
            Apidog Folders
          </div>
          <p className="mt-3 text-2xl font-semibold text-slate-50">{folders.length}</p>
          <p className="mt-1 text-xs text-slate-500">Recommended folder groups</p>
        </div>
      </section>

      <section className="rounded-lg border border-[#fd971f]/20 bg-[#fd971f]/10 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#ffd866]" />
          <div>
            <h2 className="text-sm font-semibold text-[#ffd866]">Apidog import policy</h2>
            <p className="mt-1 text-xs leading-5 text-slate-300">
              Keep this page as the internal source of truth. Add or update endpoints here first, then mirror them into Apidog with
              session/cookie auth, sample IDs, masked credential fields, and success/error examples.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Folder Plan</h2>
          <div className="mt-3 space-y-2">
            {folders.map(folder => (
              <div key={folder} className="rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                {folder}
              </div>
            ))}
          </div>
        </aside>

        <div className="space-y-3">
          {endpoints.map(endpoint => (
            <article key={`${endpoint.method}-${endpoint.path}`} className="rounded-lg border border-white/10 bg-slate-900/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={methodClass(endpoint.method)}>
                      {endpoint.method}
                    </Badge>
                    <code className="rounded bg-slate-950/70 px-2 py-1 text-xs text-slate-200">{endpoint.path}</code>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">{extractLine(endpoint.body, 'Purpose')}</p>
                  <p className="mt-1 text-xs text-slate-500">Auth: {extractLine(endpoint.body, 'Auth')}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
