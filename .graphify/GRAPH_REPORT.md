# Graph Report - .  (2026-06-24)

## Corpus Check
- 202 files · ~140,501 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1590 nodes · 4573 edges · 77 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 1160 · imports: 963 · MODIFIES: 959 · imports_from: 600 · calls: 382 · PARENT_OF: 218 · ON_BRANCH: 186 · references: 55 · method: 45 · inherits: 3 · re_exports: 2


## Input Scope
- Requested: all
- Resolved: all (source: cli)
- Included files: 202 · Candidates: recursive
- Excluded: 0 untracked · 0 ignored · 2 sensitive · 0 missing committed

## Graph Freshness
- Built from Git commit: `042fba1`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Button` - 46 edges
2. `Badge()` - 39 edges
3. `useDashboardStore` - 25 edges
4. `Card` - 23 edges
5. `CardContent` - 23 edges
6. `generateProjectFromConfig()` - 23 edges
7. `Input` - 22 edges
8. `CardHeader` - 20 edges
9. `CardTitle` - 20 edges
10. `WidgetStyle` - 19 edges

## Surprising Connections (you probably didn't know these)
- `PATCH()` --calls--> `mapDataset()`  [EXTRACTED]
  src/app/api/admin/semantic-models/[id]/route.ts → src/app/api/admin/datasets/[id]/route.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (49): METRICS, PRINCIPLES, SPRINTS, AuthType, EMPTY_FORM, EndpointStatus, 24cf646 feat(workspaces): inline dashboard rename — pencil icon on hover, Enter/blur to save, Esc to cancel, 8d14844 feat(mega-sprint): clean production build — all routes green (+41 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (63): buildDashboardConfig(), DashboardExportConfig, DashboardShape, EndpointShape, ExportEndpoint, ExportGroup, ExportWidget, joinOriginAndPath() (+55 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (44): MagicPasteModalProps, CHART_TYPE_ROWS, chartIcons, chartTypeLabel, WidgetConfigDialogProps, CHART_TYPE_ROWS, chartIcons, chartTypeLabel (+36 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (30): Alert, CorrelationResult, DataPoint, Insight, metadata, 0fb12d8 Merge pull request #1 from Ujjwaldhariwal/feature/widget-canvas, 2a76277 feat(auth): add auth layout, login page, builder layout, 4227041 feat: render widgets as live chart cards on builder page (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (42): askDataTransformer(), AskDataTransformerOptions, askReportGenerator(), askUiDesigner(), getErrorMessage(), readJsonSafe(), ReportAgentResponseSchema, TransformAgentResponseSchema (+34 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (30): AxisLabelLayout, compactDateLabel(), getAxisLabelLayout(), normalizeCategoryLabel(), parseNumericInput(), truncateLabel(), wrapAxisLabel(), showValueLabels() (+22 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (30): CHART_ICONS, ChartSuggester(), ChartSuggesterProps, AIChartGeneratorResult, AIChartSuggestion, generateAIChartSuggestions(), ChartScore, scoreChartTypes() (+22 more)

### Community 7 - "Community 7"
Cohesion: 0.10
Nodes (35): 4ea1b1b fix(api): support multi-env bosch proxy credentials and diagnostics, 8a56e9f feat(api): add Bosch proxy preset endpoints and auth-flow presets, b50e3e0 feat(sprint-3): finalize supabase persistence and schema migration, auth.users, dashboards, endpoints, widgets, auth.users (+27 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (29): levelBg, levelIcon, MonitoringPanel(), MonitoringPanelProps, InsightItem, InsightSeverity, levelBadge, SortColumn (+21 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (29): WidgetSizePreset, COMPACT_CHART_MARGIN, DEFAULT_CHART_MARGIN, getCategoryTickInterval(), getChartMargin(), getLegendVisibility(), normalizeSizePreset(), ModernAreaChart() (+21 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (28): buildOrderMap(), detectLabelComparator(), detectOrderMap(), LabelComparator, MONTHS, NamedValue, normalize(), ORDER_GROUPS (+20 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (22): CACHE, CachedResponse, clearEndpointResponseCache(), EndpointCacheEntry, fetchWithEndpointCache(), clearEndpointFailureCache(), clearEndpointProbeCache(), EndpointRuntimeTarget (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (24): DashboardEndpointProbeSummary, BuilderApiHealthSummary, dispatchBuilderApiHealthRescan(), dispatchBuilderApiHealthSummary(), 222761c feat(layout): improve responsive sidebar and mobile navigation, 656733c fix(builder): move api snapshot to sidebar and persist widget sizes, 8cc9f6c fix(builder): restore widget spans and make insights on-demand, 976e623 Merge branch 'codex/builder-sidebar-health-size-persist' (+16 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (24): BuilderDemoAuthSession, BuilderDemoAuthTokenMeta, clearBuilderDemoAuthSession(), decodeBase64Url(), getBuilderDemoAuthHeaders(), getBuilderDemoAuthSession(), getBuilderDemoAuthTokenExpiryMs(), getBuilderDemoAuthTokenMeta() (+16 more)

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (23): a9bb6cd feat(viewer+share+pdf): polished viewer with auto-refresh countdown, public share token URL, PDF export page, read-only shared viewer, asRecord(), buildShareUrl(), decodeShareToken(), encodeShareToken(), isAggregateReducer(), isDateFormat(), isFilterOperator() (+15 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (25): asRecord(), AUTH_STATUS_CODES, buildEndpointCacheKey(), buildProbeErrorResult(), CachedFailureEntry, countPayloadRows(), decodeBase64Url(), deriveFailureReason() (+17 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (21): buildEndpointRequestInit(), EndpointRequestOptions, AGGREGATE_REDUCERS, asRecord(), DataPrepModalProps, DATE_FORMAT_OPTIONS, FILTER_OPERATORS, isAggregateReducer() (+13 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (21): CHART_COLORS, ChartWrapper(), ChartWrapperProps, DEFAULT_CHART_MARGIN, 42e3e18 feat: complete ECharts migration + sprint bug fixes, 80b2ac7 feat(echarts): add enterprise theme registry and WidgetStyle translator utilities, 85e718d merge: sprint-3 ECharts migration + UX fixes, e6c9268 fix: sprint 1-4 comprehensive bug fixes (+13 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (15): BASE_PROMPTS, ConfigChatbot(), ConfigChatbotProps, Message, STYLE_PROMPTS, StyleAction, WidgetAction, INITIAL_EDGES (+7 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (28): feature/phase2-sidebar-nav, 0d7f519 chore: add jszip for client-side dashboard export, 0fd0172 chore: widget-config-dialog accepts optional prefill props from suggestions, 141619a chore: ignore supabase temp directory, 15d32e3 fix(ui): show full chart names on hover in grouping chips, 1fdc423 feat(widget-config): add all 9 chart types to picker, fix ChartType record type error, 2a091ef chore: add codex skills contract file, 2dc58b0 feat: add Export as Code button wired to full export pipeline (+20 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (24): createPostgresClient(), decryptPostgresCredential(), introspectPostgresSchema(), PostgresColumnMetadata, PostgresRuntimeOptions, PostgresTableMetadata, sslConfigForMode(), testPostgresConnection() (+16 more)

### Community 21 - "Community 21"
Cohesion: 0.10
Nodes (24): APIEndpoint, asRecord(), CHART_TYPES, Dashboard, DashboardStore, dbId(), DEFAULT_DRAG_STATE, DEFAULT_WIDGET_POSITION (+16 more)

### Community 22 - "Community 22"
Cohesion: 0.11
Nodes (21): applyConcat(), applyDateFormat(), applyFieldsToRows(), applyFilterRows(), applyGroupAggregate(), applyLimit(), applyMapValues(), applyMath() (+13 more)

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (16): 1019d7d Overhaul builder caching, manual refresh flow, sizing, and premium health UI, 1083e5c Merge branch 'codex/builder-prefetch-cache-ui-overhaul', 7a8be8c fix: sprint 5-6 export layer, auth store, middleware and login fixes, e0d0599 Merge branch 'codex/fix-chart-popup-and-supabase-fetch-errors', f3d1e43 Fix noisy widget error toasts and stabilize Supabase auth fetch handling, SessionExpiredModal(), FieldError, supabase (+8 more)

### Community 24 - "Community 24"
Cohesion: 0.10
Nodes (22): 023e3fb merge: sprint5-monitoring-ui → dev, 172d5f6 Merge branch 'main' of https://github.com/Ujjwaldhariwal/AI-Dashboard-builder- into dev, 1f4e14d feat(nav): redesign chart navigator to clean scrollable tab bar, 21ee7b8 merge(dev→main): enhanced token session timer chip, 2354c5d merge(dev): Sprint 3 — macOS double-decker group navigator, 2389a85 merge(dev→main): cleanup stash conflicts, stale branches, codex-skills, remove old docs, 49a12e6 feat(data): add safe declarative data transform layer with edit UI, 87e0fac fix(builder-ui): polish data prep modal and correct chart nav sticky layering (+14 more)

### Community 25 - "Community 25"
Cohesion: 0.13
Nodes (21): 50ab5c1 fix: persist widget layout via server API with bearer/cookie auth fallback, 9e78aad fix: route Bosch calls by session env target in token activation flow, c644fdc Merge branch 'codex/chart-fixes-next', d5ef7e8 fix: avoid PATCH writes by using upsert for dashboard/endpoint/widget updates, fba53e5 feat: add Bosch API training pipeline with mapping feedback and loader UI, FeedbackRequest, getAuthedSupabase(), POST() (+13 more)

### Community 26 - "Community 26"
Cohesion: 0.12
Nodes (22): buildChartNavTree(), buildGroupIndexes(), ChartNavBuildOptions, ChartNavCategory, ChartNavEndpointRef, ChartNavItem, ChartNavSelection, ChartNavSubgroup (+14 more)

### Community 27 - "Community 27"
Cohesion: 0.13
Nodes (19): 0e0a84b feat(sprint-2): complete ZIP export with login page, sidebar, ECharts, PDF export, project config + chart groups, 24860a1 feat(nav): add user-defined group/subgroup nav and pdf filter persistence, 27b5d6e feat(sprint-4): add bosch demo polish and export validation, 332d704 feat(sprint-2): wire ProjectConfigPanel, fix config-builder types, fill project-config types, d6291d8 chore(next16): migrate to proxy and flat eslint config; add store migrations, dc4b531 feat(auth-ui): refresh login/workspaces UX and extend project header config, ProjectConfigPanel(), Props (+11 more)

### Community 28 - "Community 28"
Cohesion: 0.14
Nodes (19): 115fe9b feat(ai): OpenAI chat + suggest routes, config chatbot, chart suggester, NL query, builder AI sidebar, b3128ec feat: stabilize auth session flow and ship data prep studio updates, hasValidSession(), POST(), ReportAgentRequestSchema, hasValidSession(), POST(), getSupabaseAnonKey() (+11 more)

### Community 29 - "Community 29"
Cohesion: 0.14
Nodes (21): asRecord(), GET(), getAuthedSupabase(), mapDbProfile(), parseHeaders(), parseMappingCandidate(), POST(), asRecord() (+13 more)

### Community 30 - "Community 30"
Cohesion: 0.13
Nodes (13): TrendAnalyzer, TrendInsight, predictionConfig, trendConfig, WidgetInsights(), WidgetInsightsProps, chartTypeIcon, inferCategoryField() (+5 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (21): GET(), isMissingTenancySchema(), mapTenant(), POST(), slugifyTenantName(), TenantCreateSchema, AuditAction, AuditLog (+13 more)

### Community 32 - "Community 32"
Cohesion: 0.12
Nodes (19): AIFallbackInput, buildDeterministicCandidate(), computeFieldStats(), computeShapeSignature(), hashString(), MappingEngineInput, MappingEngineOptions, MappingEngineResult (+11 more)

### Community 33 - "Community 33"
Cohesion: 0.37
Nodes (21): add_callout(), add_cluster_section(), add_cover_page(), add_document_styling_guide(), add_executive_dashboard(), add_extra_deliverables(), add_factor_conjoint_content(), add_findings_to_appendix() (+13 more)

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (14): listChartIds(), MagicPasteModal(), WidgetConfigDialog(), DragDropCanvas(), DragDropCanvasProps, WidgetCard(), 15dee24 feat: improve builder/viewer flows and shared dashboard fetch fidelity, 406eb03 Merge branch 'codex/builder-viewer-pdf-frozennav-tokenbar' into main (+6 more)

### Community 35 - "Community 35"
Cohesion: 0.14
Nodes (17): ModernBarChart(), useEnterpriseTheme(), ModernGaugeChart(), ModernGaugeChartFromData(), ModernGaugeChartProps, useEnterpriseTheme(), useIsDarkMode(), ModernRingGaugeChart() (+9 more)

### Community 36 - "Community 36"
Cohesion: 0.12
Nodes (13): AUTH_HINTS, AuthType, BOSCH_UPPCL_PRESET, CHART_TYPE_OPTIONS, DEFAULT_FORM, StatusType, DataPrepModal(), Annotation (+5 more)

### Community 37 - "Community 37"
Cohesion: 0.15
Nodes (14): mapMetric(), MetricSchema, POST(), semanticKey(), mapRelationship(), POST(), RelationshipSchema, BusinessEntity (+6 more)

### Community 38 - "Community 38"
Cohesion: 0.14
Nodes (16): BOSCH_UPPCL_BLUEPRINT, BOSCH_UPPCL_BLUEPRINT_STATS, BOSCH_UPPCL_CHART_INVENTORY, BOSCH_UPPCL_DEFAULT_PROJECT, BOSCH_UPPCL_ENDPOINTS, BOSCH_UPPCL_EXTRA_ENDPOINTS, BoschChartBlueprint, BoschChartInventoryRow (+8 more)

### Community 39 - "Community 39"
Cohesion: 0.14
Nodes (14): getWidgetCardHeightClass(), getWidgetGridSpanClass(), getWidgetSizeFromPreset(), getWidgetSizePreset(), PRESET_POSITION, WIDGET_SIZE_LABEL, 71282d3 fix: complete Gemini route with buildStylePrompt + buildCreatePrompt, bcf89ef fix(core): update ChartDeps to echarts, fix stale closure in fetchData useCallback (+6 more)

### Community 40 - "Community 40"
Cohesion: 0.13
Nodes (16): 0c2ff86 feat: widget polish - loading skeleton, fullscreen, duplicate, 10e4c1f fix: align Widget type, builder-store DB mapping, workspaces async handlers, 18a4bfe feat: complete dnd-kit context wrap on builder page, 18e6e9d feat: add viewMode prop to WidgetCard — hides edit/delete in viewer, 1ee2c2a merge: absorb origin/feature/sprint4-dnd-canvas into current next16 architecture, 2811a1f feat: add collapsible sidebar and responsive layout, 36cf4f9 fix: add updateDashboard to builder-store to fix TS error in workspaces, 36f51f9 feat: merge viewer-polish (+8 more)

### Community 41 - "Community 41"
Cohesion: 0.18
Nodes (8): 042fba1 feat: select semantic dataset assets, 8bc4aa2 feat: add DashboardOS platform foundation, DatasetPlan, DatasetsAdminPanel(), EntityWithFields, ProjectOption, NAV_ITEMS, PlatformAdminShell()

### Community 42 - "Community 42"
Cohesion: 0.15
Nodes (10): CATEGORY_BY_ID, collectEndpointCandidates(), ENDPOINT_TAXONOMY_LINKS, EndpointTaxonomyLink, LINK_BY_ENDPOINT_KEY, resolveUppclTaxonomy(), UPPCL_TAXONOMY, UppclTaxonomyCategory (+2 more)

### Community 43 - "Community 43"
Cohesion: 0.22
Nodes (10): DatasetSchema, mapDataset(), POST(), mapBusinessModel(), mapDataset(), PATCH(), StatusSchema, SemanticDataset (+2 more)

### Community 44 - "Community 44"
Cohesion: 0.22
Nodes (8): GET(), mapDataset(), toStringArray(), GET(), isMissingSchemaColumns(), AuthedSupabaseContext, getAuthedSupabase(), requirePlatformAdmin()

### Community 45 - "Community 45"
Cohesion: 0.21
Nodes (5): dispatchBrowserEvent(), dispatchSupabaseAuthExpired(), dispatchSupabaseAuthNetworkError(), createSupabaseRetryableFetch(), lastWarningAt

### Community 46 - "Community 46"
Cohesion: 0.17
Nodes (6): FEATURES, STATS, STEPS, 0071301 Initial commit from Create Next App, nextConfig, config

### Community 47 - "Community 47"
Cohesion: 0.30
Nodes (7): audit_logs, auth.users, dashboard_projects, project_assignments, tenant_domains, tenant_memberships, tenants

### Community 48 - "Community 48"
Cohesion: 0.25
Nodes (9): consumeSessionExpiredSignalCookie(), hasSessionExpiredSignalCookie(), hasSupabaseAuthCookieFootprint(), parseCookie(), ADMIN_ONLY, clearSessionExpiredSignal(), config, proxy() (+1 more)

### Community 49 - "Community 49"
Cohesion: 0.25
Nodes (9): applyAutoLayout(), AUTO_CHART_TYPES, AutoWidgetBuildResult, AutoWidgetDraft, buildAutoWidgetDraftFromPayload(), buildAutoWidgetsFromEndpoints(), getNextWidgetStartY(), isChartType() (+1 more)

### Community 50 - "Community 50"
Cohesion: 0.38
Nodes (1): AIInsightsEngine

### Community 51 - "Community 51"
Cohesion: 0.29
Nodes (9): buildCreatePrompt(), buildGeminiHistory(), buildStylePrompt(), POST(), 1caf797 feat: add selectedWidgetId + onSelectWidget to canvas for AI style scoping, 38303d8 fix: Gemini history fix + complete route with style/create prompts, 49dd6dd feat: AI chat route — style-only mode with Layer 3 enforcement, ca9c9f3 fix(sprint-0): UI scale 14px, remove duplicate AI btn, fix tabs context, fix SSL conditional, fix regex escapes, token guard on fields (+1 more)

### Community 52 - "Community 52"
Cohesion: 0.20
Nodes (10): 0fa25a1 feat(export): dynamic ai feature bundling and byok env injection, 239a125 fix(export): harden standalone bosch proxy routing and auth defaults, 2866562 docs: add PROJECT_STATE.md blueprint, 676bfa8 feat(ai): implement structured subagents, strict schemas, and ai pdf report flow, 74e8979 feat(ui): revamp widget header and responsive app layout, 768eb03 Refine builder sticky chart navigator spacing and behavior, 7ae5344 fix(export): prompt for absolute api base url during standalone export, 7b391ce fix(export): resolve login URL 404 and enforce standalone base URL preflight (+2 more)

### Community 53 - "Community 53"
Cohesion: 0.31
Nodes (1): SchemaDetector

### Community 54 - "Community 54"
Cohesion: 0.33
Nodes (8): FieldMappingSchema, GET(), mapEntity(), mapField(), POST(), semanticKey(), BusinessEntityType, BusinessFieldRole

### Community 55 - "Community 55"
Cohesion: 0.31
Nodes (8): DashboardProject, GET(), isMissingProjectSchema(), mapProject(), POST(), ProjectCreateSchema, ProjectWithTenant, DashboardProject

### Community 56 - "Community 56"
Cohesion: 0.61
Nodes (7): auth.users, dashboards, endpoint_mapping_feedback, endpoint_profile_runs, endpoint_profiles, endpoints, widgets

### Community 57 - "Community 57"
Cohesion: 0.54
Nodes (7): business_entities, business_fields, business_metrics, business_models, business_relationships, dashboard_projects, tenants

### Community 58 - "Community 58"
Cohesion: 0.36
Nodes (7): BusinessModelCreateSchema, GET(), isMissingSemanticSchema(), mapBusinessModel(), POST(), BusinessModel, BusinessModelStatus

### Community 59 - "Community 59"
Cohesion: 0.33
Nodes (4): Message, NaturalLanguageQueryProps, Input, InputProps

### Community 60 - "Community 60"
Cohesion: 0.43
Nodes (7): 00d93e8 fix: merge working builder canvas, 01cc804 feat: merge viewer page, 0c908fa feat: add dynamic notification bell with contextual alerts, 531a0e2 feat: add standalone viewer page for public dashboard viewing, 5f139d6 fix: replace builder placeholder with real widget canvas, 7d60153 chore: refine settings page layout and behaviour, caa1a43 feat: merge notifications

### Community 61 - "Community 61"
Cohesion: 0.29
Nodes (6): 02c54d5 feat(monitoring+notifs): full monitoring page, real notification store, bell wired to errors+health, 94b2b57 fix(auth): full edge-case login handling | feat(settings): back button + role badges, AppNotification, NotificationStore, NotifType, useNotificationStore

### Community 62 - "Community 62"
Cohesion: 0.29
Nodes (7): 0b7de3e fix: lazy-init OpenAI client to prevent build-time crash, 5e0538f fix: add legacy-peer-deps for Vercel deploy, 8c0f106 fix: lazy-init OpenAI in both AI routes — prevents build-time crash, b12c0d4 feat: wire widget.style into all chart renderers, b328a5e fix: correct .npmrc encoding for Vercel, dd64325 fix: use cloudflare proxy for supabase, e7f6629 feat: add 3-layer schema + updateWidgetStyle/resetWidgetStyle to builder-store

### Community 63 - "Community 63"
Cohesion: 0.29
Nodes (7): 3001878 fix(data-analyzer): BFS depth per-node, fix id filter, fallback for all-string fields, 3e0cc2d fix: add missing supabase client module for browser, 8d9a051 fix(builder): remove dead chart-wrapper import, fix addWidget dataMapping, sidebar widget count, b3c5f54 fix(store): prevent duplicate widget IDs from rapid magic-paste addWidget calls, bfa9595 fix(builder): unique widget IDs, live field fetch in config dialog, fix form overflow, c005b12 feat: upgrade widget types for multi-metrics and build bfs json schema analyzer, d12cc8e refactor(store): update auth-store session handling and types cleanup

### Community 64 - "Community 64"
Cohesion: 0.33
Nodes (5): AIPrediction, ApiEndpoint, ApiSchema, ChartConfig, DashboardConfig

### Community 65 - "Community 65"
Cohesion: 0.60
Nodes (1): AlertEngine

### Community 66 - "Community 66"
Cohesion: 0.67
Nodes (1): DataAnalyzer

### Community 67 - "Community 67"
Cohesion: 0.47
Nodes (6): 2158669 feat: merge dashboard stats, 45fe3d1 feat: add widget edit dialog + improved chart tooltips and styling, 77dc457 feat: merge chart improvements, 7ddb0c2 feat: add settings page with profile, preferences, stats and danger zone, a33da71 feat: merge settings page, c5fdab2 feat: add ownerId to dashboards and stats bar to workspaces page

### Community 68 - "Community 68"
Cohesion: 0.53
Nodes (1): PDFExporter

### Community 69 - "Community 69"
Cohesion: 0.47
Nodes (5): AILoader(), AILoaderProps, getPhase(), pad(), PHASES

### Community 70 - "Community 70"
Cohesion: 0.70
Nodes (1): CorrelationEngine

### Community 71 - "Community 71"
Cohesion: 0.40
Nodes (1): ErrorBoundaryClass

### Community 72 - "Community 72"
Cohesion: 0.90
Nodes (4): auth.users, chart_groups, chart_subgroups, dashboards

### Community 73 - "Community 73"
Cohesion: 0.70
Nodes (4): auth.users, dashboards, endpoints, transform_blueprints

### Community 74 - "Community 74"
Cohesion: 0.70
Nodes (4): dashboard_projects, data_source_columns, data_sources, tenants

### Community 75 - "Community 75"
Cohesion: 0.70
Nodes (4): business_models, dashboard_projects, semantic_datasets, tenants

### Community 76 - "Community 76"
Cohesion: 0.83
Nodes (3): dashboard_projects, data_sources, tenants

## Knowledge Gaps
- **385 isolated node(s):** `nextConfig`, `config`, `OUTPUT_ROOT`, `ZIP_PATH`, `EXTRACT_DIR` (+380 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 50`** (1 nodes): `AIInsightsEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `SchemaDetector`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `AlertEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `DataAnalyzer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `PDFExporter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `CorrelationEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `ErrorBoundaryClass`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Button` connect `Community 2` to `Community 0`, `Community 6`, `Community 18`, `Community 59`, `Community 36`, `Community 16`, `Community 46`, `Community 13`, `Community 11`, `Community 34`, `Community 30`, `Community 9`, `Community 12`, `Community 8`, `Community 23`, `Community 24`, `Community 4`, `Community 41`, `Community 27`, `Community 17`, `Community 35`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `Badge()` connect `Community 0` to `Community 6`, `Community 18`, `Community 59`, `Community 36`, `Community 16`, `Community 46`, `Community 13`, `Community 2`, `Community 11`, `Community 12`, `Community 8`, `Community 41`, `Community 27`, `Community 3`, `Community 35`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `SchemaDetector` connect `Community 53` to `Community 64`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `nextConfig`, `config`, `OUTPUT_ROOT` to the rest of the system?**
  _385 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05029838022165388 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07191961924907457 - nodes in this community are weakly interconnected._