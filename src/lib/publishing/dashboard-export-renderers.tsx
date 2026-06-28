import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import JSZip from 'jszip'

interface DashboardExportManifestChart {
  id?: string
  name?: string
  templateId?: string
  validationState?: string
  status?: string
  datasetId?: string
}

interface DashboardExportManifest {
  dashboard?: {
    name?: string
    slug?: string
    status?: string
    publishedAt?: string | null
  }
  version?: {
    title?: string
    versionNumber?: number
    status?: string
    publishedAt?: string | null
  }
  pages?: Array<{
    title?: string
    slug?: string
    slots?: Array<{
      title?: string | null
      chartConfigId?: string
      slotKey?: string
      rowIndex?: number
      columnIndex?: number
      width?: number
      height?: number
    }>
  }>
  charts?: DashboardExportManifestChart[]
  datasets?: Array<{
    id?: string
    name?: string
    status?: string
  }>
  exportedAt?: string
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    color: '#111827',
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 22,
    marginBottom: 8,
    fontWeight: 700,
  },
  subtitle: {
    fontSize: 11,
    color: '#4b5563',
    marginBottom: 18,
  },
  section: {
    marginTop: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  stat: {
    flexGrow: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 700,
  },
  statLabel: {
    color: '#6b7280',
    marginTop: 3,
  },
  item: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  itemTitle: {
    fontSize: 11,
    fontWeight: 700,
  },
  muted: {
    color: '#6b7280',
  },
})

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function chartLabel(chart: DashboardExportManifestChart | undefined) {
  if (!chart) return 'Unknown chart'
  return `${text(chart.name, 'Untitled chart')} / ${text(chart.templateId, 'unknown template')}`
}

export async function renderDashboardReportPdf(manifest: DashboardExportManifest): Promise<Buffer> {
  const pages = manifest.pages ?? []
  const charts = manifest.charts ?? []
  const datasets = manifest.datasets ?? []

  const document = (
    <Document
      title={`${text(manifest.dashboard?.name, 'Dashboard')} export report`}
      author="DashboardOS"
      subject="Published dashboard export report"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{text(manifest.dashboard?.name, 'Published Dashboard')}</Text>
        <Text style={styles.subtitle}>
          Version {manifest.version?.versionNumber ?? '-'} / {text(manifest.version?.status, 'unknown')} / exported {text(manifest.exportedAt, 'now')}
        </Text>

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{pages.length}</Text>
            <Text style={styles.statLabel}>Pages</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{charts.length}</Text>
            <Text style={styles.statLabel}>Charts</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{datasets.length}</Text>
            <Text style={styles.statLabel}>Datasets</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pages And Slots</Text>
          {pages.map((page, pageIndex) => (
            <View key={`${page.slug ?? pageIndex}`} style={styles.item}>
              <Text style={styles.itemTitle}>{pageIndex + 1}. {text(page.title, 'Untitled page')}</Text>
              <Text style={styles.muted}>{(page.slots ?? []).length} chart slot(s)</Text>
              {(page.slots ?? []).slice(0, 8).map((slot, slotIndex) => {
                const chart = charts.find(item => item.id === slot.chartConfigId)
                return (
                  <Text key={`${slot.slotKey ?? slotIndex}`} style={styles.muted}>
                    - {text(slot.title, chartLabel(chart))} / {slot.width ?? '-'}x{slot.height ?? '-'} / row {slot.rowIndex ?? 0}, col {slot.columnIndex ?? 0}
                  </Text>
                )
              })}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chart Inventory</Text>
          {charts.slice(0, 30).map((chart, index) => (
            <View key={`${chart.id ?? index}`} style={styles.item}>
              <Text style={styles.itemTitle}>{index + 1}. {chartLabel(chart)}</Text>
              <Text style={styles.muted}>
                Status {text(chart.status, 'unknown')} / validation {text(chart.validationState, 'unknown')} / dataset {text(chart.datasetId, 'unknown')}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )

  return renderToBuffer(document)
}

export async function renderDashboardBundleZip({
  manifest,
  pdfBuffer,
}: {
  manifest: DashboardExportManifest
  pdfBuffer: Buffer
}): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('dashboard-report.pdf', pdfBuffer)
  zip.file('README.md', [
    `# ${text(manifest.dashboard?.name, 'Dashboard')} Export`,
    '',
    'This package was generated by DashboardOS from a published dashboard version.',
    '',
    '- `manifest.json` contains the portable dashboard metadata.',
    '- `dashboard-report.pdf` contains a printable report summary.',
    '',
  ].join('\n'))

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
