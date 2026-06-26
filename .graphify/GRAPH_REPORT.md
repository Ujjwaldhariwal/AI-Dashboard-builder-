# Graph Report - .  (2026-06-26)

## Corpus Check
- 280 files · ~189,367 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2167 nodes · 6105 edges · 102 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 1631 · imports: 1260 · MODIFIES: 1111 · imports_from: 771 · calls: 502 · ON_BRANCH: 397 · PARENT_OF: 256 · references: 125 · method: 45 · inherits: 5 · re_exports: 2


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 280 · Candidates: 301
- Excluded: 4 untracked · 88646 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `f655b1e`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Button` - 49 edges
2. `Badge()` - 43 edges
3. `requireProjectAccess()` - 32 edges
4. `getAuthedSupabase()` - 32 edges
5. `AccessContext` - 31 edges
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

### Community 78 - "Community 78"
Cohesion: 0.25
Nodes (6): NotifType, AppNotification, NotificationStore, useNotificationStore, 27b5d6e feat(sprint-4): add bosch demo polish and export validation, d6291d8 chore(next16): migrate to proxy and flat eslint config; add store migrations

### Community 44 - "Community 44"
Cohesion: 0.11
Nodes (13): nextConfig, config, FEATURES, STEPS, STATS, 3b1c824 feat(auth-flow): visual node editor with 6 node types, compile to JSON, download config, 50b2bc4 feat(nav): add Auth Flow link to sidebar navigation, 60ab2fb feat(landing): full product showcase page with mockup, features, steps, CTA (+5 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (19): root, apiRoots, inventoryPath, actual, inventory, documented, actualSet, documentedSet (+11 more)

### Community 72 - "Community 72"
Cohesion: 0.29
Nodes (9): OUTPUT_ROOT, ZIP_PATH, EXTRACT_DIR, ensureCleanDir(), buildValidationConfig(), writeZip(), extractZip(), main() (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (25): EncodingSchema, ChartSchema, toStringArray(), selectionFromDataset(), mapChart(), POST(), ProjectOption, DatasetPlan (+17 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (44): METRICS, SPRINTS, PRINCIPLES, supabase, FieldError, AuthType, StatusType, AUTH_HINTS (+36 more)

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (24): toStringArray(), mapDataset(), GET(), DatasetSchema, mapDataset(), POST(), ProjectOption, EntityWithFields (+16 more)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (59): TenantRecord, ProjectRecord, DatasetRecord, RuntimeDashboard, DashboardHealthRunRecord, formatUpdatedAt(), gridSpanFromSlot(), chartWithSlotLayout() (+51 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (16): Annotation, AnnotationLayerProps, SemanticModelAdminPanel(), TenantsAdminPanel(), badgeVariants, BadgeProps, buttonVariants, ButtonProps (+8 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (27): metadata, AuthInitializer(), Providers(), TabsList, TabsTrigger, TabsContent, Toaster(), AIPrediction (+19 more)

### Community 46 - "Community 46"
Cohesion: 0.16
Nodes (12): DemoLoginResult, STEP_LABELS, extractByPath(), asRecord(), getApiMessage(), isLogicalFailure(), asToken(), resolveLoginToken() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (26): NavSelection, DEFAULT_NAV_SELECTION, BuilderHeaderProps, ChartSuggester(), DragDropCanvas(), ExportConfigModal(), MagicPasteModal(), FrozenChartNav (+18 more)

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (18): AppLayout(), SessionExpiredModal(), createClient(), Role, AuthIssue, AuthUser, AuthState, supabase (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (29): SortColumn, SortDirection, STATUS_SORT_ORDER, InsightSeverity, InsightItem, levelBadge, MonitoringPanelProps, levelIcon (+21 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (25): WidgetCard(), PdfSelector(), ChartNavItem, ChartNavSubgroup, ChartNavCategory, ChartNavTree, ChartNavSelection, ChartNavEndpointRef (+17 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (27): UpdateAlertSchema, PATCH(), StatusSchema, toStringArray(), selectionFromDataset(), mapChart(), mapDataset(), DashboardUpdateSchema (+19 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (60): AlertStateSchema, clampLimit(), GET(), requireAuditAccess(), GET(), POST(), toStringArray(), selectionFromDataset() (+52 more)

### Community 79 - "Community 79"
Cohesion: 0.39
Nodes (7): ExportTypeSchema, CreateExportSchema, clampLimit(), requireExportAccess(), verifyExportTarget(), GET(), POST()

### Community 43 - "Community 43"
Cohesion: 0.17
Nodes (17): mapDataSource(), POST(), SslModeSchema, DataSourceCreateSchema, mapDataSource(), isMissingDataSourceSchema(), GET(), POST() (+9 more)

### Community 42 - "Community 42"
Cohesion: 0.16
Nodes (18): toStringArray(), selectionFromDataset(), metricSourceFieldIds(), POST(), asRecord(), asEncoding(), mapChart(), labelForId() (+10 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (23): JobTypeSchema, JobStatusSchema, JobTargetTypeSchema, EnqueueJobSchema, clampLimit(), requireJobAccess(), GET(), POST() (+15 more)

### Community 38 - "Community 38"
Cohesion: 0.14
Nodes (19): workerSecret(), isAuthorized(), batchSize(), POST(), PlatformJobSchedule, ListPlatformJobSchedulesInput, UpsertPlatformJobScheduleInput, ClaimPlatformJobSchedulesInput (+11 more)

### Community 59 - "Community 59"
Cohesion: 0.23
Nodes (9): workerSecret(), isAuthorized(), batchSize(), POST(), claimPlatformJobs(), getSupabaseServiceRoleKey(), getServiceSupabase(), 2c0ba68 feat: add platform job queue contract (+1 more)

### Community 52 - "Community 52"
Cohesion: 0.18
Nodes (14): QueryBudgetSchema, clampLimit(), requireBudgetAccess(), GET(), POST(), QueryBudgetPeriod, QueryBudgetPolicy, QueryBudgetDecision (+6 more)

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (22): TenantCreateSchema, slugifyTenantName(), mapTenant(), isMissingTenancySchema(), GET(), POST(), PlatformRole, TenantStatus (+14 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (37): ReportAgentRequestSchema, hasValidSession(), POST(), TransformAgentRequestSchema, TransformAgentResponseSchema, StoredTransformBlueprint, asRecord(), asTrimmedString() (+29 more)

### Community 71 - "Community 71"
Cohesion: 0.33
Nodes (9): POST(), buildGeminiHistory(), buildStylePrompt(), buildCreatePrompt(), 1caf797 feat: add selectedWidgetId + onSelectWidget to canvas for AI style scoping, 38303d8 fix: Gemini history fix + complete route with style/create prompts, 49dd6dd feat: AI chat route — style-only mode with Layer 3 enforcement, 71282d3 fix: complete Gemini route with buildStylePrompt + buildCreatePrompt (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (24): BoschCredentials, CredentialResolution, JsonRecord, RouteContext, buildEndpoint(), normalizeEnvTarget(), pickFirstDefined(), resolveBaseUrl() (+16 more)

### Community 64 - "Community 64"
Cohesion: 0.24
Nodes (10): POST(), PHASES, pad(), getPhase(), AILoaderProps, AILoader(), c644fdc Merge branch 'codex/chart-fixes-next', fba53e5 feat: add Bosch API training pipeline with mapping feedback and loader UI (+2 more)

### Community 67 - "Community 67"
Cohesion: 0.35
Nodes (9): GET(), POST(), LegacyRouteResponseInput, legacyRouteGone(), asRecord(), parseMappingCandidate(), parseHeaders(), getAuthedSupabase() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (42): Props, SharedDashboardViewer(), DataRow, sanitizeNumericString(), parseSanitizedNumber(), parseComparableNumber(), compareFilterValues(), applyParseNumber() (+34 more)

### Community 55 - "Community 55"
Cohesion: 0.14
Nodes (11): Message, NaturalLanguageQueryProps, WidgetAction, StyleAction, Message, ConfigChatbotProps, BASE_PROMPTS, STYLE_PROMPTS (+3 more)

### Community 22 - "Community 22"
Cohesion: 0.10
Nodes (21): CHART_ICONS, ChartSuggesterProps, LiveAPIPreviewProps, TestMeta, SuggestedChart, LoadingStage, CHART_TYPE_LABELS, STAGE_LABELS (+13 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (24): DataPrepModalProps, TransformType, TRANSFORM_TYPE_LABELS, TRANSFORM_TYPE_ORDER, FILTER_OPERATORS, MATH_OPERATORS, SORT_ORDERS, AGGREGATE_REDUCERS (+16 more)

### Community 48 - "Community 48"
Cohesion: 0.13
Nodes (6): INITIAL_NODES, INITIAL_EDGES, NODE_PALETTE, NODE_LABELS, AuthNodeData, NODE_TYPES

### Community 62 - "Community 62"
Cohesion: 0.21
Nodes (8): DragDropCanvasProps, config, 1019d7d Overhaul builder caching, manual refresh flow, sizing, and premium health UI, 1083e5c Merge branch 'codex/builder-prefetch-cache-ui-overhaul', 5aa6cce Integrate frozen chart nav and PDF token selector across builder/viewer, 887fead Polish frozen nav UI and map Builder groups from UPPCL API taxonomy, 8cc9f6c fix(builder): restore widget spans and make insights on-demand, b610bec Merge branch 'codex/builder-card-layout-insights-toggle'

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (19): WidgetCardProps, chartTypeIcon, inferNumericField(), inferCategoryField(), WidgetHeaderProps, WidgetInsightsProps, trendConfig, predictionConfig (+11 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (48): ExportConfigModalProps, DEFAULT_AI_EXPORT_CONFIG, FeatureToggleRowProps, MagicPasteModalProps, WidgetConfigDialogProps, chartIcons, CHART_TYPE_ROWS, chartTypeLabel (+40 more)

### Community 36 - "Community 36"
Cohesion: 0.10
Nodes (13): GROUP_ICONS, GROUP_COLORS, SUBGROUP_COLORS, NavSelection, FrozenChartNavProps, NavSubgroup, NavGroup, rgbaCache (+5 more)

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (18): Props, ProjectConfigPanel(), AuthStrategy, LayoutType, EncodingType, NavDensity, ChartTheme, EndpointAuthType (+10 more)

### Community 26 - "Community 26"
Cohesion: 0.10
Nodes (20): WidgetStylePanelProps, TooltipKey, TooltipField, TOOLTIP_FIELDS, LabelFormatOption, FORMAT_OPTIONS, PaletteOption, PALETTE_OPTIONS (+12 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (32): TooltipParam, ModernAreaChartProps, ModernDrilldownBarChartProps, SeriesMeta, ModernGroupedBarChartProps, TooltipParam, LabelParam, ModernHorizontalBarChartProps (+24 more)

### Community 58 - "Community 58"
Cohesion: 0.18
Nodes (7): useEnterpriseTheme(), TooltipParam, ModernBarChartProps, XAxisLayout, toCompactDateLabel(), normalizeLabel(), ModernBarChart()

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (27): useEnterpriseTheme(), useIsDarkMode(), ModernGaugeChartProps, ModernGaugeChart(), ModernGaugeChartFromData(), useEnterpriseTheme(), ModernRingGaugeChartProps, toPercent() (+19 more)

### Community 28 - "Community 28"
Cohesion: 0.09
Nodes (18): useEnterpriseTheme(), ModernGroupedBarChart(), useEnterpriseTheme(), ModernHorizontalBarChart(), useEnterpriseTheme(), ModernHorizontalStackedBarChart(), useEnterpriseTheme(), ModernLineChart() (+10 more)

### Community 49 - "Community 49"
Cohesion: 0.14
Nodes (10): useEnterpriseTheme(), ModernPieChartProps, PieSlice, TooltipParam, LabelParam, truncate(), wrapLabel(), ModernPieChart() (+2 more)

### Community 31 - "Community 31"
Cohesion: 0.11
Nodes (18): AppLayoutProps, SearchResult, SidebarHealthFilters, KeyboardShortcuts(), NotificationBell(), OnboardingWizard(), DashboardEndpointProbeSummary, BuilderApiHealthSummary (+10 more)

### Community 75 - "Community 75"
Cohesion: 0.20
Nodes (8): DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator

### Community 21 - "Community 21"
Cohesion: 0.10
Nodes (25): PdfWidgetInput, PdfDownloadButtonProps, PdfDownloadButton(), ReportWidget, ReportDocumentProps, styles, ReportDocument(), TransformAgentResponseSchema (+17 more)

### Community 88 - "Community 88"
Cohesion: 0.60
Nodes (1): AlertEngine

### Community 93 - "Community 93"
Cohesion: 0.70
Nodes (1): CorrelationEngine

### Community 89 - "Community 89"
Cohesion: 0.67
Nodes (1): DataAnalyzer

### Community 68 - "Community 68"
Cohesion: 0.38
Nodes (1): AIInsightsEngine

### Community 69 - "Community 69"
Cohesion: 0.24
Nodes (9): PlatformAlertState, PlatformAlertSeverity, PlatformAlertType, PlatformAlert, asRecord(), mapPlatformAlert(), listPlatformAlerts(), updatePlatformAlertState() (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.10
Nodes (25): EndpointFetchPayload, EndpointFetchErrorDetails, EndpointProbeStatus, EndpointProbeResult, AUTH_STATUS_CODES, CachedFailureEntry, ProbeCacheEntry, FAILURE_CACHE (+17 more)

### Community 61 - "Community 61"
Cohesion: 0.29
Nodes (11): BuilderDemoAuthSession, isBrowser(), normalizeEnvTarget(), decodeBase64Url(), getBuilderDemoAuthTokenExpiryMs(), BuilderDemoAuthTokenMeta, getBuilderDemoAuthTokenMeta(), getBuilderDemoAuthSession() (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (34): parseCookie(), hasSessionExpiredSignalCookie(), consumeSessionExpiredSignalCookie(), hasSupabaseAuthCookieFootprint(), HostnameKind, HostnamePolicy, LOCAL_HOSTNAMES, normalizeConfiguredHostname() (+26 more)

### Community 45 - "Community 45"
Cohesion: 0.13
Nodes (17): BoschChartBlueprint, BoschSectionBlueprint, BoschGroupBlueprint, TWO_SERIES_DEFAULT, BOSCH_UPPCL_BLUEPRINT, BoschEndpointPreset, BOSCH_UPPCL_EXTRA_ENDPOINTS, BOSCH_UPPCL_ENDPOINTS (+9 more)

### Community 70 - "Community 70"
Cohesion: 0.29
Nodes (8): AUTO_CHART_TYPES, AutoWidgetDraft, AutoWidgetBuildResult, isChartType(), getNextWidgetStartY(), applyAutoLayout(), buildAutoWidgetDraftFromPayload(), buildAutoWidgetsFromEndpoints()

### Community 57 - "Community 57"
Cohesion: 0.15
Nodes (10): UppclTaxonomySubgroup, UppclTaxonomyCategory, UppclTaxonomyMatch, UPPCL_TAXONOMY, EndpointTaxonomyLink, ENDPOINT_TAXONOMY_LINKS, CATEGORY_BY_ID, LINK_BY_ENDPOINT_KEY (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.18
Nodes (17): ORDER_GROUPS, NamedValue, LabelComparator, MONTHS, WEEKDAYS, normalize(), buildOrderMap(), detectOrderMap() (+9 more)

### Community 50 - "Community 50"
Cohesion: 0.16
Nodes (15): DashboardShape, EndpointShape, ExportWidget, ExportEndpoint, ExportGroup, buildDashboardConfig(), slugifyDashboardName(), resolveBaseUrl() (+7 more)

### Community 27 - "Community 27"
Cohesion: 0.14
Nodes (25): generateProjectFromConfig(), buildClientSafeExportConfig(), BoschProxyDefaults, sanitizeDefaultHeadersForExport(), normalizeEnvTarget(), normalizeUrl(), extractAbsoluteBaseFromUrl(), deriveBoschProxyDefaults() (+17 more)

### Community 56 - "Community 56"
Cohesion: 0.21
Nodes (14): GeneratedFileMap, EXPORTED_CHART_TYPES, AIExportConfig, DashboardExportConfigLike, AI_DEPENDENCY_VERSIONS, verifyChartTypeCoverage(), parseExportConfig(), parseInternalAIConfig() (+6 more)

### Community 37 - "Community 37"
Cohesion: 0.19
Nodes (19): PostgresRuntimeOptions, PostgresColumnMetadata, PostgresTableMetadata, ManagedPostgresPool, globalForPostgresPools, sslConfigForMode(), decryptPostgresCredential(), createPostgresClient() (+11 more)

### Community 76 - "Community 76"
Cohesion: 0.42
Nodes (8): PlatformJobRunResult, requireTargetId(), runDashboardHealthJob(), runSchemaRefreshJob(), runCacheWarmJob(), runExportJob(), runAlertDeliveryJob(), runPlatformJob()

### Community 90 - "Community 90"
Cohesion: 0.53
Nodes (1): PDFExporter

### Community 51 - "Community 51"
Cohesion: 0.16
Nodes (15): DashboardExportType, DashboardExportStatus, DashboardExportArtifact, CreateDashboardManifestExportInput, ListDashboardExportArtifactsInput, asRecord(), toArtifactRecord(), makeArtifactName() (+7 more)

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (21): RedisCommandResult, redisConfig(), hasRedisRuntime(), redisCommand(), redisPipeline(), RuntimeRateLimitOptions, RuntimeRateLimitDecision, RuntimeRateLimitBucket (+13 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (43): SemanticFieldRow, SemanticMetricRow, addIssue(), validateDashboardChartConfig(), CHART_TEMPLATE_REGISTRY, getChartTemplate(), SemanticFieldRow, SemanticMetricRow (+35 more)

### Community 39 - "Community 39"
Cohesion: 0.20
Nodes (20): SourceColumn, FieldRow, MetricRow, RelationshipRow, SelectTable, CompiledSelect, DatasetQueryCompileResult, asRecord() (+12 more)

### Community 40 - "Community 40"
Cohesion: 0.18
Nodes (19): WarmTarget, WarmOneResult, CacheWarmResult, toStringArray(), asRecord(), selectionFromDataset(), metricSourceFieldIds(), asEncoding() (+11 more)

### Community 60 - "Community 60"
Cohesion: 0.21
Nodes (5): dispatchBrowserEvent(), dispatchSupabaseAuthNetworkError(), dispatchSupabaseAuthExpired(), lastWarningAt, createSupabaseRetryableFetch()

### Community 41 - "Community 41"
Cohesion: 0.15
Nodes (16): AISuggestResponse, fetchAIFallbackMapping(), MappingEngineInput, AIFallbackInput, MappingEngineOptions, hashString(), computeFieldStats(), computeShapeSignature() (+8 more)

### Community 53 - "Community 53"
Cohesion: 0.16
Nodes (15): MappingEngineResult, TrainingTargetEndpoint, PreviousEndpointProfileSnapshot, DemoSessionPayload, EndpointProfileComputation, TrainingEndpointResult, ProfileEndpointsOptions, asRecord() (+7 more)

### Community 54 - "Community 54"
Cohesion: 0.14
Nodes (15): TrainingProfilesResponse, TrainingSummaryResponse, TrainingFeedbackPayload, profileDashboardEndpoints(), MappingConfidenceBand, EndpointRunStatus, ProfilePatternClass, ProfileDriftFlags (+7 more)

### Community 74 - "Community 74"
Cohesion: 0.31
Nodes (1): SchemaDetector

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (28): Dashboard, APIEndpoint, DragState, supabase, CHART_TYPES, DEFAULT_DRAG_STATE, DEFAULT_WIDGET_POSITION, asRecord() (+20 more)

### Community 94 - "Community 94"
Cohesion: 1.00
Nodes (4): dashboards, auth.users, endpoints, widgets

### Community 80 - "Community 80"
Cohesion: 0.61
Nodes (7): endpoint_profile_runs, auth.users, dashboards, endpoints, endpoint_profiles, endpoint_mapping_feedback, widgets

### Community 95 - "Community 95"
Cohesion: 0.90
Nodes (4): chart_groups, dashboards, auth.users, chart_subgroups

### Community 96 - "Community 96"
Cohesion: 0.70
Nodes (4): transform_blueprints, auth.users, dashboards, endpoints

### Community 65 - "Community 65"
Cohesion: 0.30
Nodes (7): tenants, tenant_domains, tenant_memberships, auth.users, dashboard_projects, project_assignments, audit_logs

### Community 81 - "Community 81"
Cohesion: 0.54
Nodes (7): business_models, tenants, dashboard_projects, business_entities, business_fields, business_metrics, business_relationships

### Community 101 - "Community 101"
Cohesion: 0.83
Nodes (3): data_sources, tenants, dashboard_projects

### Community 97 - "Community 97"
Cohesion: 0.70
Nodes (4): data_source_columns, tenants, dashboard_projects, data_sources

### Community 98 - "Community 98"
Cohesion: 0.70
Nodes (4): semantic_datasets, tenants, dashboard_projects, business_models

### Community 85 - "Community 85"
Cohesion: 0.62
Nodes (6): dashboard_chart_configs, tenants, dashboard_projects, semantic_datasets, dashboard_chart_validation_results, auth.users

### Community 82 - "Community 82"
Cohesion: 0.46
Nodes (7): semantic_query_runs, tenants, dashboard_projects, semantic_datasets, dashboard_chart_configs, data_sources, auth.users

### Community 99 - "Community 99"
Cohesion: 0.70
Nodes (4): chart_health_runs, tenants, dashboard_projects, auth.users

### Community 73 - "Community 73"
Cohesion: 0.69
Nodes (9): published_dashboards, tenants, dashboard_projects, auth.users, dashboard_versions, dashboard_pages, dashboard_chart_slots, dashboard_chart_configs (+1 more)

### Community 86 - "Community 86"
Cohesion: 0.52
Nodes (6): dashboard_health_runs, tenants, dashboard_projects, published_dashboards, dashboard_versions, auth.users

### Community 83 - "Community 83"
Cohesion: 0.57
Nodes (7): published_dashboards, dashboard_versions, dashboard_pages, dashboard_chart_slots, dashboard_chart_configs, dashboard_publish_events, dashboard_health_runs

### Community 91 - "Community 91"
Cohesion: 0.60
Nodes (5): data_source_schema_runs, tenants, dashboard_projects, data_sources, auth.users

### Community 100 - "Community 100"
Cohesion: 0.70
Nodes (4): platform_jobs, tenants, dashboard_projects, auth.users

### Community 87 - "Community 87"
Cohesion: 0.48
Nodes (5): platform_job_schedules, tenants, dashboard_projects, platform_jobs, auth.users

### Community 77 - "Community 77"
Cohesion: 0.36
Nodes (7): platform_alerts, tenants, dashboard_projects, auth.users, 0b3c27f feat: enforce query budget policies, bfd42b6 feat: add recurring platform job schedules, c272893 feat: add dashboard health alerts

### Community 92 - "Community 92"
Cohesion: 0.60
Nodes (5): query_budget_policies, tenants, dashboard_projects, data_sources, auth.users

### Community 84 - "Community 84"
Cohesion: 0.46
Nodes (7): dashboard_export_artifacts, tenants, dashboard_projects, published_dashboards, dashboard_versions, platform_jobs, auth.users

### Community 63 - "Community 63"
Cohesion: 0.26
Nodes (12): 023e3fb merge: sprint5-monitoring-ui → dev, 172d5f6 Merge branch 'main' of https://github.com/Ujjwaldhariwal/AI-Dashboard-builder- into dev, 1f4e14d feat(nav): redesign chart navigator to clean scrollable tab bar, 21ee7b8 merge(dev→main): enhanced token session timer chip, 2354c5d merge(dev): Sprint 3 — macOS double-decker group navigator, 2389a85 merge(dev→main): cleanup stash conflicts, stale branches, codex-skills, remove old docs, 49a12e6 feat(data): add safe declarative data transform layer with edit UI, 8a0b538 merge(dev): Sprint 4 — safe data transform layer with edit UI (+4 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (80): 0b7de3e fix: lazy-init OpenAI client to prevent build-time crash, 0c2ff86 feat: widget polish - loading skeleton, fullscreen, duplicate, 0fa25a1 feat(export): dynamic ai feature bundling and byok env injection, 10e4c1f fix: align Widget type, builder-store DB mapping, workspaces async handlers, 115fe9b feat(ai): OpenAI chat + suggest routes, config chatbot, chart suggester, NL query, builder AI sidebar, 141619a chore: ignore supabase temp directory, 15d32e3 fix(ui): show full chart names on hover in grouping chips, 18a4bfe feat: complete dnd-kit context wrap on builder page (+72 more)

### Community 66 - "Community 66"
Cohesion: 0.25
Nodes (11): caa1a43 feat: merge notifications, 01cc804 feat: merge viewer page, 0c908fa feat: add dynamic notification bell with contextual alerts, 2158669 feat: merge dashboard stats, 45fe3d1 feat: add widget edit dialog + improved chart tooltips and styling, 531a0e2 feat: add standalone viewer page for public dashboard viewing, 77dc457 feat: merge chart improvements, 7d60153 chore: refine settings page layout and behaviour (+3 more)

## Knowledge Gaps
- **512 isolated node(s):** `nextConfig`, `config`, `root`, `apiRoots`, `inventoryPath` (+507 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 88`** (1 nodes): `AlertEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (1 nodes): `CorrelationEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (1 nodes): `DataAnalyzer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `AIInsightsEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `PDFExporter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `SchemaDetector`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Button` connect `Community 3` to `Community 4`, `Community 22`, `Community 55`, `Community 16`, `Community 44`, `Community 48`, `Community 46`, `Community 12`, `Community 62`, `Community 23`, `Community 9`, `Community 0`, `Community 20`, `Community 31`, `Community 11`, `Community 36`, `Community 19`, `Community 21`, `Community 13`, `Community 14`, `Community 35`, `Community 26`, `Community 15`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `Badge()` connect `Community 3` to `Community 4`, `Community 22`, `Community 55`, `Community 24`, `Community 16`, `Community 44`, `Community 48`, `Community 46`, `Community 12`, `Community 28`, `Community 20`, `Community 31`, `Community 11`, `Community 13`, `Community 14`, `Community 0`, `Community 35`, `Community 6`, `Community 15`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `getAuthedSupabase()` connect `Community 2` to `Community 13`, `Community 79`, `Community 43`, `Community 14`, `Community 18`, `Community 24`, `Community 29`, `Community 0`, `Community 52`, `Community 42`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `nextConfig`, `config`, `root` to the rest of the system?**
  _512 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 44` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Community 24` be split into smaller, more focused modules?**
  _Cohesion score 0.08620689655172414 - nodes in this community are weakly interconnected._
- **Should `Community 13` be split into smaller, more focused modules?**
  _Cohesion score 0.08571428571428572 - nodes in this community are weakly interconnected._