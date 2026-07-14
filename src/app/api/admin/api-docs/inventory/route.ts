import { NextResponse } from 'next/server'

import { readApiInventory } from '@/lib/api-docs/inventory'
import { getAuthedSupabase } from '@/lib/supabase/server'

export async function GET() {
  try {
    const auth = await getAuthedSupabase()
    if (!auth) return NextResponse.json({ inventory: null, error: 'Unauthorized' }, { status: 401 })

    const inventory = await readApiInventory()
    return NextResponse.json({
      inventory: {
        ...inventory,
        counts: {
          endpoints: inventory.endpoints.length,
          admin: inventory.endpoints.filter(endpoint => endpoint.path.startsWith('/api/admin')).length,
          client: inventory.endpoints.filter(endpoint => endpoint.path.startsWith('/api/client')).length,
          folders: inventory.folders.length,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ inventory: null, error: message }, { status: 500 })
  }
}
