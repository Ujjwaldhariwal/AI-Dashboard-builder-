'use client'

import '@xyflow/react/dist/style.css'
import { useCallback, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  BackgroundVariant, Panel,
  type Connection, type Edge, type Node,
} from '@xyflow/react'
import { NODE_TYPES } from './node-types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Zap, Settings2, ShieldCheck, GitBranch,
  CheckCircle2, XCircle, Download, RotateCcw, Plus,
} from 'lucide-react'
import { toast } from 'sonner'

// ── Starter graph ─────────────────────────────────────────────
const INITIAL_NODES: Node[] = [
  {
    id: '1', type: 'trigger',
    position: { x: 280, y: 20 },
    data: { label: 'API Request Received', description: 'Any incoming HTTP request' },
  },
  {
    id: '2', type: 'action',
    position: { x: 280, y: 140 },
    data: { label: 'Extract Bearer Token', description: 'Parse Authorization header' },
  },
  {
    id: '3', type: 'validator',
    position: { x: 280, y: 260 },
    data: { label: 'Verify JWT Signature', description: 'Check token against secret key' },
  },
  {
    id: '4', type: 'condition',
    position: { x: 280, y: 380 },
    data: { label: 'Check User Role', description: 'Admin / User / Guest branching' },
  },
  {
    id: '5', type: 'success',
    position: { x: 100, y: 500 },
    data: { label: 'Grant Access (200)', description: 'Proceed to protected resource' },
  },
  {
    id: '6', type: 'failure',
    position: { x: 460, y: 500 },
    data: { label: 'Deny Access (401)', description: 'Return Unauthorized response' },
  },
]

const INITIAL_EDGES: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3', animated: true },
  { id: 'e3-4', source: '3', target: '4', animated: true },
  { id: 'e4-5', source: '4', target: '5', sourceHandle: 'pass', animated: true,
    style: { stroke: '#22c55e' }, label: 'pass', labelStyle: { fontSize: 9, fill: '#22c55e' } },
  { id: 'e4-6', source: '4', target: '6', sourceHandle: 'fail', animated: true,
    style: { stroke: '#ef4444' }, label: 'fail', labelStyle: { fontSize: 9, fill: '#ef4444' } },
]

// ── Node palette config ───────────────────────────────────────
const NODE_PALETTE = [
  { type: 'trigger',   icon: Zap,          label: 'Trigger',   color: 'text-green-500',  desc: 'Entry point'      },
  { type: 'action',    icon: Settings2,     label: 'Action',    color: 'text-blue-500',   desc: 'Process step'     },
  { type: 'validator', icon: ShieldCheck,   label: 'Validator', color: 'text-purple-500', desc: 'Auth check'       },
  { type: 'condition', icon: GitBranch,     label: 'Condition', color: 'text-amber-500',  desc: 'Branch logic'     },
  { type: 'success',   icon: CheckCircle2,  label: 'Success',   color: 'text-emerald-500',desc: 'Allow (200/202)'  },
  { type: 'failure',   icon: XCircle,       label: 'Failure',   color: 'text-red-500',    desc: 'Deny (401/403)'  },
]

const NODE_LABELS: Record<string, string> = {
  trigger:   'New Trigger',
  action:    'New Action',
  validator: 'Validate Token',
  condition: 'Check Condition',
  success:   'Grant Access (200)',
  failure:   'Deny Access (401)',
}

let _nodeCounter = 10

// ── Compile graph → middleware config JSON ────────────────────
function compileToConfig(nodes: Node[], edges: Edge[]) {
  return {
    version:  '1.0',
    compiled: new Date().toISOString(),
    nodes: nodes.map(n => ({
      id:          n.id,
      type:        n.type,
      label:       (n.data as any).label,
      description: (n.data as any).description ?? '',
    })),
    edges: edges.map(e => ({
      from:   e.source,
      to:     e.target,
      handle: e.sourceHandle ?? 'default',
    })),
    entryNode:  nodes.find(n => n.type === 'trigger')?.id ?? null,
    successNodes: nodes.filter(n => n.type === 'success').map(n => n.id),
    failureNodes: nodes.filter(n => n.type === 'failure').map(n => n.id),
  }
}

// ── Main canvas component ─────────────────────────────────────
export function AuthFlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
  const [configJson, setConfigJson]      = useState<string | null>(null)

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges(eds => addEdge({ ...connection, animated: true }, eds)),
    [setEdges],
  )

  const addNode = useCallback((type: string) => {
    const id      = String(++_nodeCounter)
    const label   = NODE_LABELS[type] ?? 'New Node'
    const x       = 200 + Math.random() * 200
    const y       = 100 + Math.random() * 300
    const newNode: Node = {
      id, type,
      position: { x, y },
      data: { label },
    }
    setNodes(nds => [...nds, newNode])
    toast.success(`Added ${label}`)
  }, [setNodes])

  const handleReset = () => {
    setNodes(INITIAL_NODES)
    setEdges(INITIAL_EDGES)
    setConfigJson(null)
    toast.success('Flow reset to default')
  }

  const handleCompile = () => {
    const config = compileToConfig(nodes, edges)
    const json   = JSON.stringify(config, null, 2)
    setConfigJson(json)
    toast.success('Auth flow compiled to JSON')
  }

  const handleDownload = () => {
    const config = compileToConfig(nodes, edges)
    const blob   = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a')
    a.href       = url
    a.download   = 'auth-flow-config.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Downloaded auth-flow-config.json')
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-card flex-shrink-0 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1 font-medium">Add node:</span>
        {NODE_PALETTE.map(({ type, icon: Icon, label, color }) => (
          <button
            key={type}
            onClick={() => addNode(type)}
            title={label}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border hover:border-primary/50 hover:bg-muted text-xs transition-all"
          >
            <Icon className={`w-3 h-3 ${color}`} />
            <span className="text-[11px]">{label}</span>
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {nodes.length} nodes · {edges.length} edges
          </Badge>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleReset}>
            <RotateCcw className="w-3 h-3 mr-1.5" />Reset
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCompile}>
            Compile JSON
          </Button>
          <Button size="sm" className="h-7 text-xs bg-gradient-to-r from-blue-600 to-purple-600 text-white border-0"
            onClick={handleDownload}>
            <Download className="w-3 h-3 mr-1.5" />Download
          </Button>
        </div>
      </div>

      {/* ── React Flow canvas ──────────────────────────────────── */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          deleteKeyCode="Delete"
          defaultEdgeOptions={{ animated: true }}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={16} size={1}
            className="opacity-30"
          />
          <Controls className="[&>button]:bg-card [&>button]:border-border" />
          <MiniMap
            nodeColor={(n) => {
              const map: Record<string, string> = {
                trigger: '#22c55e', action: '#3b82f6',
                validator: '#8b5cf6', condition: '#f59e0b',
                success: '#10b981', failure: '#ef4444',
              }
              return map[n.type ?? ''] ?? '#94a3b8'
            }}
            className="!bg-card !border-border rounded-lg"
          />
          <Panel position="bottom-left">
            <div className="text-[10px] text-muted-foreground bg-card border rounded-md px-2 py-1">
              Drag to move · Scroll to zoom · Delete to remove · Connect handles to link
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* ── Compiled JSON panel ────────────────────────────────── */}
      {configJson && (
        <div className="flex-shrink-0 border-t bg-muted/30 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <span className="text-xs font-semibold">Compiled Middleware Config</span>
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => setConfigJson(null)}
            >
              ✕ Close
            </button>
          </div>
          <pre className="text-[10px] font-mono p-4 text-muted-foreground whitespace-pre-wrap">
            {configJson}
          </pre>
        </div>
      )}
    </div>
  )
}
