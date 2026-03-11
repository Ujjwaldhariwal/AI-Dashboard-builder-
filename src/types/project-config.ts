// src/types/project-config.ts

export type AuthStrategy  = 'basic' | 'bearer' | 'api-key' | 'none'
export type LayoutType    = 'sidebar' | 'topnav'
export type EncodingType  = 'btoa' | 'plain' | 'none'
export type NavDensity    = 'compact' | 'comfortable'

export interface LoginConfig {
  endpoint:      string      // e.g. /userLogin
  usernameField: string      // body key for username
  passwordField: string      // body key for password
  tokenPath:     string      // dot-path in response e.g. "data.token"
  encodingType:  EncodingType
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

export interface ProjectConfig {
  dashboardId:  string
  clientName:   string
  projectTitle: string
  baseUrl:      string       // API base URL
  layout:       LayoutType
  authStrategy: AuthStrategy
  header:       HeaderConfig
  login:        LoginConfig
  session:      SessionConfig
}

export const DEFAULT_PROJECT_CONFIG: Omit<ProjectConfig, 'dashboardId'> = {
  clientName:   '',
  projectTitle: 'My Dashboard',
  baseUrl:      '',
  layout:       'sidebar',
  authStrategy: 'basic',
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
  },
  session: {
    logoutOn401:     true,
    logoutOnMessage: 'expired',
  },
}
