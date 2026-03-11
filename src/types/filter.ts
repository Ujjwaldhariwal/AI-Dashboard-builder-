export type FilterOperator =
  | 'contains'
  | 'equals'
  | 'not-equals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'

export interface DashboardFilter {
  id: string
  dashboardId: string
  field: string
  operator: FilterOperator
  value: string
  active: boolean
}

