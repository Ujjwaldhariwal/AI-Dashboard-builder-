// src/types/project-config.ts

import type { TransformOp } from '@/types/widget'

export type AuthStrategy  = 'basic' | 'bearer' | 'api-key' | 'none'
export type LayoutType    = 'sidebar' | 'topnav'
export type EncodingType  = 'btoa' | 'plain' | 'none'
export type NavDensity    = 'compact' | 'comfortable'
export type ChartTheme    = 'enterprise' | 'bosch-uppcl'
export type EndpointAuthType = 'none' | 'api-key' | 'bearer' | 'basic' | 'custom-headers'

export interface ApiEndpointConfig {
  id: string
  dashboardId?: string
  name: string
  url: string
  method: 'GET' | 'POST'
  authType: EndpointAuthType
  headers?: Record<string, string>
  body?: unknown
  refreshInterval: number
  status: 'active' | 'inactive'
  transforms?: TransformOp[]
}

export interface AIExportConfig {
  enabled: boolean
  provider: 'google' | 'openai' | 'anthropic'
  apiKey: string // Will NOT be persisted to Supabase, only used during ZIP generation
  features: {
    dataTransformer: boolean
    uiDesigner: boolean
    pdfReport: boolean
    chat: boolean
  }
}

export interface LoginConfig {
  endpoint:      string      // e.g. /userLogin
  usernameField: string      // body key for username
  passwordField: string      // body key for password
  tokenPath:     string      // dot-path in response e.g. "data.token"
  encodingType:  EncodingType
  tokenHeaderName?: string   // header name used when applying captured token
  tokenPrefix?:     string   // e.g. "Bearer"
  passTokenToApis?: boolean  // auto-attach captured token to endpoint requests
}

export interface SessionConfig {
  logoutOn401:     boolean
  logoutOnMessage: string    // substring match e.g. "expired"
}

export interface HeaderConfig {
  projectName:  string
  subtitle?:    string
  primaryColor: string       // sidebar bg hex
  accentColor:  string       // button/highlight hex
  navDensity?:  NavDensity
}

export interface ChartGroup {
  id:          string
  name:        string        // "Disconnection", "Prepaid Billing"
  order:       number
  widgetIds:   string[]
  dashboardId: string
}

export interface ChartSubgroup {
  id:          string
  groupId:     string
  name:        string
  order:       number
  widgetIds:   string[]
  dashboardId: string
}

export interface ProjectConfig {
  dashboardId:  string
  clientName:   string
  projectTitle: string
  baseUrl:      string       // API base URL
  chartTheme:   ChartTheme
  layout:       LayoutType
  authStrategy: AuthStrategy
  defaultHeaders: Record<string, string>
  header:       HeaderConfig
  login:        LoginConfig
  session:      SessionConfig
  aiExportConfig?: AIExportConfig
}

export const DEFAULT_PROJECT_CONFIG: Omit<ProjectConfig, 'dashboardId'> = {
  clientName:   '',
  projectTitle: 'My Dashboard',
  baseUrl:      '',
  chartTheme:   'enterprise',
  layout:       'sidebar',
  authStrategy: 'basic',
  defaultHeaders: {},
  header: {
    projectName:  'My Dashboard',
    subtitle:     '',
    primaryColor: '#0f172a',
    accentColor:  '#3b82f6',
    navDensity:   'comfortable',
  },
  login: {
    endpoint:      '/userLogin',
    usernameField: 'username',
    passwordField: 'password',
    tokenPath:     'data.token',
    encodingType:  'plain',
    tokenHeaderName: 'Authorization',
    tokenPrefix:     'Bearer',
    passTokenToApis: true,
  },
  session: {
    logoutOn401:     true,
    logoutOnMessage: 'expired',
  },
}
