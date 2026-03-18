import type { ChartGroup } from '@/types/project-config'
import type { Widget } from '@/types/widget'
import { resolveUppclTaxonomy } from '@/lib/builder/uppcl-api-taxonomy'

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

export interface ChartNavEndpointRef {
  name?: string
  url?: string
}

export interface ChartNavBuildOptions {
  endpointLookup?: Record<string, ChartNavEndpointRef>
}

type MutableSubgroup = {
  id: string
  label: string
  order: number
  charts: ChartNavItem[]
}

type MutableCategory = {
  id: string
  label: string
  order: number
  subgroups: Map<string, MutableSubgroup>
}

type ResolvedWidgetPlacement = {
  groupId: string
  groupLabel: string
  groupOrder: number
  subgroupId: string
  subgroupLabel: string
  subgroupOrder: number
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

function normalizeNameKey(value: string | undefined): string {
  return normalizeLabel(value, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function compareByOrderThenLabel(
  a: { order: number; label: string },
  b: { order: number; label: string },
): number {
  if (a.order !== b.order) return a.order - b.order
  return a.label.localeCompare(b.label)
}

function buildGroupIndexes(groups: ChartGroup[]) {
  const orderedGroups = [...groups].sort((a, b) => a.order - b.order)
  const groupsById = new Map(orderedGroups.map(group => [group.id, group]))
  const groupsByName = new Map(orderedGroups.map(group => [normalizeNameKey(group.name), group]))
  return { orderedGroups, groupsById, groupsByName }
}

function resolveWidgetPlacement(
  widget: Widget,
  groupsById: Map<string, ChartGroup>,
  groupsByName: Map<string, ChartGroup>,
  endpointLookup: Record<string, ChartNavEndpointRef> | undefined,
): ResolvedWidgetPlacement {
  const explicitGroup = widget.groupId ? groupsById.get(widget.groupId) : undefined
  const endpoint = widget.endpointId ? endpointLookup?.[widget.endpointId] : undefined
  const taxonomyMatch = resolveUppclTaxonomy({
    endpointName: endpoint?.name,
    endpointUrl: endpoint?.url,
  })

  let groupId = CHART_NAV_UNGROUPED
  let groupLabel = CHART_NAV_UNGROUPED_LABEL
  let groupOrder = 100000

  if (explicitGroup) {
    groupId = explicitGroup.id
    groupLabel = normalizeLabel(explicitGroup.name, 'Group')
    groupOrder = explicitGroup.order
  } else if (taxonomyMatch) {
    const matchingGroup = groupsByName.get(normalizeNameKey(taxonomyMatch.categoryLabel))
    if (matchingGroup) {
      groupId = matchingGroup.id
      groupLabel = normalizeLabel(matchingGroup.name, taxonomyMatch.categoryLabel)
      groupOrder = matchingGroup.order
    } else {
      groupId = `taxonomy:${taxonomyMatch.categoryId}`
      groupLabel = taxonomyMatch.categoryLabel
      groupOrder = 1000 + taxonomyMatch.categoryOrder
    }
  }

  const explicitSubgroupLabel = widget.sectionName?.trim()
  const subgroupLabel = explicitSubgroupLabel
    ? explicitSubgroupLabel
    : taxonomyMatch?.subgroupLabel ?? CHART_NAV_GENERAL_LABEL

  return {
    groupId,
    groupLabel,
    groupOrder,
    subgroupId: getSubgroupId(subgroupLabel),
    subgroupLabel,
    subgroupOrder: explicitSubgroupLabel
      ? 500
      : taxonomyMatch?.subgroupOrder ?? 999,
  }
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
  options: ChartNavBuildOptions = {},
): ChartNavTree {
  const { orderedGroups, groupsById, groupsByName } = buildGroupIndexes(groups)
  const categories = new Map<string, MutableCategory>()

  orderedGroups.forEach(group => {
    categories.set(group.id, {
      id: group.id,
      label: normalizeLabel(group.name, 'Group'),
      order: group.order,
      subgroups: new Map<string, MutableSubgroup>(),
    })
  })

  const upsertCategory = (categoryId: string, label: string, order: number): MutableCategory => {
    const existing = categories.get(categoryId)
    if (existing) {
      if (order < existing.order) existing.order = order
      if (existing.label === CHART_NAV_UNGROUPED_LABEL && label !== CHART_NAV_UNGROUPED_LABEL) {
        existing.label = label
      }
      return existing
    }

    const next: MutableCategory = {
      id: categoryId,
      label,
      order,
      subgroups: new Map<string, MutableSubgroup>(),
    }
    categories.set(categoryId, next)
    return next
  }

  widgets.forEach(widget => {
    const placement = resolveWidgetPlacement(
      widget,
      groupsById,
      groupsByName,
      options.endpointLookup,
    )
    const category = upsertCategory(placement.groupId, placement.groupLabel, placement.groupOrder)

    const subgroup = category.subgroups.get(placement.subgroupId) ?? {
      id: placement.subgroupId,
      label: placement.subgroupLabel,
      order: placement.subgroupOrder,
      charts: [],
    }

    if (placement.subgroupOrder < subgroup.order) {
      subgroup.order = placement.subgroupOrder
    }

    subgroup.charts.push({
      id: widget.id,
      label: normalizeLabel(widget.title, 'Untitled Widget'),
      groupId: placement.groupId,
      subgroupId: placement.subgroupId,
    })

    category.subgroups.set(placement.subgroupId, subgroup)
  })

  const orderedCategories: ChartNavCategory[] = Array.from(categories.values())
    .filter(category => category.subgroups.size > 0)
    .sort(compareByOrderThenLabel)
    .map(category => ({
      id: category.id,
      label: category.label,
      subgroups: Array.from(category.subgroups.values())
        .sort(compareByOrderThenLabel)
        .map(subgroup => ({
          id: subgroup.id,
          label: subgroup.label,
          charts: subgroup.charts,
        })),
    }))

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
  groups: ChartGroup[] = [],
  options: ChartNavBuildOptions = {},
): Widget[] {
  const { groupsById, groupsByName } = buildGroupIndexes(groups)

  return widgets.filter(widget => {
    const placement = resolveWidgetPlacement(
      widget,
      groupsById,
      groupsByName,
      options.endpointLookup,
    )

    const groupMatches = activeGroupId === CHART_NAV_ALL || placement.groupId === activeGroupId
    if (!groupMatches) return false

    const subgroupMatches = activeSubgroupId === CHART_NAV_ALL || placement.subgroupId === activeSubgroupId
    return subgroupMatches
  })
}

export function listChartIds(tree: ChartNavTree): string[] {
  return tree.categories.flatMap(category =>
    category.subgroups.flatMap(subgroup => subgroup.charts.map(chart => chart.id)),
  )
}
