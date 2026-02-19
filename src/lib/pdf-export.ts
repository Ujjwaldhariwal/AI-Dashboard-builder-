import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'

interface ExportOptions {
  title: string
  data: any[]
  insights?: any[]
  correlations?: any[]
  alerts?: any[]
  companyName?: string
  companyLogo?: string
}

export class PDFExporter {
  static async exportDashboard(options: ExportOptions): Promise<void> {
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    let yPosition = 20

    // Header with branding
    this.addHeader(pdf, options.companyName || 'Analytics Platform', pageWidth)
    yPosition += 15

    // Title
    pdf.setFontSize(20)
    pdf.setFont('helvetica', 'bold')
    pdf.text(options.title, pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 15

    // Generated date
    pdf.setFontSize(10)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(100, 100, 100)
    pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 15

    // Executive Summary Box
    pdf.setDrawColor(59, 130, 246)
    pdf.setFillColor(239, 246, 255)
    pdf.roundedRect(15, yPosition, pageWidth - 30, 25, 3, 3, 'FD')
    
    pdf.setFontSize(12)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text('Executive Summary', 20, yPosition + 7)
    
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`Total Records: ${options.data.length}`, 20, yPosition + 13)
    pdf.text(`AI Insights: ${options.insights?.length || 0}`, 20, yPosition + 18)
    pdf.text(`Alerts: ${options.alerts?.length || 0}`, 90, yPosition + 13)
    pdf.text(`Correlations: ${options.correlations?.length || 0}`, 90, yPosition + 18)
    
    yPosition += 35

    // AI Insights Section
    if (options.insights && options.insights.length > 0) {
      yPosition = this.addSection(pdf, 'AI Insights', yPosition, pageWidth, pageHeight)
      
      options.insights.slice(0, 5).forEach((insight, i) => {
        if (yPosition > pageHeight - 30) {
          pdf.addPage()
          yPosition = 20
        }

        pdf.setFillColor(248, 250, 252)
        pdf.roundedRect(15, yPosition, pageWidth - 30, 20, 2, 2, 'F')
        
        // Icon and badge
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'bold')
        const badgeColors: Record<string, [number, number, number]> = {
          trend: [34, 197, 94],
          anomaly: [239, 68, 68],
          recommendation: [234, 179, 8],
          forecast: [59, 130, 246],
          pattern: [168, 85, 247]
        }
        const color: [number, number, number] = badgeColors[insight.type] || [100, 100, 100]
        pdf.setFillColor(...color)
        pdf.roundedRect(20, yPosition + 3, 15, 5, 1, 1, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.text(insight.type.toUpperCase(), 27.5, yPosition + 6.5, { align: 'center' })
        
        // Title
        pdf.setTextColor(0, 0, 0)
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.text(insight.title, 40, yPosition + 6)
        
        // Confidence
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(100, 100, 100)
        pdf.text(`${insight.confidence}% confidence`, pageWidth - 35, yPosition + 6)
        
        // Description
        pdf.setFontSize(9)
        pdf.setTextColor(60, 60, 60)
        const splitText = pdf.splitTextToSize(insight.description, pageWidth - 50)
        pdf.text(splitText, 20, yPosition + 12)
        
        yPosition += 25
      })
      
      yPosition += 10
    }

    // Alerts Section
    if (options.alerts && options.alerts.length > 0) {
      if (yPosition > pageHeight - 50) {
        pdf.addPage()
        yPosition = 20
      }

      yPosition = this.addSection(pdf, 'Active Alerts', yPosition, pageWidth, pageHeight)
      
      const criticalAlerts = options.alerts.filter(a => a.type === 'critical')
      const warningAlerts = options.alerts.filter(a => a.type === 'warning')
      
      if (criticalAlerts.length > 0) {
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(239, 68, 68)
        pdf.text('⚠ Critical Alerts', 20, yPosition)
        yPosition += 7
        
        criticalAlerts.slice(0, 3).forEach(alert => {
          pdf.setFontSize(9)
          pdf.setFont('helvetica', 'bold')
          pdf.setTextColor(0, 0, 0)
          pdf.text(`• ${alert.title}`, 25, yPosition)
          yPosition += 5
          
          pdf.setFont('helvetica', 'normal')
          pdf.setTextColor(60, 60, 60)
          const splitText = pdf.splitTextToSize(alert.description, pageWidth - 55)
          pdf.text(splitText, 28, yPosition)
          yPosition += splitText.length * 5 + 3
        })
      }
      
      yPosition += 10
    }

    // Data Table
    if (yPosition > pageHeight - 50) {
      pdf.addPage()
      yPosition = 20
    }

    yPosition = this.addSection(pdf, 'Data Overview', yPosition, pageWidth, pageHeight)

    const tableData = options.data.slice(0, 50).map(item =>
      Object.values(item).map(v => (v === null || v === undefined) ? '' : String(v))
    )
    const tableHeaders = Object.keys(options.data[0] || {})

    autoTable(pdf, {
      head: [tableHeaders],
      body: tableData,
      startY: yPosition,
      theme: 'grid',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [0, 0, 0]
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      margin: { left: 15, right: 15 },
      didDrawPage: (data) => {
        // Footer on each page
        this.addFooter(pdf, pageWidth, pageHeight)
      }
    })

    // Footer on last page
    this.addFooter(pdf, pageWidth, pageHeight)

    // Save
    pdf.save(`${options.title.replace(/\s+/g, '_')}_${Date.now()}.pdf`)
  }

  private static addHeader(pdf: jsPDF, companyName: string, pageWidth: number) {
    // Header background
    pdf.setFillColor(30, 41, 59)
    pdf.rect(0, 0, pageWidth, 15, 'F')
    
    // Company name
    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(255, 255, 255)
    pdf.text(companyName, pageWidth / 2, 10, { align: 'center' })
  }

  private static addSection(pdf: jsPDF, title: string, yPosition: number, pageWidth: number, pageHeight: number): number {
    if (yPosition > pageHeight - 30) {
      pdf.addPage()
      yPosition = 20
    }

    pdf.setFontSize(14)
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text(title, 15, yPosition)
    
    pdf.setDrawColor(59, 130, 246)
    pdf.setLineWidth(0.5)
    pdf.line(15, yPosition + 2, pageWidth - 15, yPosition + 2)
    
    return yPosition + 10
  }

  private static addFooter(pdf: jsPDF, pageWidth: number, pageHeight: number) {
    const pageCount = (pdf as any).internal.getNumberOfPages()
    
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(150, 150, 150)
    
    // Page number
    pdf.text(
      `Page ${(pdf as any).internal.getCurrentPageInfo().pageNumber} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    )
    
    // Confidential notice
    pdf.text(
      'Confidential - Generated by Analytics AI Platform',
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    )
  }

  static async captureChartAsImage(elementId: string): Promise<string> {
    const element = document.getElementById(elementId)
    if (!element) return ''
    
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2
    })
    
    return canvas.toDataURL('image/png')
  }
}
