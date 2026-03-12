// Module: ZipPackager
import JSZip from 'jszip'
import { EXPORTED_CHART_TYPES, type GeneratedFileMap } from './template-generator'

function verifyChartTypeCoverage(files: GeneratedFileMap) {
  const widgetChartSource = files['src/components/WidgetChart.tsx'] ?? ''
  const missing = EXPORTED_CHART_TYPES.filter((chartType) => {
    if (chartType === 'table') {
      return !widgetChartSource.includes("widget.type === 'table'")
    }
    return !widgetChartSource.includes(`case '${chartType}'`)
  })
  if (missing.length > 0) {
    throw new Error(`ZIP export aborted. Missing chart handlers: ${missing.join(', ')}`)
  }
}

export async function packageProjectAsZip(files: GeneratedFileMap): Promise<Blob> {
  verifyChartTypeCoverage(files)
  const zip = new JSZip()

  Object.entries(files).forEach(([filePath, content]) => {
    zip.file(filePath, content)
  })

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}
