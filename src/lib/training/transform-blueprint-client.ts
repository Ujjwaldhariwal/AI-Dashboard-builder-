import type { TransformOp } from '@/types/widget'

interface SaveTransformBlueprintPayload {
  dashboardId?: string
  endpointId: string
  endpointName: string
  prompt?: string
  transforms: TransformOp[]
  sampleData?: unknown[]
}

export async function saveTransformBlueprint(
  payload: SaveTransformBlueprintPayload,
): Promise<void> {
  const response = await fetch('/api/training/transform-blueprints', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Failed to save transform blueprint (${response.status})`)
  }
}
