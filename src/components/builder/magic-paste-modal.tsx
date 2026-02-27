// Component: MagicPasteModal
// src/components/builder/magic-paste-modal.tsx
'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Wand2, Code2, LayoutDashboard, Loader2, CheckCircle2 } from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'
import { useAuthStore } from '@/store/auth-store'
import { DataAnalyzer } from '@/lib/ai/data-analyzer'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

interface MagicPasteModalProps {
  isOpen: boolean
  onClose: () => void
}

export function MagicPasteModal({ isOpen, onClose }: MagicPasteModalProps) {
  const { user } = useAuthStore()
  const { currentDashboardId, addEndpoint, addWidget } = useDashboardStore()

  const [url, setUrl] = useState('')
  const [jsonInput, setJsonInput] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [step, setStep] = useState<'input' | 'success'>('input')
  const [generatedCount, setGeneratedCount] = useState(0)

  const handleMagicBuild = async () => {
    if (!currentDashboardId || !user?.id) {
      toast.error('No active dashboard or user session.')
      return
    }
    if (!url.trim() || !jsonInput.trim()) {
      toast.error('Please provide both an API URL and a JSON sample.')
      return
    }

    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url.trim())
    } catch {
      toast.error('Invalid URL. Please enter a valid API endpoint URL.')
      return
    }

    setIsAnalyzing(true)

    try {
      // 1. Analyze JSON schema
      const analysis = DataAnalyzer.analyzeJsonString(jsonInput)

      if (!analysis.success || !analysis.suggestions?.length) {
        throw new Error(
          analysis.error || 'Could not detect any valid data arrays in the JSON.',
        )
      }

      // 2. Register endpoint
      const endpointId = addEndpoint({
        name: `Auto-API: ${
          parsedUrl.pathname.split('/').filter(Boolean).pop() || 'Endpoint'
        }`,
        url: url.trim(),
        method: 'GET',
        authType: 'none',
        refreshInterval: 300,
        status: 'active',
        headers: {},
      })

      if (!endpointId) {
        throw new Error('Failed to generate endpoint ID.')
      }

      // 3. ✅ FIX: stagger each addWidget call with a small async gap
      //    This ensures Date.now() ticks forward between calls,
      //    combined with the random suffix in the store = zero duplicate IDs.
      for (let i = 0; i < analysis.suggestions.length; i++) {
        const suggestion = analysis.suggestions[i]

        // Small stagger — enough for Date.now() to advance
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2))
        }

        addWidget({
          title: suggestion.title,
          type: suggestion.chartType,
          endpointId,
          dataMapping: {
            xAxis: suggestion.xAxis,
            yAxis: suggestion.yAxes?.[0]?.key,
            yAxes: suggestion.yAxes,
          },
        })
      }

      setGeneratedCount(analysis.suggestions.length)
      setStep('success')
      toast.success(`Generated ${analysis.suggestions.length} widgets!`)

      setTimeout(() => {
        resetAndClose()
      }, 2000)
    } catch (err: any) {
      console.error('[MagicBuild]', err)
      toast.error(err.message || 'Failed to parse JSON and build dashboard.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const resetAndClose = () => {
    setUrl('')
    setJsonInput('')
    setStep('input')
    setIsAnalyzing(false)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && resetAndClose()}>
      <DialogContent className="sm:max-w-2xl">
        <AnimatePresence mode="wait">
          {step === 'input' ? (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Wand2 className="w-5 h-5 text-purple-500" />
                  Magic Auto-Build
                </DialogTitle>
                <DialogDescription>
                  Paste your API URL and a Postman JSON response. Our AI will instantly
                  reverse-engineer the schema and build the perfect charts.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-4">
                <div className="space-y-2">
                  <Label>API Endpoint URL</Label>
                  <Input
                    placeholder="https://api.yourcompany.com/v1/sales-data"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Postman JSON Response</Label>
                    <Badge variant="outline" className="text-xs bg-muted">
                      <Code2 className="w-3 h-3 mr-1" /> Auto-detects nested arrays
                    </Badge>
                  </div>
                  <Textarea
                    placeholder={`{\n  "data": [\n    { "month": "Jan", "revenue": 5000 }\n  ]\n}`}
                    value={jsonInput}
                    onChange={e => setJsonInput(e.target.value)}
                    className="font-mono text-xs min-h-[250px] resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={resetAndClose}
                  disabled={isAnalyzing}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleMagicBuild}
                  disabled={isAnalyzing || !url.trim() || !jsonInput.trim()}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing Schema...
                    </>
                  ) : (
                    <>
                      <LayoutDashboard className="w-4 h-4 mr-2" />
                      Generate Dashboard
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-12 flex flex-col items-center justify-center text-center space-y-4"
            >
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-2xl font-bold">Magic Complete!</h3>
                <p className="text-muted-foreground mt-2">
                  Successfully analyzed schema and generated{' '}
                  <b>{generatedCount}</b> smart widgets.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
