'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useDashboardStore } from '@/store/builder-store'
import type { AIExportConfig } from '@/types/project-config'

interface ExportConfigModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dashboardId: string
  initialConfig?: AIExportConfig
  exporting: boolean
  generateZip: (dashboardId: string, config: AIExportConfig) => Promise<void>
}

const DEFAULT_AI_EXPORT_CONFIG: AIExportConfig = {
  enabled: false,
  provider: 'google',
  apiKey: '',
  features: {
    dataTransformer: true,
    uiDesigner: true,
    pdfReport: true,
    chat: false,
  },
}

export function ExportConfigModal({
  open,
  onOpenChange,
  dashboardId,
  initialConfig,
  exporting,
  generateZip,
}: ExportConfigModalProps) {
  const { setAIExportConfig } = useDashboardStore()
  const seedConfig = useMemo(
    () => initialConfig ?? DEFAULT_AI_EXPORT_CONFIG,
    [initialConfig],
  )

  const [formState, setFormState] = useState<AIExportConfig>(seedConfig)

  useEffect(() => {
    if (!open) return
    setFormState(seedConfig)
  }, [open, seedConfig])

  const handleGenerateZip = async () => {
    if (formState.enabled && !formState.apiKey.trim()) {
      toast.error('API key is required when AI features are enabled')
      return
    }

    try {
      setAIExportConfig(dashboardId, formState)
      await generateZip(dashboardId, formState)
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate ZIP'
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export Dashboard</DialogTitle>
          <DialogDescription>
            Configure standalone export settings before generating the ZIP package.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Enable AI Features in Export</Label>
              <p className="text-xs text-muted-foreground">
                Include AI routes and runtime toggles in the exported project.
              </p>
            </div>
            <Switch
              checked={formState.enabled}
              onCheckedChange={(enabled) =>
                setFormState((prev) => ({ ...prev, enabled }))
              }
            />
          </div>

          {formState.enabled && (
            <div className="space-y-4 rounded-md border p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">AI Provider</Label>
                <Select
                  value={formState.provider}
                  onValueChange={(provider: AIExportConfig['provider']) =>
                    setFormState((prev) => ({ ...prev, provider }))
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google Gemini</SelectItem>
                    <SelectItem value="openai">OpenAI GPT-4</SelectItem>
                    <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Client API Key</Label>
                <Input
                  type="password"
                  className="h-9 text-sm"
                  value={formState.apiKey}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, apiKey: event.target.value }))
                  }
                  placeholder="Enter API key"
                />
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  This key will be injected directly into the exported `.env` file and will not be saved to our database.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">AI Features</Label>
                <div className="grid gap-2">
                  <FeatureToggleRow
                    label="Data Transformer"
                    checked={formState.features.dataTransformer}
                    onCheckedChange={(checked) =>
                      setFormState((prev) => ({
                        ...prev,
                        features: { ...prev.features, dataTransformer: checked },
                      }))
                    }
                  />
                  <FeatureToggleRow
                    label="UI Designer"
                    checked={formState.features.uiDesigner}
                    onCheckedChange={(checked) =>
                      setFormState((prev) => ({
                        ...prev,
                        features: { ...prev.features, uiDesigner: checked },
                      }))
                    }
                  />
                  <FeatureToggleRow
                    label="PDF Reports"
                    checked={formState.features.pdfReport}
                    onCheckedChange={(checked) =>
                      setFormState((prev) => ({
                        ...prev,
                        features: { ...prev.features, pdfReport: checked },
                      }))
                    }
                  />
                  <FeatureToggleRow
                    label="Natural Language Chat"
                    checked={formState.features.chat}
                    onCheckedChange={(checked) =>
                      setFormState((prev) => ({
                        ...prev,
                        features: { ...prev.features, chat: checked },
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={exporting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleGenerateZip()}
            disabled={exporting}
          >
            {exporting ? 'Generating…' : 'Generate ZIP'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface FeatureToggleRowProps {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

function FeatureToggleRow({
  label,
  checked,
  onCheckedChange,
}: FeatureToggleRowProps) {
  return (
    <div className="flex items-center justify-between rounded border px-3 py-2">
      <Label className="text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
