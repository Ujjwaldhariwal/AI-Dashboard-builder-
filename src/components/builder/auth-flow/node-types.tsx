// ── Node type components for Auth Flow Builder ─────────────────────────
//src/components/builder/auth-flow/node-types.tsx
'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  Zap, Settings2, ShieldCheck, GitBranch,
  CheckCircle2, XCircle,
} from 'lucide-react'

interface AuthNodeData {
  label:        string
  description?: string
  [key: string]: unknown
}

// ── Base node shell ───────────────────────────────────────────
function NodeShell({
  color, icon: Icon, badge, label, description,
  hasInput = true, hasOutput = true, hasBranch = false,
}: {
  color:        string
  icon:         any
  badge:        string
  label:        string
  description?: string
  hasInput?:    boolean
  hasOutput?:   boolean
  hasBranch?:   boolean
}) {
  return (
    <div className={`rounded-xl border-2 ${color} bg-card shadow-md min-w-[200px] max-w-[240px]`}>
      {hasInput && (
        <Handle type="target" position={Position.Top}
          className="!w-3 !h-3 !rounded-full !border-2 !border-background" />
      )}

      <div className="p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${color.replace('border-', 'bg-').replace('/60','')}`}>
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">{badge}</span>
        </div>
        <p className="text-sm font-semibold leading-tight">{label}</p>
        {description && (
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
        )}
      </div>

      {hasBranch ? (
        <>
          <Handle type="source" id="pass" position={Position.Bottom}
            style={{ left: '30%' }}
            className="!w-3 !h-3 !rounded-full !border-2 !border-background !bg-green-500" />
          <Handle type="source" id="fail" position={Position.Bottom}
            style={{ left: '70%' }}
            className="!w-3 !h-3 !rounded-full !border-2 !border-background !bg-red-500" />
        </>
      ) : hasOutput ? (
        <Handle type="source" position={Position.Bottom}
          className="!w-3 !h-3 !rounded-full !border-2 !border-background" />
      ) : null}
    </div>
  )
}

// ── Node type components ──────────────────────────────────────
export function TriggerNode({ data }: NodeProps) {
  const d = data as AuthNodeData
  return (
    <NodeShell
      color="border-green-500/60" icon={Zap} badge="Trigger"
      label={d.label} description={d.description}
      hasInput={false}
    />
  )
}

export function ActionNode({ data }: NodeProps) {
  const d = data as AuthNodeData
  return (
    <NodeShell
      color="border-blue-500/60" icon={Settings2} badge="Action"
      label={d.label} description={d.description}
    />
  )
}

export function ValidatorNode({ data }: NodeProps) {
  const d = data as AuthNodeData
  return (
    <NodeShell
      color="border-purple-500/60" icon={ShieldCheck} badge="Validator"
      label={d.label} description={d.description}
    />
  )
}

export function ConditionNode({ data }: NodeProps) {
  const d = data as AuthNodeData
  return (
    <NodeShell
      color="border-amber-500/60" icon={GitBranch} badge="Condition"
      label={d.label} description={d.description}
      hasBranch
    />
  )
}

export function SuccessNode({ data }: NodeProps) {
  const d = data as AuthNodeData
  return (
    <NodeShell
      color="border-emerald-500/60" icon={CheckCircle2} badge="Success"
      label={d.label} description={d.description}
      hasOutput={false}
    />
  )
}

export function FailureNode({ data }: NodeProps) {
  const d = data as AuthNodeData
  return (
    <NodeShell
      color="border-red-500/60" icon={XCircle} badge="Failure"
      label={d.label} description={d.description}
      hasOutput={false}
    />
  )
}

export const NODE_TYPES = {
  trigger:   TriggerNode,
  action:    ActionNode,
  validator: ValidatorNode,
  condition: ConditionNode,
  success:   SuccessNode,
  failure:   FailureNode,
}
