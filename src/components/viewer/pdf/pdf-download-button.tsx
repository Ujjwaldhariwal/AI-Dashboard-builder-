'use client'

import { useState } from 'react'
import { Loader2, FileDown } from 'lucide-react'
import { pdf, usePDF } from '@react-pdf/renderer'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { askReportGenerator } from '@/lib/ai/agent-client'
import { ReportDocument } from '@/components/viewer/pdf/report-document'

interface PdfWidgetInput {
  id: string
  title: string
  type?: string
  endpointId?: string
  dataMapping?: unknown
  style?: unknown
}

interface PdfDownloadButtonProps {
  dashboardTitle: string
  widgets: PdfWidgetInput[]
}

export function PdfDownloadButton({
  dashboardTitle,
  widgets,
}: PdfDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [, updatePdfInstance] = usePDF()

  const handleGenerateReport = async () => {
    if (!dashboardTitle.trim()) {
      toast.error('Dashboard title is required to generate report')
      return
    }
    if (!widgets.length) {
      toast.error('No widgets available for report generation')
      return
    }

    setIsGenerating(true)
    try {
      const widgetsData = widgets.map((widget) => {
        const widgetRecord = widget as unknown as Record<string, unknown>
        const rawData = widgetRecord.data
        const sampledData = Array.isArray(rawData) ? rawData.slice(0, 20) : rawData

        return {
          id: widget.id,
          title: widget.title,
          type: widget.type,
          endpointId: widget.endpointId,
          dataMapping: widget.dataMapping,
          style: widget.style,
          data: sampledData,
          summary: widgetRecord.summary,
        }
      })

      const insights = await askReportGenerator(dashboardTitle, widgetsData)
      const reportWidgets = widgets.map((widget) => ({
        id: widget.id,
        title: widget.title,
      }))

      const reportDocument = (
        <ReportDocument
          dashboardTitle={dashboardTitle}
          insights={insights}
          widgets={reportWidgets}
        />
      )

      updatePdfInstance(reportDocument)
      const blob = await pdf(reportDocument).toBlob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = 'ai-report.pdf'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(objectUrl)

      toast.success('AI PDF report generated')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate AI PDF report'
      toast.error(message)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void handleGenerateReport()}
      disabled={isGenerating}
      className="hidden md:flex"
    >
      {isGenerating ? (
        <>
          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <FileDown className="w-3.5 h-3.5 mr-1.5" />
          Generate AI Report
        </>
      )}
    </Button>
  )
}

