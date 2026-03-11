'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Filter, Plus, Trash2, X } from 'lucide-react'
import { useDashboardStore } from '@/store/builder-store'
import type { FilterOperator } from '@/types/filter'

const OPERATOR_OPTIONS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'not-equals', label: 'not equals' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
]

interface GlobalFiltersPanelProps {
  dashboardId: string
}

export function GlobalFiltersPanel({ dashboardId }: GlobalFiltersPanelProps) {
  const {
    getFiltersByDashboard,
    addDashboardFilter,
    updateDashboardFilter,
    removeDashboardFilter,
    clearDashboardFilters,
  } = useDashboardStore()

  const filters = getFiltersByDashboard(dashboardId)
  const activeCount = useMemo(
    () => filters.filter(f => f.active && f.field.trim() && f.value.trim()).length,
    [filters],
  )

  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardHeader className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Filter className="h-4 w-4 text-blue-600" />
            Global Filters
            <Badge variant="outline" className="text-[10px]">
              {activeCount} active
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => addDashboardFilter(dashboardId)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add filter
            </Button>
            {filters.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => clearDashboardFilters(dashboardId)}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Clear all
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4 pb-4">
        {filters.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No filters yet. Add one to filter all widgets in this dashboard.
          </p>
        )}

        {filters.map(filter => (
          <div
            key={filter.id}
            className="grid grid-cols-1 gap-2 rounded-lg border bg-background/70 p-3 md:grid-cols-[auto_1.2fr_1fr_1.2fr_auto]"
          >
            <div className="flex items-center gap-2">
              <Switch
                checked={filter.active}
                onCheckedChange={active => updateDashboardFilter(filter.id, { active })}
              />
              <Label className="text-[11px] text-muted-foreground">On</Label>
            </div>

            <Input
              value={filter.field}
              onChange={e => updateDashboardFilter(filter.id, { field: e.target.value })}
              placeholder="Field name (e.g. circle)"
              className="h-8 text-xs"
            />

            <Select
              value={filter.operator}
              onValueChange={value =>
                updateDashboardFilter(filter.id, { operator: value as FilterOperator })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATOR_OPTIONS.map(op => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              value={filter.value}
              onChange={e => updateDashboardFilter(filter.id, { value: e.target.value })}
              placeholder="Filter value"
              className="h-8 text-xs"
            />

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-red-500 hover:text-red-700"
              onClick={() => removeDashboardFilter(filter.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}

        {filters.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            Filters are applied with <span className="font-medium">AND</span> logic across all active filters.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

