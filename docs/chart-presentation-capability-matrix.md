# Governed chart presentation capability matrix

This reference describes the Phase 1 runtime contract implemented by `DashboardChartConfig.presentation`. The authoritative capability declarations remain in `src/lib/semantic/chart-template-registry.ts`; this document explains how those declarations map to the current client renderers.

An accepted refinement updates only the mutable source chart and demotes it to `draft`. Existing published release snapshots remain unchanged until the normal publish flow creates a new release.

Refinement previews are stored in the existing `ai_workflow_runs` and `ai_workflow_proposals` foundation. Apply and reject actions use the stored proposal ID; apply reloads the server-owned patch and source revision before validation, claims the proposal once, and then updates only the mutable source chart.

## Supported capabilities

| Template | Axes | Grid | Legend | Tooltip | Value labels | Density | Renderer limits |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `bar` | X/Y weight; X date preset, rotation, overflow; Y number preset | Yes | Visibility, governed aliases, overflow | Visibility, governed aliases, number preset, overflow, auxiliary `tooltipFieldIds` | Visibility, number preset, collision | Yes | Auxiliary rows render only when source rows contain a numeric metric; count aggregation has no one-to-one source row. |
| `grouped-bar` | X/Y weight; X date preset, rotation, overflow; Y number preset | Yes | Visibility, governed aliases, overflow | Visibility, governed aliases, number preset, overflow, auxiliary `tooltipFieldIds` | Visibility, number preset, collision | Yes | Auxiliary rows use the same source row as the hovered category. |
| `drilldown-bar` | X/Y weight; X date preset, rotation, overflow; Y number preset | Yes | Visibility, governed aliases, overflow | Visibility, governed aliases, number preset, overflow | Visibility, number preset, collision | Yes | Auxiliary tooltip rows are intentionally omitted because drilldown aggregation breaks direct row identity. |
| `line`, `trend-composed` | X/Y weight; X date preset, rotation, overflow; Y number preset | Yes | Visibility, governed aliases, overflow | Visibility, governed aliases, number preset, overflow, auxiliary `tooltipFieldIds` | Visibility, number preset, collision | Yes | The current `trend-composed` runtime uses the single-series line renderer. |
| `horizontal-bar` | X/Y weight; X number preset; Y overflow | Yes | Not supported | Visibility, governed aliases, number preset, overflow, auxiliary `tooltipFieldIds` | Visibility, number preset, collision | Yes | X date formatting and label rotation are rejected; auxiliary rows require direct numeric source rows. |
| `horizontal-stacked-bar` | X/Y weight; X number preset; Y overflow | Yes | Visibility, governed aliases, overflow | Visibility, governed aliases, number preset, overflow, auxiliary `tooltipFieldIds` | Visibility, number preset, collision | Yes | X date formatting and label rotation are rejected. |
| `pie`, `gauge`, `ring-gauge` | Not supported | Not supported | Visibility and generic overflow | Visibility, number preset, generic overflow | Visibility, number preset, collision | Yes | Semantic legend/tooltip aliases and auxiliary fields are intentionally omitted because aggregation does not preserve safe field-to-slice identity. These templates share the pie runtime in published dashboards. |
| `kpi-card`, `kpi-grid` | Not supported | Not supported | Not supported | Not supported | Typed number preset | Yes | The metric value is intrinsic to the card, so value-label visibility is not editable. |
| `table-grid` | Not supported | Not supported | Not supported | Not supported | Not supported | Yes | Density maps only to bounded table cell padding. |

## Safe formatting rules

- Date labels use only the approved presets declared by the presentation schema and renderer-owned `Intl.DateTimeFormat` helpers.
- Numbers use only typed, bounded `Intl.NumberFormat` options.
- Aliases are keyed by governed field or metric IDs, translated to runtime labels, then escaped before tooltip HTML is emitted.
- Overflow is limited to the declared truncate/wrap behavior and maximum length.
- No patch may supply JavaScript, formatter functions, raw SQL, or renderer option objects.
- Unsupported features are rejected by template and renderer capability validation before persistence and are also filtered by the presentation-to-style adapter.

## Intentionally deferred beyond Phase 1

- User-facing proposal history, diff browsing, and undo/redo. Durable proposal records are already captured by the workflow foundation.
- Aggregation lineage needed to resolve auxiliary tooltip fields and semantic aliases safely for pie and drilldown renderers.
- Multi-series `trend-composed` parity beyond the current line-renderer behavior.
- Column-level table presentation such as per-column number/date formats, widths, aliases, wrapping, and visibility.
- A broader renderer-parity pass for legacy builder-only chart components outside the governed template registry.
- Changes to publish snapshots, publishing RPCs, or promotion semantics. Those remain behind the existing republish boundary.
