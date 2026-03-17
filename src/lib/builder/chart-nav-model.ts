import type { ChartGroup } from '@/types/project-config'
import type { Widget } from '@/types/widget'

export const CHART_NAV_ALL = '__all__'
export const CHART_NAV_UNGROUPED = '__ungrouped__'
export const CHART_NAV_GENERAL = '__general__'
export const CHART_NAV_ALL_LABEL = 'All'
export const CHART_NAV_UNGROUPED_LABEL = 'Ungrouped'
export const CHART_NAV_GENERAL_LABEL = 'General'

export interface ChartNavItem {
  id: string
  label: string
  groupId: string
  subgroupId: string
}

export interface ChartNavSubgroup {
  id: string
  label: string
  charts: ChartNavItem[]
}

export interface ChartNavCategory {
  id: string
  label: string
  subgroups: ChartNavSubgroup[]
}

export interface ChartNavTree {
  categories: ChartNavCategory[]
}

export interface ChartNavSelection {
  groupId: string
  subgroupId: string
}

type MutableSubgroup = {
  id: string
  label: string
  charts: ChartNavItem[]
}

type MutableCategory = {
  id: string
  label: string
  subgroups: Map<string, MutableSubgroup>
}

function normalizeLabel(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

function slugifyValue(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return slug || CHART_NAV_GENERAL
}

export function getSubgroupId(sectionName: string | undefined): string {
  if (!sectionName || sectionName.trim().length === 0) {
    return CHART_NAV_GENERAL
  }
  return slugifyValue(sectionName)
}

export function getSubgroupLabel(sectionName: string | undefined): string {
  return normalizeLabel(sectionName, CHART_NAV_GENERAL_LABEL)
}

export function buildChartNavTree(
  widgets: Widget[],
  groups: ChartGroup[],
): ChartNavTree {
  const orderedGroups = [...groups].sort((a, b) => a.order - b.order)
  const categories = new Map<string, MutableCategory>()

  orderedGroups.forEach(group => {
    categories.set(group.id, {
      id: group.id,
      label: normalizeLabel(group.name, 'Group'),
      subgroups: new Map<string, MutableSubgroup>(),
    })
  })

  const upsertCategory = (categoryId: string, label: string): MutableCategory => {
    const existing = categories.get(categoryId)
    if (existing) return existing
    const next: MutableCategory = { id: categoryId, label, subgroups: new Map() }
    categories.set(categoryId, next)
    return next
  }

  widgets.forEach(widget => {
    const groupId = widget.groupId && categories.has(widget.groupId)
      ? widget.groupId
      : CHART_NAV_UNGROUPED
    const groupLabel = groupId === CHART_NAV_UNGROUPED
      ? CHART_NAV_UNGROUPED_LABEL
      : categories.get(groupId)?.label ?? CHART_NAV_UNGROUPED_LABEL
    const category = upsertCategory(groupId, groupLabel)

    const subgroupId = getSubgroupId(widget.sectionName)
    const subgroupLabel = getSubgroupLabel(widget.sectionName)
    const subgroup = category.subgroups.get(subgroupId) ?? {
      id: subgroupId,
      label: subgroupLabel,
      charts: [],
    }

    subgroup.charts.push({
      id: widget.id,
      label: normalizeLabel(widget.title, 'Untitled Widget'),
      groupId,
      subgroupId,
    })
    category.subgroups.set(subgroupId, subgroup)
  })

  const orderedCategories: ChartNavCategory[] = []
  orderedGroups.forEach(group => {
    const category = categories.get(group.id)
    if (!category || category.subgroups.size === 0) return
    orderedCategories.push({
      id: category.id,
      label: category.label,
      subgroups: Array.from(category.subgroups.values()),
    })
  })

  const ungroupedCategory = categories.get(CHART_NAV_UNGROUPED)
  if (ungroupedCategory && ungroupedCategory.subgroups.size > 0) {
    orderedCategories.push({
      id: ungroupedCategory.id,
      label: ungroupedCategory.label,
      subgroups: Array.from(ungroupedCategory.subgroups.values()),
    })
  }

  return { categories: orderedCategories }
}

export function getSubgroupsForGroup(
  tree: ChartNavTree,
  groupId: string,
): ChartNavSubgroup[] {
  if (groupId !== CHART_NAV_ALL) {
    return tree.categories.find(category => category.id === groupId)?.subgroups ?? []
  }

  const merged = new Map<string, ChartNavSubgroup>()
  tree.categories.forEach(category => {
    category.subgroups.forEach(subgroup => {
      const existing = merged.get(subgroup.id)
      if (existing) {
        merged.set(subgroup.id, {
          ...existing,
          charts: [...existing.charts, ...subgroup.charts],
        })
        return
      }
      merged.set(subgroup.id, {
        id: subgroup.id,
        label: subgroup.label,
        charts: [...subgroup.charts],
      })
    })
  })
  return Array.from(merged.values())
}

export function normalizeChartNavSelection(
  tree: ChartNavTree,
  selection: ChartNavSelection,
): ChartNavSelection {
  const validGroupIds = new Set([
    CHART_NAV_ALL,
    ...tree.categories.map(category => category.id),
  ])

  const groupId = validGroupIds.has(selection.groupId)
    ? selection.groupId
    : CHART_NAV_ALL

  const subgroupIds = new Set([
    CHART_NAV_ALL,
    ...getSubgroupsForGroup(tree, groupId).map(subgroup => subgroup.id),
  ])

  const subgroupId = subgroupIds.has(selection.subgroupId)
    ? selection.subgroupId
    : CHART_NAV_ALL

  return { groupId, subgroupId }
}

export function filterWidgetsByNavSelection(
  widgets: Widget[],
  activeGroupId: string,
  activeSubgroupId: string,
): Widget[] {
  return widgets.filter(widget => {
    const widgetGroupId = widget.groupId ?? CHART_NAV_UNGROUPED
    const widgetSubgroupId = getSubgroupId(widget.sectionName)

    const groupMatches = activeGroupId === CHART_NAV_ALL || widgetGroupId === activeGroupId
    if (!groupMatches) return false

    const subgroupMatches = activeSubgroupId === CHART_NAV_ALL || widgetSubgroupId === activeSubgroupId
    return subgroupMatches
  })
}

export function listChartIds(tree: ChartNavTree): string[] {
  return tree.categories.flatMap(category =>
    category.subgroups.flatMap(subgroup => subgroup.charts.map(chart => chart.id)),
  )
}
