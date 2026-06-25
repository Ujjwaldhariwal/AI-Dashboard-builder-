'use client'

import { AlertTriangle, Database, Loader2, Play, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

interface PublishedDatasetPreviewProps {
  tenantSlug: string
  datasetId: string
}

interface DatasetRunResult {
  result?: {
    fields?: string[]
    rows?: Record<string, unknown>[]
    rowCount?: number
    elapsedMs?: number
    warnings?: string[]
  } | null
  error?: string
  warnings?: string[]
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') return new Intl.NumberFormat('en').format(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toLocaleString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function PublishedDatasetPreview({ tenantSlug, datasetId }: PublishedDatasetPreviewProps) {
  const [data, setData] = useState<DatasetRunResult['result']>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function loadPreview() {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/client/${encodeURIComponent(tenantSlug)}/datasets/${encodeURIComponent(datasetId)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await response.json() as DatasetRunResult

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load dataset preview')
      }

      setData(payload.result ?? null)
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : String(previewError))
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }

  const fields = data?.fields?.slice(0, 6) ?? []
  const rows = data?.rows?.slice(0, 5) ?? []
  const warnings = data?.warnings ?? []

  return (
    <div className="mt-4 rounded-md border border-[#272822]/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#272822]/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Database className="h-4 w-4 text-[#66d9ef]" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#272822]">Live preview</p>
            <p className="truncate text-[11px] text-[#75715e]">
              {data ? `${data.rowCount ?? rows.length} rows / ${data.elapsedMs ?? 0}ms` : 'Run a read-only dataset query'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 border-[#66d9ef]/40 bg-[#66d9ef]/10 px-2 text-xs text-[#13515e] hover:bg-[#66d9ef]/20"
          onClick={loadPreview}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : data ? (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          ) : (
            <Play className="mr-2 h-3.5 w-3.5" />
          )}
          {data ? 'Reload' : 'Preview'}
        </Button>
      </div>

      {error ? (
        <div className="flex gap-2 px-3 py-3 text-xs text-[#b13d00]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="border-b border-[#fd971f]/20 bg-[#fd971f]/10 px-3 py-2 text-[11px] text-[#8a4b00]">
          {warnings.slice(0, 2).join(' / ')}
        </div>
      ) : null}

      {data && fields.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] table-fixed text-left text-xs">
            <thead className="bg-[#f8f8f2] text-[11px] uppercase text-[#75715e]">
              <tr>
                {fields.map(field => (
                  <th key={field} className="w-36 truncate px-3 py-2 font-medium">
                    {field}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#272822]/10">
              {rows.length > 0 ? rows.map((row, index) => (
                <tr key={`${datasetId}-${index}`}>
                  {fields.map(field => (
                    <td key={field} className="truncate px-3 py-2 text-[#3e3d32]">
                      {formatCellValue(row[field])}
                    </td>
                  ))}
                </tr>
              )) : (
                <tr>
                  <td className="px-3 py-3 text-[#75715e]" colSpan={fields.length}>
                    Query returned no rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : data ? (
        <div className="px-3 py-3 text-xs text-[#75715e]">No preview columns returned.</div>
      ) : (
        <div className="px-3 py-3 text-xs text-[#75715e]">
          Preview is loaded only when requested.
        </div>
      )}
    </div>
  )
}
