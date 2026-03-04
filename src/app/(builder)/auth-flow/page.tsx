'use client'

import dynamic from 'next/dynamic'
import { GitBranch, Info } from 'lucide-react'

// SSR guard — ReactFlow uses DOM APIs, must be client-only
const AuthFlowCanvas = dynamic(
  () => import('@/components/builder/auth-flow/flow-canvas').then(m => ({ default: m.AuthFlowCanvas })),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="text-sm text-muted-foreground animate-pulse">Loading flow editor…</div>
    </div>
  )}
)

export default function AuthFlowPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* Page header */}
      <div className="px-6 pt-5 pb-3 border-b bg-card/80 backdrop-blur flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <GitBranch className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Auth Flow Editor</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Drag nodes to design your JWT / role-based auth pipeline · Compiles to middleware config JSON
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            Connect handles by dragging from one node's bottom dot to another's top dot
          </div>
        </div>
      </div>

      {/* Canvas — takes remaining height */}
      <div className="flex-1 overflow-hidden">
        <AuthFlowCanvas />
      </div>
    </div>
  )
}
