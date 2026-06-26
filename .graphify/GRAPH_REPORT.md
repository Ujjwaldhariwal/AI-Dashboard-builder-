# Graph Report - .  (2026-06-26)

## Corpus Check
- 259 files · ~178,343 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2017 nodes · 5761 edges · 89 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 1507 · imports: 1194 · MODIFIES: 1081 · imports_from: 732 · calls: 446 · ON_BRANCH: 391 · PARENT_OF: 250 · references: 108 · method: 45 · inherits: 5 · re_exports: 2


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 259 · Candidates: 280
- Excluded: 5 untracked · 87844 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `2c0ba68`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Button` - 49 edges
2. `Badge()` - 43 edges
3. `requireProjectAccess()` - 28 edges
4. `getAuthedSupabase()` - 28 edges
5. `AccessContext` - 27 edges
6. `Card` - 25 edges
7. `CardContent` - 25 edges
8. `useDashboardStore` - 25 edges
9. `Input` - 24 edges
10. `generateProjectFromConfig()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `PATCH()` --calls--> `mapChart()`  [EXTRACTED]
  src/app/api/admin/semantic-models/[id]/route.ts → src/app/api/admin/dashboard-charts/[id]/route.ts
- `PATCH()` --calls--> `mapDataset()`  [EXTRACTED]
  src/app/api/admin/semantic-models/[id]/route.ts → src/app/api/admin/datasets/[id]/route.ts
- `POST()` --calls--> `labelForId()`  [EXTRACTED]
  src/app/api/client/[tenantSlug]/datasets/[id]/run/route.ts → src/app/api/client/[tenantSlug]/charts/[id]/run/route.ts
- `PATCH()` --calls--> `selectionFromDataset()`  [EXTRACTED]
  src/app/api/admin/semantic-models/[id]/route.ts → src/app/api/admin/dashboard-charts/[id]/route.ts
- `asEncoding()` --calls--> `toStringArray()`  [EXTRACTED]
  src/app/api/client/[tenantSlug]/charts/[id]/run/route.ts → src/app/api/client/[tenantSlug]/datasets/[id]/run/route.ts

## Communities

### Community 68 - "Community 68"
Cohesion: 0.25
Nodes (6): NotifType, AppNotification, NotificationStore, useNotificationStore, 27b5d6e feat(sprint-4): add bosch demo polish and export validation, d6291d8 chore(next16): migrate to proxy and flat eslint config; add store migrations

### Community 41 - "Community 41"
Cohesion: 0.11
Nodes (13): nextConfig, config, FEATURES, STEPS, STATS, 3b1c824 feat(auth-flow): visual node editor with 6 node types, compile to JSON, download config, 50b2bc4 feat(nav): add Auth Flow link to sidebar navigation, 60ab2fb feat(landing): full product showcase page with mockup, features, steps, CTA (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (19): root, apiRoots, inventoryPath, actual, inventory, documented, actualSet, documentedSet (+11 more)

### Community 63 - "Community 63"
Cohesion: 0.29
Nodes (9): OUTPUT_ROOT, ZIP_PATH, EXTRACT_DIR, ensureCleanDir(), buildValidationConfig(), writeZip(), extractZip(), main() (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.09
Nodes (23): ProjectOption, DatasetPlan, defaultEncoding(), DashboardChartsAdminPanel(), NAV_ITEMS, PlatformAdminShell(), ChartHealthState, DashboardChartAuditItem (+15 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (49): METRICS, SPRINTS, PRINCIPLES, AuthType, StatusType, AUTH_HINTS, DEFAULT_FORM, BOSCH_UPPCL_PRESET (+41 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (20): toStringArray(), mapDataset(), GET(), DatasetSchema, mapDataset(), POST(), ProjectOption, EntityWithFields (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (40): PublishSchema, RollbackSchema, SlotSchema, PageSchema, VersionCreateSchema, nextVersionNumber(), POST(), DashboardCreateSchema (+32 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (33): metadata, AuthInitializer(), Annotation, AnnotationLayerProps, Providers(), Switch, TabsList, TabsTrigger (+25 more)

### Community 30 - "Community 30"
Cohesion: 0.09
Nodes (13): supabase, FieldError, Message, NaturalLanguageQueryProps, WidgetAction, StyleAction, Message, ConfigChatbotProps (+5 more)

### Community 49 - "Community 49"
Cohesion: 0.17
Nodes (11): DemoLoginResult, STEP_LABELS, extractByPath(), asRecord(), getApiMessage(), isLogicalFailure(), asToken(), resolveLoginToken() (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (26): NavSelection, DEFAULT_NAV_SELECTION, BuilderHeaderProps, ChartSuggester(), DragDropCanvas(), ExportConfigModal(), MagicPasteModal(), FrozenChartNav (+18 more)

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (17): AppLayout(), SessionExpiredModal(), createClient(), Role, AuthIssue, AuthUser, AuthState, supabase (+9 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (29): SortColumn, SortDirection, STATUS_SORT_ORDER, InsightSeverity, InsightItem, levelBadge, MonitoringPanelProps, levelIcon (+21 more)

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (19): TenantRecord, ProjectRecord, DatasetRecord, RuntimeDashboard, DashboardHealthRunRecord, formatUpdatedAt(), gridSpanFromSlot(), chartWithSlotLayout() (+11 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (25): WidgetCard(), PdfSelector(), ChartNavItem, ChartNavSubgroup, ChartNavCategory, ChartNavTree, ChartNavSelection, ChartNavEndpointRef (+17 more)

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (23): StatusSchema, toStringArray(), selectionFromDataset(), mapChart(), PATCH(), mapDataset(), DashboardUpdateSchema, FieldMappingSchema (+15 more)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (68): requireAuditAccess(), GET(), POST(), toStringArray(), selectionFromDataset(), asEncoding(), POST(), schemaHashForTables() (+60 more)

### Community 67 - "Community 67"
Cohesion: 0.31
Nodes (7): EncodingSchema, ChartSchema, toStringArray(), selectionFromDataset(), mapChart(), POST(), DashboardChartEncoding

### Community 33 - "Community 33"
Cohesion: 0.13
Nodes (21): toStringArray(), selectionFromDataset(), metricSourceFieldIds(), POST(), asRecord(), asEncoding(), mapChart(), labelForId() (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (53): JobTypeSchema, JobStatusSchema, JobTargetTypeSchema, EnqueueJobSchema, clampLimit(), requireJobAccess(), GET(), POST() (+45 more)

### Community 34 - "Community 34"
Cohesion: 0.11
Nodes (22): TenantCreateSchema, slugifyTenantName(), mapTenant(), isMissingTenancySchema(), GET(), POST(), PlatformRole, TenantStatus (+14 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (39): ReportAgentRequestSchema, hasValidSession(), POST(), TransformAgentRequestSchema, TransformAgentResponseSchema, StoredTransformBlueprint, asRecord(), asTrimmedString() (+31 more)

### Community 62 - "Community 62"
Cohesion: 0.33
Nodes (9): POST(), buildGeminiHistory(), buildStylePrompt(), buildCreatePrompt(), 1caf797 feat: add selectedWidgetId + onSelectWidget to canvas for AI style scoping, 38303d8 fix: Gemini history fix + complete route with style/create prompts, 49dd6dd feat: AI chat route — style-only mode with Layer 3 enforcement, 71282d3 fix: complete Gemini route with buildStylePrompt + buildCreatePrompt (+1 more)

### Community 29 - "Community 29"
Cohesion: 0.15
Nodes (24): BoschCredentials, CredentialResolution, JsonRecord, RouteContext, buildEndpoint(), normalizeEnvTarget(), pickFirstDefined(), resolveBaseUrl() (+16 more)

### Community 38 - "Community 38"
Cohesion: 0.16
Nodes (18): POST(), AISuggestResponse, TrainingProfilesResponse, TrainingSummaryResponse, TrainingFeedbackPayload, profileDashboardEndpoints(), EndpointRunStatus, EndpointFieldStat (+10 more)

### Community 58 - "Community 58"
Cohesion: 0.30
Nodes (10): GET(), POST(), LegacyRouteResponseInput, legacyRouteGone(), PreviousEndpointProfileSnapshot, asRecord(), parseMappingCandidate(), parseHeaders() (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (42): Props, SharedDashboardViewer(), DataRow, sanitizeNumericString(), parseSanitizedNumber(), parseComparableNumber(), compareFilterValues(), applyParseNumber() (+34 more)

### Community 16 - "Community 16"
Cohesion: 0.10
Nodes (22): CHART_ICONS, ChartSuggesterProps, LiveAPIPreviewProps, TestMeta, SuggestedChart, LoadingStage, CHART_TYPE_LABELS, STAGE_LABELS (+14 more)

### Community 22 - "Community 22"
Cohesion: 0.09
Nodes (21): DataPrepModalProps, TransformType, TRANSFORM_TYPE_LABELS, TRANSFORM_TYPE_ORDER, FILTER_OPERATORS, MATH_OPERATORS, SORT_ORDERS, AGGREGATE_REDUCERS (+13 more)

### Community 45 - "Community 45"
Cohesion: 0.13
Nodes (6): INITIAL_NODES, INITIAL_EDGES, NODE_PALETTE, NODE_LABELS, AuthNodeData, NODE_TYPES

### Community 56 - "Community 56"
Cohesion: 0.21
Nodes (8): DragDropCanvasProps, config, 1019d7d Overhaul builder caching, manual refresh flow, sizing, and premium health UI, 1083e5c Merge branch 'codex/builder-prefetch-cache-ui-overhaul', 5aa6cce Integrate frozen chart nav and PDF token selector across builder/viewer, 887fead Polish frozen nav UI and map Builder groups from UPPCL API taxonomy, 8cc9f6c fix(builder): restore widget spans and make insights on-demand, b610bec Merge branch 'codex/builder-card-layout-insights-toggle'

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (19): WidgetCardProps, chartTypeIcon, inferNumericField(), inferCategoryField(), WidgetHeaderProps, WidgetInsightsProps, trendConfig, predictionConfig (+11 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (50): ExportConfigModalProps, DEFAULT_AI_EXPORT_CONFIG, FeatureToggleRowProps, MagicPasteModalProps, WidgetConfigDialogProps, chartIcons, CHART_TYPE_ROWS, chartTypeLabel (+42 more)

### Community 37 - "Community 37"
Cohesion: 0.10
Nodes (13): GROUP_ICONS, GROUP_COLORS, SUBGROUP_COLORS, NavSelection, FrozenChartNavProps, NavSubgroup, NavGroup, rgbaCache (+5 more)

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (18): Props, ProjectConfigPanel(), AuthStrategy, LayoutType, EncodingType, NavDensity, ChartTheme, EndpointAuthType (+10 more)

### Community 24 - "Community 24"
Cohesion: 0.10
Nodes (20): WidgetStylePanelProps, TooltipKey, TooltipField, TOOLTIP_FIELDS, LabelFormatOption, FORMAT_OPTIONS, PaletteOption, PALETTE_OPTIONS (+12 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (32): TooltipParam, ModernAreaChartProps, ModernDrilldownBarChartProps, SeriesMeta, ModernGroupedBarChartProps, TooltipParam, LabelParam, ModernHorizontalBarChartProps (+24 more)

### Community 52 - "Community 52"
Cohesion: 0.18
Nodes (7): useEnterpriseTheme(), TooltipParam, ModernBarChartProps, XAxisLayout, toCompactDateLabel(), normalizeLabel(), ModernBarChart()

### Community 23 - "Community 23"
Cohesion: 0.12
Nodes (23): useEnterpriseTheme(), useIsDarkMode(), ModernGaugeChartProps, ModernGaugeChart(), ModernGaugeChartFromData(), useEnterpriseTheme(), ModernRingGaugeChartProps, toPercent() (+15 more)

### Community 28 - "Community 28"
Cohesion: 0.09
Nodes (18): useEnterpriseTheme(), ModernGroupedBarChart(), useEnterpriseTheme(), ModernHorizontalBarChart(), useEnterpriseTheme(), ModernHorizontalStackedBarChart(), useEnterpriseTheme(), ModernLineChart() (+10 more)

### Community 46 - "Community 46"
Cohesion: 0.14
Nodes (10): useEnterpriseTheme(), ModernPieChartProps, PieSlice, TooltipParam, LabelParam, truncate(), wrapLabel(), ModernPieChart() (+2 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (18): AppLayoutProps, SearchResult, SidebarHealthFilters, KeyboardShortcuts(), NotificationBell(), OnboardingWizard(), DashboardEndpointProbeSummary, BuilderApiHealthSummary (+10 more)

### Community 79 - "Community 79"
Cohesion: 0.47
Nodes (5): PHASES, pad(), getPhase(), AILoaderProps, AILoader()

### Community 66 - "Community 66"
Cohesion: 0.20
Nodes (8): DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (25): PdfWidgetInput, PdfDownloadButtonProps, PdfDownloadButton(), ReportWidget, ReportDocumentProps, styles, ReportDocument(), TransformAgentResponseSchema (+17 more)

### Community 75 - "Community 75"
Cohesion: 0.60
Nodes (1): AlertEngine

### Community 81 - "Community 81"
Cohesion: 0.70
Nodes (1): CorrelationEngine

### Community 76 - "Community 76"
Cohesion: 0.67
Nodes (1): DataAnalyzer

### Community 60 - "Community 60"
Cohesion: 0.38
Nodes (1): AIInsightsEngine

### Community 21 - "Community 21"
Cohesion: 0.10
Nodes (25): EndpointFetchPayload, EndpointFetchErrorDetails, EndpointProbeStatus, EndpointProbeResult, AUTH_STATUS_CODES, CachedFailureEntry, ProbeCacheEntry, FAILURE_CACHE (+17 more)

### Community 55 - "Community 55"
Cohesion: 0.29
Nodes (11): BuilderDemoAuthSession, isBrowser(), normalizeEnvTarget(), decodeBase64Url(), getBuilderDemoAuthTokenExpiryMs(), BuilderDemoAuthTokenMeta, getBuilderDemoAuthTokenMeta(), getBuilderDemoAuthSession() (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (34): parseCookie(), hasSessionExpiredSignalCookie(), consumeSessionExpiredSignalCookie(), hasSupabaseAuthCookieFootprint(), HostnameKind, HostnamePolicy, LOCAL_HOSTNAMES, normalizeConfiguredHostname() (+26 more)

### Community 43 - "Community 43"
Cohesion: 0.14
Nodes (16): BoschChartBlueprint, BoschSectionBlueprint, BoschGroupBlueprint, TWO_SERIES_DEFAULT, BOSCH_UPPCL_BLUEPRINT, BoschEndpointPreset, BOSCH_UPPCL_EXTRA_ENDPOINTS, BOSCH_UPPCL_ENDPOINTS (+8 more)

### Community 61 - "Community 61"
Cohesion: 0.29
Nodes (8): AUTO_CHART_TYPES, AutoWidgetDraft, AutoWidgetBuildResult, isChartType(), getNextWidgetStartY(), applyAutoLayout(), buildAutoWidgetDraftFromPayload(), buildAutoWidgetsFromEndpoints()

### Community 51 - "Community 51"
Cohesion: 0.15
Nodes (10): UppclTaxonomySubgroup, UppclTaxonomyCategory, UppclTaxonomyMatch, UPPCL_TAXONOMY, EndpointTaxonomyLink, ENDPOINT_TAXONOMY_LINKS, CATEGORY_BY_ID, LINK_BY_ENDPOINT_KEY (+2 more)

### Community 77 - "Community 77"
Cohesion: 0.40
Nodes (5): PRESET_POSITION, getWidgetSizePreset(), getWidgetGridSpanClass(), getWidgetCardHeightClass(), WidgetPosition

### Community 44 - "Community 44"
Cohesion: 0.18
Nodes (17): ORDER_GROUPS, NamedValue, LabelComparator, MONTHS, WEEKDAYS, normalize(), buildOrderMap(), detectOrderMap() (+9 more)

### Community 47 - "Community 47"
Cohesion: 0.16
Nodes (15): DashboardShape, EndpointShape, ExportWidget, ExportEndpoint, ExportGroup, buildDashboardConfig(), slugifyDashboardName(), resolveBaseUrl() (+7 more)

### Community 26 - "Community 26"
Cohesion: 0.14
Nodes (25): generateProjectFromConfig(), buildClientSafeExportConfig(), BoschProxyDefaults, sanitizeDefaultHeadersForExport(), normalizeEnvTarget(), normalizeUrl(), extractAbsoluteBaseFromUrl(), deriveBoschProxyDefaults() (+17 more)

### Community 50 - "Community 50"
Cohesion: 0.21
Nodes (14): GeneratedFileMap, EXPORTED_CHART_TYPES, AIExportConfig, DashboardExportConfigLike, AI_DEPENDENCY_VERSIONS, verifyChartTypeCoverage(), parseExportConfig(), parseInternalAIConfig() (+6 more)

### Community 42 - "Community 42"
Cohesion: 0.19
Nodes (18): PostgresRuntimeOptions, PostgresColumnMetadata, PostgresTableMetadata, ManagedPostgresPool, globalForPostgresPools, sslConfigForMode(), decryptPostgresCredential(), createPostgresClient() (+10 more)

### Community 78 - "Community 78"
Cohesion: 0.53
Nodes (1): PDFExporter

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (43): SemanticFieldRow, SemanticMetricRow, addIssue(), validateDashboardChartConfig(), CHART_TEMPLATE_REGISTRY, getChartTemplate(), SemanticFieldRow, SemanticMetricRow (+35 more)

### Community 39 - "Community 39"
Cohesion: 0.20
Nodes (20): SourceColumn, FieldRow, MetricRow, RelationshipRow, SelectTable, CompiledSelect, DatasetQueryCompileResult, asRecord() (+12 more)

### Community 54 - "Community 54"
Cohesion: 0.21
Nodes (5): dispatchBrowserEvent(), dispatchSupabaseAuthNetworkError(), dispatchSupabaseAuthExpired(), lastWarningAt, createSupabaseRetryableFetch()

### Community 40 - "Community 40"
Cohesion: 0.14
Nodes (17): MappingEngineInput, AIFallbackInput, MappingEngineOptions, hashString(), computeFieldStats(), computeShapeSignature(), pickBestField(), pickNumericFields() (+9 more)

### Community 48 - "Community 48"
Cohesion: 0.16
Nodes (15): MappingEngineResult, TrainingTargetEndpoint, DemoSessionPayload, EndpointProfileComputation, TrainingEndpointResult, ProfileEndpointsOptions, asRecord(), normalizeLikelyReason() (+7 more)

### Community 65 - "Community 65"
Cohesion: 0.31
Nodes (1): SchemaDetector

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (28): Dashboard, APIEndpoint, DragState, supabase, CHART_TYPES, DEFAULT_DRAG_STATE, DEFAULT_WIDGET_POSITION, asRecord() (+20 more)

### Community 82 - "Community 82"
Cohesion: 1.00
Nodes (4): dashboards, auth.users, endpoints, widgets

### Community 69 - "Community 69"
Cohesion: 0.61
Nodes (7): endpoint_profile_runs, auth.users, dashboards, endpoints, endpoint_profiles, endpoint_mapping_feedback, widgets

### Community 83 - "Community 83"
Cohesion: 0.90
Nodes (4): chart_groups, dashboards, auth.users, chart_subgroups

### Community 84 - "Community 84"
Cohesion: 0.70
Nodes (4): transform_blueprints, auth.users, dashboards, endpoints

### Community 59 - "Community 59"
Cohesion: 0.30
Nodes (7): tenants, tenant_domains, tenant_memberships, auth.users, dashboard_projects, project_assignments, audit_logs

### Community 70 - "Community 70"
Cohesion: 0.54
Nodes (7): business_models, tenants, dashboard_projects, business_entities, business_fields, business_metrics, business_relationships

### Community 88 - "Community 88"
Cohesion: 0.83
Nodes (3): data_sources, tenants, dashboard_projects

### Community 85 - "Community 85"
Cohesion: 0.70
Nodes (4): data_source_columns, tenants, dashboard_projects, data_sources

### Community 86 - "Community 86"
Cohesion: 0.70
Nodes (4): semantic_datasets, tenants, dashboard_projects, business_models

### Community 73 - "Community 73"
Cohesion: 0.62
Nodes (6): dashboard_chart_configs, tenants, dashboard_projects, semantic_datasets, dashboard_chart_validation_results, auth.users

### Community 71 - "Community 71"
Cohesion: 0.46
Nodes (7): semantic_query_runs, tenants, dashboard_projects, semantic_datasets, dashboard_chart_configs, data_sources, auth.users

### Community 87 - "Community 87"
Cohesion: 0.70
Nodes (4): chart_health_runs, tenants, dashboard_projects, auth.users

### Community 64 - "Community 64"
Cohesion: 0.69
Nodes (9): published_dashboards, tenants, dashboard_projects, auth.users, dashboard_versions, dashboard_pages, dashboard_chart_slots, dashboard_chart_configs (+1 more)

### Community 74 - "Community 74"
Cohesion: 0.52
Nodes (6): dashboard_health_runs, tenants, dashboard_projects, published_dashboards, dashboard_versions, auth.users

### Community 72 - "Community 72"
Cohesion: 0.57
Nodes (7): published_dashboards, dashboard_versions, dashboard_pages, dashboard_chart_slots, dashboard_chart_configs, dashboard_publish_events, dashboard_health_runs

### Community 80 - "Community 80"
Cohesion: 0.60
Nodes (5): data_source_schema_runs, tenants, dashboard_projects, data_sources, auth.users

### Community 53 - "Community 53"
Cohesion: 0.22
Nodes (13): 00d93e8 fix: merge working builder canvas, 5f139d6 fix: replace builder placeholder with real widget canvas, caa1a43 feat: merge notifications, 01cc804 feat: merge viewer page, 0c908fa feat: add dynamic notification bell with contextual alerts, 2158669 feat: merge dashboard stats, 45fe3d1 feat: add widget edit dialog + improved chart tooltips and styling, 531a0e2 feat: add standalone viewer page for public dashboard viewing (+5 more)

### Community 57 - "Community 57"
Cohesion: 0.26
Nodes (12): 023e3fb merge: sprint5-monitoring-ui → dev, 172d5f6 Merge branch 'main' of https://github.com/Ujjwaldhariwal/AI-Dashboard-builder- into dev, 1f4e14d feat(nav): redesign chart navigator to clean scrollable tab bar, 21ee7b8 merge(dev→main): enhanced token session timer chip, 2354c5d merge(dev): Sprint 3 — macOS double-decker group navigator, 2389a85 merge(dev→main): cleanup stash conflicts, stale branches, codex-skills, remove old docs, 49a12e6 feat(data): add safe declarative data transform layer with edit UI, 8a0b538 merge(dev): Sprint 4 — safe data transform layer with edit UI (+4 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (81): 0b7de3e fix: lazy-init OpenAI client to prevent build-time crash, 0c2ff86 feat: widget polish - loading skeleton, fullscreen, duplicate, 0d7f519 chore: add jszip for client-side dashboard export, 0fa25a1 feat(export): dynamic ai feature bundling and byok env injection, 0fd0172 chore: widget-config-dialog accepts optional prefill props from suggestions, 10e4c1f fix: align Widget type, builder-store DB mapping, workspaces async handlers, 115fe9b feat(ai): OpenAI chat + suggest routes, config chatbot, chart suggester, NL query, builder AI sidebar, 141619a chore: ignore supabase temp directory (+73 more)

## Knowledge Gaps
- **486 isolated node(s):** `nextConfig`, `config`, `root`, `apiRoots`, `inventoryPath` (+481 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 75`** (1 nodes): `AlertEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `CorrelationEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `DataAnalyzer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `AIInsightsEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `PDFExporter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `SchemaDetector`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Button` connect `Community 3` to `Community 2`, `Community 16`, `Community 30`, `Community 22`, `Community 41`, `Community 45`, `Community 49`, `Community 13`, `Community 56`, `Community 19`, `Community 10`, `Community 32`, `Community 4`, `Community 31`, `Community 12`, `Community 37`, `Community 17`, `Community 18`, `Community 14`, `Community 25`, `Community 5`, `Community 36`, `Community 24`, `Community 23`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `Badge()` connect `Community 3` to `Community 2`, `Community 16`, `Community 30`, `Community 20`, `Community 22`, `Community 41`, `Community 45`, `Community 49`, `Community 13`, `Community 28`, `Community 4`, `Community 31`, `Community 12`, `Community 14`, `Community 25`, `Community 5`, `Community 36`, `Community 32`, `Community 23`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `SchemaDetector` connect `Community 65` to `Community 4`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `nextConfig`, `config`, `root` to the rest of the system?**
  _486 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 41` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Community 20` be split into smaller, more focused modules?**
  _Cohesion score 0.08620689655172414 - nodes in this community are weakly interconnected._
- **Should `Community 14` be split into smaller, more focused modules?**
  _Cohesion score 0.08571428571428572 - nodes in this community are weakly interconnected._