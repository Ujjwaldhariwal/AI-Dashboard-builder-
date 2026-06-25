import type { TransformOp } from '@/types/widget'
export type * from '@/types/tenancy'
export type * from '@/types/semantic-model'
export type * from '@/types/data-source'
export type * from '@/types/semantic-dataset'
export type * from '@/types/chart-template'
export type * from '@/types/dashboard-chart'

// Module: Index
//index.ts
export interface ApiEndpoint {
  id: string
  name: string
  url: string
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: any
  refreshInterval?: number
  transforms?: TransformOp[]
}

export interface ChartConfig {
  id: string
  type: 'line' | 'bar' | 'pie' | 'scatter' | 'heatmap' | 'gauge' | '3d-scatter'
  title: string
  apiEndpointId: string
  dataMapping: {
    xAxis?: string
    yAxis?: string
    series?: string[]
    value?: string
  }
  aiGenerated: boolean
  position: { x: number; y: number; w: number; h: number }
}

export interface DashboardConfig {
  id: string
  name: string
  charts: ChartConfig[]
  theme: 'light' | 'dark'
}

export interface ApiSchema {
  endpointId: string
  structure: any
  detectedFields: {
    name: string
    type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object'
    isTimeSeries: boolean
    isCategorical: boolean
  }[]
  suggestedCharts: string[]
}

export interface AIPrediction {
  chartId: string
  predictions: any[]
  confidence: number
  insights: string[]
  anomalies: any[]
}
