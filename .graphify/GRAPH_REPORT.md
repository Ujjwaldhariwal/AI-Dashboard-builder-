# Graph Report - .  (2026-06-26)

## Corpus Check
- 275 files · ~185,370 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2117 nodes · 5979 edges · 99 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 1588 · imports: 1239 · MODIFIES: 1103 · imports_from: 756 · calls: 473 · ON_BRANCH: 395 · PARENT_OF: 254 · references: 119 · method: 45 · inherits: 5 · re_exports: 2


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 275 · Candidates: 296
- Excluded: 2 untracked · 88293 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `0b3c27f`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Button` - 49 edges
2. `Badge()` - 43 edges
3. `requireProjectAccess()` - 31 edges
4. `getAuthedSupabase()` - 31 edges
5. `AccessContext` - 30 edges
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

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (66): AlertStateSchema, clampLimit(), GET(), GET(), POST(), requireAuditAccess(), 00aea45 feat: harden platform access and query telemetry, 5eccbb3 feat: track schema introspection freshness (+58 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (80): feature/db-dashboard-foundation, feature/phase2-sidebar-nav, 0b7de3e fix: lazy-init OpenAI client to prevent build-time crash, 0c2ff86 feat: widget polish - loading skeleton, fullscreen, duplicate, 0d7f519 chore: add jszip for client-side dashboard export, 0fa25a1 feat(export): dynamic ai feature bundling and byok env injection, 0fd0172 chore: widget-config-dialog accepts optional prefill props from suggestions, 10e4c1f fix: align Widget type, builder-store DB mapping, workspaces async handlers (+72 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (48): MagicPasteModalProps, CHART_TYPE_ROWS, chartIcons, chartTypeLabel, WidgetConfigDialogProps, CHART_TYPE_ROWS, chartIcons, chartTypeLabel (+40 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (44): METRICS, PRINCIPLES, SPRINTS, AUTH_HINTS, AuthType, BOSCH_UPPCL_PRESET, CHART_TYPE_OPTIONS, DEFAULT_FORM (+36 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (40): b98f9a0 chore: pre-demo cleanup snapshot, ProjectOption, PublishedDashboardsAdminPanel(), statusClassName(), VersionHistory, PublishSchema, DashboardCreateSchema, auditDashboardVersion() (+32 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (42): applyConcat(), applyDateFormat(), applyFieldsToRows(), applyFilterRows(), applyGroupAggregate(), applyLimit(), applyMapValues(), applyMath() (+34 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (27): Alert, CorrelationResult, DataPoint, Insight, metadata, 0fb12d8 Merge pull request #1 from Ujjwaldhariwal/feature/widget-canvas, 2a76277 feat(auth): add auth layout, login page, builder layout, 4227041 feat: render widgets as live chart cards on builder page (+19 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (43): 10d4599 feat: add chart compatibility engine, dc7edfe feat: add dashboard chart config schema, addIssue(), SemanticFieldRow, SemanticMetricRow, validateDashboardChartConfig(), CHART_TEMPLATE_REGISTRY, getChartTemplate() (+35 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (37): TransformOpSchema, getGoogleApiKey(), getGoogleModel(), GOOGLE_API_KEY_ENV_CANDIDATES, 87e0fac fix(builder-ui): polish data prep modal and correct chart nav sticky layering, b3128ec feat: stabilize auth session flow and ship data prep studio updates, b6bcb11 feat(builder): checkpoint data prep, chart UX, and auth stability updates, hasValidSession() (+29 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (32): WidgetSizePreset, COMPACT_CHART_MARGIN, DEFAULT_CHART_MARGIN, getCategoryTickInterval(), getChartMargin(), getLegendVisibility(), normalizeSizePreset(), showValueLabels() (+24 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (34): consumeSessionExpiredSignalCookie(), hasSessionExpiredSignalCookie(), hasSupabaseAuthCookieFootprint(), parseCookie(), getPlatformHostnames(), getTenantRootDomains(), HostnameKind, HostnamePolicy (+26 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (29): levelBg, levelIcon, MonitoringPanel(), MonitoringPanelProps, InsightItem, InsightSeverity, levelBadge, SortColumn (+21 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (26): ChartSuggester(), CACHE, CachedResponse, clearEndpointResponseCache(), EndpointCacheEntry, fetchWithEndpointCache(), clearEndpointFailureCache(), clearEndpointProbeCache() (+18 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (25): 3c6e599 feat: add admin chart composer, 564cdeb feat: gate chart publishing with validation, ChartSchema, EncodingSchema, mapChart(), POST(), selectionFromDataset(), toStringArray() (+17 more)

### Community 14 - "Community 14"
Cohesion: 0.10
Nodes (24): 042fba1 feat: select semantic dataset assets, 208f284 feat: compile semantic dataset query plans, 48be0f0 style: add Monokai admin theme, 8bc4aa2 feat: add DashboardOS platform foundation, ce49a9b feat: execute semantic dataset previews, ef90211 feat: preview semantic dataset plans, DatasetSchema, mapDataset() (+16 more)

### Community 15 - "Community 15"
Cohesion: 0.10
Nodes (27): applyTransforms(), getWidgetCardHeightClass(), getWidgetGridSpanClass(), getWidgetSizePreset(), PRESET_POSITION, ModernGaugeChart(), ModernGaugeChartFromData(), ModernGaugeChartProps (+19 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (24): buildEndpointRequestInit(), EndpointRequestOptions, AGGREGATE_REDUCERS, asRecord(), DataPrepModalProps, DATE_FORMAT_OPTIONS, FILTER_OPERATORS, isAggregateReducer() (+16 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (28): 50ab5c1 fix: persist widget layout via server API with bearer/cookie auth fallback, 8d9a051 fix(builder): remove dead chart-wrapper import, fix addWidget dataMapping, sidebar widget count, b3c5f54 fix(store): prevent duplicate widget IDs from rapid magic-paste addWidget calls, bfa9595 fix(builder): unique widget IDs, live field fetch in config dialog, fix form overflow, d5ef7e8 fix: avoid PATCH writes by using upsert for dashboard/endpoint/widget updates, APIEndpoint, asRecord(), CHART_TYPES (+20 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (26): FieldMappingSchema, GET(), mapEntity(), mapField(), POST(), semanticKey(), DashboardUpdateSchema, mapBusinessModel() (+18 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (25): buildChartNavTree(), buildGroupIndexes(), ChartNavBuildOptions, ChartNavCategory, ChartNavEndpointRef, ChartNavItem, ChartNavSelection, ChartNavSubgroup (+17 more)

### Community 20 - "Community 20"
Cohesion: 0.09
Nodes (16): Annotation, AnnotationLayerProps, cn(), SemanticModelAdminPanel(), TenantsAdminPanel(), GUARDRAILS, MODEL_LAYERS, ACCESS_RULES (+8 more)

### Community 21 - "Community 21"
Cohesion: 0.10
Nodes (25): askDataTransformer(), AskDataTransformerOptions, askReportGenerator(), askUiDesigner(), getErrorMessage(), readJsonSafe(), ReportAgentResponseSchema, TransformAgentResponseSchema (+17 more)

### Community 22 - "Community 22"
Cohesion: 0.10
Nodes (21): CHART_ICONS, ChartSuggesterProps, AIChartGeneratorResult, AIChartSuggestion, generateAIChartSuggestions(), ChartScore, scoreChartTypes(), selectBestChartType() (+13 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (19): TrendAnalyzer, TrendInsight, predictionConfig, trendConfig, WidgetInsights(), WidgetInsightsProps, chartTypeIcon, inferCategoryField() (+11 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (19): ApiDocEndpoint, extractLine(), parseApiInventory(), readApiInventory(), 0b17d50 feat: add admin API docs inventory page, 2950d4c feat: expose API docs inventory JSON, 9bbd88b test: check API inventory coverage, bc47d2f docs: add Apidog API inventory (+11 more)

### Community 25 - "Community 25"
Cohesion: 0.10
Nodes (25): asRecord(), AUTH_STATUS_CODES, buildEndpointCacheKey(), buildProbeErrorResult(), CachedFailureEntry, countPayloadRows(), decodeBase64Url(), deriveFailureReason() (+17 more)

### Community 26 - "Community 26"
Cohesion: 0.10
Nodes (20): CHART_COLORS, ChartWrapper(), ChartWrapperProps, DEFAULT_CHART_MARGIN, 42e3e18 feat: complete ECharts migration + sprint bug fixes, 85e718d merge: sprint-3 ECharts migration + UX fixes, e6c9268 fix: sprint 1-4 comprehensive bug fixes, BOSCH_COLORS (+12 more)

### Community 27 - "Community 27"
Cohesion: 0.14
Nodes (25): BoschProxyDefaults, buildClientSafeExportConfig(), deriveBoschProxyDefaults(), extractAbsoluteBaseFromUrl(), generateApiClient(), generateAuthGuard(), generateBoschProxyRoute(), generateDashboardLayout() (+17 more)

### Community 28 - "Community 28"
Cohesion: 0.09
Nodes (18): ModernGroupedBarChart(), useEnterpriseTheme(), ModernHorizontalBarChart(), useEnterpriseTheme(), ModernHorizontalStackedBarChart(), useEnterpriseTheme(), ModernLineChart(), useEnterpriseTheme() (+10 more)

### Community 29 - "Community 29"
Cohesion: 0.12
Nodes (22): 03090c8 docs: refresh db dashboard handoff context, 5caf9c9 feat: expose query runtime history, 63029fc feat: revalidate client chart runtime, c2be49d feat: rate limit query runtime calls, e929a78 feat: persist chart health snapshots, ec0739b feat: show chart audit health in admin, f22b8bd feat: add chart health audit endpoint, f3635b1 chore: remove legacy builder schema (+14 more)

### Community 30 - "Community 30"
Cohesion: 0.13
Nodes (22): 2360297 feat: add distributed runtime cache interface, hasRedisRuntime(), redisCommand(), RedisCommandResult, redisConfig(), redisPipeline(), buckets, checkInMemoryRuntimeRateLimit() (+14 more)

### Community 31 - "Community 31"
Cohesion: 0.12
Nodes (23): asRecord(), ClaimPlatformJobsInput, completePlatformJob(), CompletePlatformJobInput, enqueuePlatformJob(), EnqueuePlatformJobInput, failPlatformJob(), FailPlatformJobInput (+15 more)

### Community 32 - "Community 32"
Cohesion: 0.15
Nodes (24): asRecord(), BoschCredentials, buildEndpoint(), buildForwardedCookie(), buildUpstreamHeaders(), CredentialResolution, extractTokenFromCookieHeader(), extractTokenFromSetCookie() (+16 more)

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (18): DashboardEndpointProbeSummary, BuilderApiHealthSummary, dispatchBuilderApiHealthRescan(), dispatchBuilderApiHealthSummary(), 02c54d5 feat(monitoring+notifs): full monitoring page, real notification store, bell wired to errors+health, 24cf646 feat(workspaces): inline dashboard rename — pencil icon on hover, Enter/blur to save, Esc to cancel, 656733c fix(builder): move api snapshot to sidebar and persist widget sizes, 976e623 Merge branch 'codex/builder-sidebar-health-size-persist' (+10 more)

### Community 34 - "Community 34"
Cohesion: 0.11
Nodes (19): PublishedChartsGrid(), DatasetRunResult, PublishedDatasetPreview(), PublishedDatasetPreviewProps, 5368537 feat: preview published client datasets, abbe245 feat: add client dataset run endpoint, f886a57 feat: render published client datasets, CHARTS (+11 more)

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (22): GET(), isMissingTenancySchema(), mapTenant(), POST(), slugifyTenantName(), TenantCreateSchema, AuditAction, AuditLog (+14 more)

### Community 36 - "Community 36"
Cohesion: 0.12
Nodes (18): 00d93e8 fix: merge working builder canvas, 3001878 fix(data-analyzer): BFS depth per-node, fix id filter, fallback for all-string fields, 5f139d6 fix: replace builder placeholder with real widget canvas, 7a8be8c fix: sprint 5-6 export layer, auth store, middleware and login fixes, b94709d chore(config): update middleware matchers, utils helpers, supabase client, d12cc8e refactor(store): update auth-store session handling and types cleanup, d925a60 feat(ui): add token expiry countdown and session status indicators, e0d0599 Merge branch 'codex/fix-chart-popup-and-supabase-fetch-errors' (+10 more)

### Community 37 - "Community 37"
Cohesion: 0.13
Nodes (18): 0e0a84b feat(sprint-2): complete ZIP export with login page, sidebar, ECharts, PDF export, project config + chart groups, 332d704 feat(sprint-2): wire ProjectConfigPanel, fix config-builder types, fill project-config types, dc4b531 feat(auth-ui): refresh login/workspaces UX and extend project header config, ProjectConfigPanel(), Props, AIExportConfig, ApiEndpointConfig, AuthStrategy (+10 more)

### Community 38 - "Community 38"
Cohesion: 0.10
Nodes (13): 15dee24 feat: improve builder/viewer flows and shared dashboard fetch fidelity, 406eb03 Merge branch 'codex/builder-viewer-pdf-frozennav-tokenbar' into main, ErrorBoundaryClass, ErrorBoundaryProps, ErrorBoundaryState, FrozenChartNavProps, GROUP_COLORS, GROUP_ICONS (+5 more)

### Community 39 - "Community 39"
Cohesion: 0.19
Nodes (19): cleanupIdlePostgresPools(), createPostgresClient(), decryptPostgresCredential(), evictOldestIdlePool(), executePostgresReadOnlyQuery(), getPostgresPool(), globalForPostgresPools, introspectPostgresSchema() (+11 more)

### Community 40 - "Community 40"
Cohesion: 0.20
Nodes (20): addTable(), aggregationSql(), asRecord(), asSourceColumn(), columnSql(), compileDatasetQueryPlan(), CompiledSelect, compileRelationshipJoin() (+12 more)

### Community 41 - "Community 41"
Cohesion: 0.15
Nodes (16): AISuggestResponse, fetchAIFallbackMapping(), AIFallbackInput, buildDeterministicCandidate(), computeFieldStats(), computeShapeSignature(), hashString(), MappingEngineInput (+8 more)

### Community 42 - "Community 42"
Cohesion: 0.15
Nodes (18): asRecord(), claimPlatformJobSchedules(), ClaimPlatformJobSchedulesInput, enqueueJobFromSchedule(), listPlatformJobSchedules(), ListPlatformJobSchedulesInput, mapPlatformJobSchedule(), markScheduleEnqueued() (+10 more)

### Community 43 - "Community 43"
Cohesion: 0.11
Nodes (13): FEATURES, STATS, STEPS, 0071301 Initial commit from Create Next App, 3b1c824 feat(auth-flow): visual node editor with 6 node types, compile to JSON, download config, 50b2bc4 feat(nav): add Auth Flow link to sidebar navigation, 60ab2fb feat(landing): full product showcase page with mockup, features, steps, CTA, 8bca7ed feat: surface DashboardOS UI entrypoints (+5 more)

### Community 44 - "Community 44"
Cohesion: 0.13
Nodes (17): BOSCH_UPPCL_BLUEPRINT, BOSCH_UPPCL_BLUEPRINT_STATS, BOSCH_UPPCL_CHART_INVENTORY, BOSCH_UPPCL_DEFAULT_PROJECT, BOSCH_UPPCL_ENDPOINTS, BOSCH_UPPCL_EXTRA_ENDPOINTS, BoschChartBlueprint, BoschChartInventoryRow (+9 more)

### Community 45 - "Community 45"
Cohesion: 0.16
Nodes (16): asRecord(), listPlatformAlerts(), mapPlatformAlert(), PlatformAlert, PlatformAlertSeverity, PlatformAlertState, PlatformAlertType, reconcileDashboardHealthAlerts() (+8 more)

### Community 46 - "Community 46"
Cohesion: 0.16
Nodes (12): asRecord(), asToken(), AuthFlowPage(), DemoLoginResult, extractByPath(), formatRemainingTime(), getApiMessage(), isLogicalFailure() (+4 more)

### Community 47 - "Community 47"
Cohesion: 0.18
Nodes (17): buildOrderMap(), detectLabelComparator(), detectOrderMap(), LabelComparator, MONTHS, NamedValue, normalize(), ORDER_GROUPS (+9 more)

### Community 48 - "Community 48"
Cohesion: 0.13
Nodes (6): INITIAL_EDGES, INITIAL_NODES, NODE_LABELS, NODE_PALETTE, AuthNodeData, NODE_TYPES

### Community 49 - "Community 49"
Cohesion: 0.14
Nodes (10): LabelParam, ModernPieChart(), ModernPieChartProps, PieSlice, TooltipParam, truncate(), useEnterpriseTheme(), wrapLabel() (+2 more)

### Community 50 - "Community 50"
Cohesion: 0.16
Nodes (15): buildDashboardConfig(), DashboardShape, EndpointShape, ExportEndpoint, ExportGroup, ExportWidget, joinOriginAndPath(), resolveBaseUrl() (+7 more)

### Community 51 - "Community 51"
Cohesion: 0.18
Nodes (14): clampLimit(), GET(), POST(), QueryBudgetSchema, requireBudgetAccess(), checkQueryBudget(), listQueryBudgetPolicies(), mapQueryBudgetPolicy() (+6 more)

### Community 52 - "Community 52"
Cohesion: 0.16
Nodes (15): MappingEngineResult, asRecord(), buildRequestInit(), DemoSessionPayload, EndpointProfileComputation, isUnauthorizedPayload(), mapEngineToResult(), normalizeLikelyReason() (+7 more)

### Community 53 - "Community 53"
Cohesion: 0.14
Nodes (15): profileDashboardEndpoints(), TrainingFeedbackPayload, TrainingProfilesResponse, TrainingSummaryResponse, DEFAULT_PROFILE_DRIFT_FLAGS, EndpointMappingFeedback, EndpointProfile, EndpointProfileRun (+7 more)

### Community 54 - "Community 54"
Cohesion: 0.14
Nodes (11): BASE_PROMPTS, ConfigChatbot(), ConfigChatbotProps, Message, STYLE_PROMPTS, StyleAction, WidgetAction, Message (+3 more)

### Community 55 - "Community 55"
Cohesion: 0.21
Nodes (14): EXPORTED_CHART_TYPES, GeneratedFileMap, AI_DEPENDENCY_VERSIONS, AIExportConfig, DashboardExportConfigLike, injectAIDependencies(), injectAIEnv(), injectAIFiles() (+6 more)

### Community 56 - "Community 56"
Cohesion: 0.15
Nodes (10): CATEGORY_BY_ID, collectEndpointCandidates(), ENDPOINT_TAXONOMY_LINKS, EndpointTaxonomyLink, LINK_BY_ENDPOINT_KEY, resolveUppclTaxonomy(), UPPCL_TAXONOMY, UppclTaxonomyCategory (+2 more)

### Community 57 - "Community 57"
Cohesion: 0.18
Nodes (7): ModernBarChart(), ModernBarChartProps, normalizeLabel(), toCompactDateLabel(), TooltipParam, useEnterpriseTheme(), XAxisLayout

### Community 58 - "Community 58"
Cohesion: 0.23
Nodes (9): 2c0ba68 feat: add platform job queue contract, 8f1c410 feat: execute platform jobs with worker route, claimPlatformJobs(), getSupabaseServiceRoleKey(), getServiceSupabase(), batchSize(), isAuthorized(), POST() (+1 more)

### Community 59 - "Community 59"
Cohesion: 0.21
Nodes (5): dispatchBrowserEvent(), dispatchSupabaseAuthExpired(), dispatchSupabaseAuthNetworkError(), createSupabaseRetryableFetch(), lastWarningAt

### Community 60 - "Community 60"
Cohesion: 0.29
Nodes (11): BuilderDemoAuthSession, BuilderDemoAuthTokenMeta, clearBuilderDemoAuthSession(), decodeBase64Url(), getBuilderDemoAuthHeaders(), getBuilderDemoAuthSession(), getBuilderDemoAuthTokenExpiryMs(), getBuilderDemoAuthTokenMeta() (+3 more)

### Community 61 - "Community 61"
Cohesion: 0.21
Nodes (8): DragDropCanvasProps, 1019d7d Overhaul builder caching, manual refresh flow, sizing, and premium health UI, 1083e5c Merge branch 'codex/builder-prefetch-cache-ui-overhaul', 5aa6cce Integrate frozen chart nav and PDF token selector across builder/viewer, 887fead Polish frozen nav UI and map Builder groups from UPPCL API taxonomy, 8cc9f6c fix(builder): restore widget spans and make insights on-demand, b610bec Merge branch 'codex/builder-card-layout-insights-toggle', config

### Community 62 - "Community 62"
Cohesion: 0.26
Nodes (12): 023e3fb merge: sprint5-monitoring-ui → dev, 172d5f6 Merge branch 'main' of https://github.com/Ujjwaldhariwal/AI-Dashboard-builder- into dev, 1f4e14d feat(nav): redesign chart navigator to clean scrollable tab bar, 21ee7b8 merge(dev→main): enhanced token session timer chip, 2354c5d merge(dev): Sprint 3 — macOS double-decker group navigator, 2389a85 merge(dev→main): cleanup stash conflicts, stale branches, codex-skills, remove old docs, 49a12e6 feat(data): add safe declarative data transform layer with edit UI, 8a0b538 merge(dev): Sprint 4 — safe data transform layer with edit UI (+4 more)

### Community 63 - "Community 63"
Cohesion: 0.24
Nodes (10): c644fdc Merge branch 'codex/chart-fixes-next', fba53e5 feat: add Bosch API training pipeline with mapping feedback and loader UI, FeedbackRequest, getAuthedSupabase(), POST(), AILoader(), AILoaderProps, getPhase() (+2 more)

### Community 64 - "Community 64"
Cohesion: 0.30
Nodes (7): audit_logs, auth.users, dashboard_projects, project_assignments, tenant_domains, tenant_memberships, tenants

### Community 65 - "Community 65"
Cohesion: 0.25
Nodes (11): 01cc804 feat: merge viewer page, 0c908fa feat: add dynamic notification bell with contextual alerts, 2158669 feat: merge dashboard stats, 45fe3d1 feat: add widget edit dialog + improved chart tooltips and styling, 531a0e2 feat: add standalone viewer page for public dashboard viewing, 77dc457 feat: merge chart improvements, 7d60153 chore: refine settings page layout and behaviour, 7ddb0c2 feat: add settings page with profile, preferences, stats and danger zone (+3 more)

### Community 66 - "Community 66"
Cohesion: 0.35
Nodes (9): legacyRouteGone(), LegacyRouteResponseInput, asRecord(), GET(), getAuthedSupabase(), mapDbProfile(), parseHeaders(), parseMappingCandidate() (+1 more)

### Community 67 - "Community 67"
Cohesion: 0.38
Nodes (1): AIInsightsEngine

### Community 68 - "Community 68"
Cohesion: 0.29
Nodes (8): applyAutoLayout(), AUTO_CHART_TYPES, AutoWidgetBuildResult, AutoWidgetDraft, buildAutoWidgetDraftFromPayload(), buildAutoWidgetsFromEndpoints(), getNextWidgetStartY(), isChartType()

### Community 69 - "Community 69"
Cohesion: 0.33
Nodes (9): buildCreatePrompt(), buildGeminiHistory(), buildStylePrompt(), POST(), 1caf797 feat: add selectedWidgetId + onSelectWidget to canvas for AI style scoping, 38303d8 fix: Gemini history fix + complete route with style/create prompts, 49dd6dd feat: AI chat route — style-only mode with Layer 3 enforcement, 71282d3 fix: complete Gemini route with buildStylePrompt + buildCreatePrompt (+1 more)

### Community 70 - "Community 70"
Cohesion: 0.29
Nodes (9): DashboardExportConfig, buildValidationConfig(), ensureCleanDir(), EXTRACT_DIR, extractZip(), main(), OUTPUT_ROOT, writeZip() (+1 more)

### Community 71 - "Community 71"
Cohesion: 0.69
Nodes (9): auth.users, dashboard_chart_configs, dashboard_chart_slots, dashboard_pages, dashboard_projects, dashboard_publish_events, dashboard_versions, published_dashboards (+1 more)

### Community 72 - "Community 72"
Cohesion: 0.31
Nodes (1): SchemaDetector

### Community 73 - "Community 73"
Cohesion: 0.20
Nodes (8): DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSubContent, DropdownMenuSubTrigger

### Community 74 - "Community 74"
Cohesion: 0.36
Nodes (7): 0b3c27f feat: enforce query budget policies, bfd42b6 feat: add recurring platform job schedules, c272893 feat: add dashboard health alerts, auth.users, dashboard_projects, platform_alerts, tenants

### Community 75 - "Community 75"
Cohesion: 0.25
Nodes (6): 27b5d6e feat(sprint-4): add bosch demo polish and export validation, d6291d8 chore(next16): migrate to proxy and flat eslint config; add store migrations, AppNotification, NotificationStore, NotifType, useNotificationStore

### Community 76 - "Community 76"
Cohesion: 0.61
Nodes (7): auth.users, dashboards, endpoint_mapping_feedback, endpoint_profile_runs, endpoint_profiles, endpoints, widgets

### Community 77 - "Community 77"
Cohesion: 0.54
Nodes (7): business_entities, business_fields, business_metrics, business_models, business_relationships, dashboard_projects, tenants

### Community 78 - "Community 78"
Cohesion: 0.46
Nodes (7): auth.users, dashboard_chart_configs, dashboard_projects, data_sources, semantic_datasets, semantic_query_runs, tenants

### Community 79 - "Community 79"
Cohesion: 0.57
Nodes (7): dashboard_chart_configs, dashboard_chart_slots, dashboard_health_runs, dashboard_pages, dashboard_publish_events, dashboard_versions, published_dashboards

### Community 80 - "Community 80"
Cohesion: 0.36
Nodes (7): clampLimit(), GET(), POST(), requireScheduleAccess(), ScheduleJobTypeSchema, ScheduleTargetTypeSchema, UpsertScheduleSchema

### Community 81 - "Community 81"
Cohesion: 0.38
Nodes (5): mapMetric(), MetricSchema, POST(), semanticKey(), BusinessMetric

### Community 82 - "Community 82"
Cohesion: 0.62
Nodes (6): auth.users, dashboard_chart_configs, dashboard_chart_validation_results, dashboard_projects, semantic_datasets, tenants

### Community 83 - "Community 83"
Cohesion: 0.52
Nodes (6): auth.users, dashboard_health_runs, dashboard_projects, dashboard_versions, published_dashboards, tenants

### Community 84 - "Community 84"
Cohesion: 0.48
Nodes (5): auth.users, dashboard_projects, platform_job_schedules, platform_jobs, tenants

### Community 85 - "Community 85"
Cohesion: 0.60
Nodes (1): AlertEngine

### Community 86 - "Community 86"
Cohesion: 0.67
Nodes (1): DataAnalyzer

### Community 87 - "Community 87"
Cohesion: 0.53
Nodes (1): PDFExporter

### Community 88 - "Community 88"
Cohesion: 0.60
Nodes (5): auth.users, dashboard_projects, data_source_schema_runs, data_sources, tenants

### Community 89 - "Community 89"
Cohesion: 0.60
Nodes (5): auth.users, dashboard_projects, data_sources, query_budget_policies, tenants

### Community 90 - "Community 90"
Cohesion: 0.70
Nodes (1): CorrelationEngine

### Community 91 - "Community 91"
Cohesion: 1.00
Nodes (4): auth.users, dashboards, endpoints, widgets

### Community 92 - "Community 92"
Cohesion: 0.90
Nodes (4): auth.users, chart_groups, chart_subgroups, dashboards

### Community 93 - "Community 93"
Cohesion: 0.70
Nodes (4): auth.users, dashboards, endpoints, transform_blueprints

### Community 94 - "Community 94"
Cohesion: 0.70
Nodes (4): dashboard_projects, data_source_columns, data_sources, tenants

### Community 95 - "Community 95"
Cohesion: 0.70
Nodes (4): business_models, dashboard_projects, semantic_datasets, tenants

### Community 96 - "Community 96"
Cohesion: 0.70
Nodes (4): auth.users, chart_health_runs, dashboard_projects, tenants

### Community 97 - "Community 97"
Cohesion: 0.70
Nodes (4): auth.users, dashboard_projects, platform_jobs, tenants

### Community 98 - "Community 98"
Cohesion: 0.83
Nodes (3): dashboard_projects, data_sources, tenants

## Knowledge Gaps
- **502 isolated node(s):** `nextConfig`, `config`, `root`, `apiRoots`, `inventoryPath` (+497 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 67`** (1 nodes): `AIInsightsEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `SchemaDetector`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (1 nodes): `AlertEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `DataAnalyzer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `PDFExporter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `CorrelationEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Button` connect `Community 2` to `Community 3`, `Community 22`, `Community 54`, `Community 16`, `Community 43`, `Community 48`, `Community 46`, `Community 12`, `Community 61`, `Community 23`, `Community 9`, `Community 34`, `Community 20`, `Community 33`, `Community 11`, `Community 38`, `Community 19`, `Community 21`, `Community 13`, `Community 14`, `Community 4`, `Community 37`, `Community 26`, `Community 15`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `Badge()` connect `Community 2` to `Community 3`, `Community 22`, `Community 54`, `Community 24`, `Community 16`, `Community 43`, `Community 48`, `Community 46`, `Community 12`, `Community 28`, `Community 20`, `Community 33`, `Community 11`, `Community 13`, `Community 14`, `Community 4`, `Community 37`, `Community 34`, `Community 6`, `Community 15`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `getAuthedSupabase()` connect `Community 0` to `Community 13`, `Community 14`, `Community 18`, `Community 24`, `Community 31`, `Community 81`, `Community 4`, `Community 51`, `Community 29`, `Community 80`, `Community 34`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `nextConfig`, `config`, `root` to the rest of the system?**
  _502 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05450372920252438 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07151898734177216 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06649616368286446 - nodes in this community are weakly interconnected._