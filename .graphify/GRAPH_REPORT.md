# Graph Report - .  (2026-06-28)

## Corpus Check
- 288 files · ~193,252 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2258 nodes · 6320 edges · 100 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 1707 · imports: 1282 · MODIFIES: 1135 · imports_from: 781 · calls: 563 · ON_BRANCH: 404 · PARENT_OF: 263 · references: 133 · method: 45 · inherits: 5 · re_exports: 2


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 288 · Candidates: 309
- Excluded: 0 untracked · 89799 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `d6caeb2`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `Button` - 49 edges
2. `Badge()` - 43 edges
3. `requireProjectAccess()` - 34 edges
4. `getAuthedSupabase()` - 34 edges
5. `AccessContext` - 33 edges
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
Cohesion: 0.04
Nodes (81): ChannelTypeSchema, clampLimit(), GET(), POST(), requireChannelAccess(), SeveritySchema, UpsertChannelSchema, clampLimit() (+73 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (88): feature/db-dashboard-foundation, feature/phase2-sidebar-nav, 02c54d5 feat(monitoring+notifs): full monitoring page, real notification store, bell wired to errors+health, 0b7de3e fix: lazy-init OpenAI client to prevent build-time crash, 0c2ff86 feat: widget polish - loading skeleton, fullscreen, duplicate, 0d7f519 chore: add jszip for client-side dashboard export, 0fd0172 chore: widget-config-dialog accepts optional prefill props from suggestions, 10e4c1f fix: align Widget type, builder-store DB mapping, workspaces async handlers (+80 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (58): PublishedChartsGrid(), DatasetRunResult, PublishedDatasetPreview(), PublishedDatasetPreviewProps, 5368537 feat: preview published client datasets, abbe245 feat: add client dataset run endpoint, b98f9a0 chore: pre-demo cleanup snapshot, f886a57 feat: render published client datasets (+50 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (52): MagicPasteModalProps, CHART_TYPE_ROWS, chartIcons, chartTypeLabel, WidgetConfigDialogProps, CHART_TYPE_ROWS, chartIcons, chartTypeLabel (+44 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (39): Alert, BASE_PROMPTS, ConfigChatbot(), ConfigChatbotProps, Message, STYLE_PROMPTS, StyleAction, WidgetAction (+31 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (43): AUTH_HINTS, AuthType, BOSCH_UPPCL_PRESET, CHART_TYPE_OPTIONS, DEFAULT_FORM, StatusType, AuthType, EMPTY_FORM (+35 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (50): 042fba1 feat: select semantic dataset assets, 10d4599 feat: add chart compatibility engine, 208f284 feat: compile semantic dataset query plans, dc7edfe feat: add dashboard chart config schema, ef90211 feat: preview semantic dataset plans, DatasetPlan, DatasetRunResult, DatasetsAdminPanel() (+42 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (33): METRICS, PRINCIPLES, SPRINTS, Message, NaturalLanguageQueryProps, REQUIREMENTS, DataSourcesAdminPanel(), ProjectOption (+25 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (45): ChartSuggester(), CACHE, CachedResponse, clearEndpointResponseCache(), EndpointCacheEntry, fetchWithEndpointCache(), asRecord(), AUTH_STATUS_CODES (+37 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (42): applyConcat(), applyDateFormat(), applyFieldsToRows(), applyFilterRows(), applyGroupAggregate(), applyLimit(), applyMapValues(), applyMath() (+34 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (46): 0b3c27f feat: enforce query budget policies, 26a8f15 feat: execute cache warm jobs, 57f69d1 feat: enforce query budget hard stops, 63029fc feat: revalidate client chart runtime, a977d05 refactor: extract chart health auditor, ec0739b feat: show chart audit health in admin, f22b8bd feat: add chart health audit endpoint, f3cd521 feat: add client chart runtime endpoint (+38 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (39): buildChartNavTree(), buildGroupIndexes(), ChartNavBuildOptions, ChartNavCategory, ChartNavEndpointRef, ChartNavItem, ChartNavSelection, ChartNavSubgroup (+31 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (35): 3c6e599 feat: add admin chart composer, 564cdeb feat: gate chart publishing with validation, ChartSchema, EncodingSchema, mapChart(), POST(), selectionFromDataset(), toStringArray() (+27 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (37): TransformOpSchema, getGoogleApiKey(), getGoogleModel(), GOOGLE_API_KEY_ENV_CANDIDATES, 87e0fac fix(builder-ui): polish data prep modal and correct chart nav sticky layering, b3128ec feat: stabilize auth session flow and ship data prep studio updates, b6bcb11 feat(builder): checkpoint data prep, chart UX, and auth stability updates, hasValidSession() (+29 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (41): consumeSessionExpiredSignalCookie(), hasSessionExpiredSignalCookie(), hasSupabaseAuthCookieFootprint(), parseCookie(), b4ef5a6 feat: quarantine legacy dashboard routes, d6caeb2 refactor: decouple app shell from legacy builder stores, isLegacyPublicShareRoute(), isLegacyUiRoute() (+33 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (32): WidgetSizePreset, COMPACT_CHART_MARGIN, DEFAULT_CHART_MARGIN, getCategoryTickInterval(), getChartMargin(), getLegendVisibility(), normalizeSizePreset(), showValueLabels() (+24 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (32): 2c0ba68 feat: add platform job queue contract, 8f1c410 feat: execute platform jobs with worker route, asRecord(), claimPlatformJobs(), ClaimPlatformJobsInput, completePlatformJob(), CompletePlatformJobInput, enqueuePlatformJob() (+24 more)

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (29): levelBg, levelIcon, MonitoringPanel(), MonitoringPanelProps, InsightItem, InsightSeverity, levelBadge, SortColumn (+21 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (34): AlertDeliveryPolicy, alertPayload(), asOptionalString(), asRecord(), asStringArray(), configuredEmailProvider(), deliverEmail(), deliverPlatformAlert() (+26 more)

### Community 19 - "Community 19"
Cohesion: 0.08
Nodes (25): DashboardEndpointProbeSummary, BuilderApiHealthSummary, dispatchBuilderApiHealthRescan(), dispatchBuilderApiHealthSummary(), 24cf646 feat(workspaces): inline dashboard rename — pencil icon on hover, Enter/blur to save, Esc to cancel, 656733c fix(builder): move api snapshot to sidebar and persist widget sizes, 976e623 Merge branch 'codex/builder-sidebar-health-size-persist', a89c21c feat(builder+settings): unsaved changes indicator, AlertDialog for clear-all, no window.confirm anywhere (+17 more)

### Community 20 - "Community 20"
Cohesion: 0.08
Nodes (24): buildEndpointRequestInit(), EndpointRequestOptions, AGGREGATE_REDUCERS, asRecord(), DataPrepModalProps, DATE_FORMAT_OPTIONS, FILTER_OPERATORS, isAggregateReducer() (+16 more)

### Community 21 - "Community 21"
Cohesion: 0.10
Nodes (25): askDataTransformer(), AskDataTransformerOptions, askReportGenerator(), askUiDesigner(), getErrorMessage(), readJsonSafe(), ReportAgentResponseSchema, TransformAgentResponseSchema (+17 more)

### Community 22 - "Community 22"
Cohesion: 0.10
Nodes (21): CHART_ICONS, ChartSuggesterProps, AIChartGeneratorResult, AIChartSuggestion, generateAIChartSuggestions(), ChartScore, scoreChartTypes(), selectBestChartType() (+13 more)

### Community 23 - "Community 23"
Cohesion: 0.09
Nodes (19): ApiDocEndpoint, extractLine(), parseApiInventory(), readApiInventory(), 0b17d50 feat: add admin API docs inventory page, 2950d4c feat: expose API docs inventory JSON, 9bbd88b test: check API inventory coverage, bc47d2f docs: add Apidog API inventory (+11 more)

### Community 24 - "Community 24"
Cohesion: 0.10
Nodes (25): 2158669 feat: merge dashboard stats, c5fdab2 feat: add ownerId to dashboards and stats bar to workspaces page, APIEndpoint, asRecord(), CHART_TYPES, Dashboard, DashboardStore, dbId() (+17 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (22): 48be0f0 style: add Monokai admin theme, 8bca7ed feat: surface DashboardOS UI entrypoints, ce49a9b feat: execute semantic dataset previews, DashboardUpdateSchema, mapBusinessModel(), mapChart(), mapDataset(), PATCH() (+14 more)

### Community 26 - "Community 26"
Cohesion: 0.10
Nodes (18): TrendAnalyzer, TrendInsight, applyTransforms(), predictionConfig, trendConfig, WidgetInsights(), WidgetInsightsProps, chartTypeIcon (+10 more)

### Community 27 - "Community 27"
Cohesion: 0.10
Nodes (20): CHART_COLORS, ChartWrapper(), ChartWrapperProps, DEFAULT_CHART_MARGIN, 42e3e18 feat: complete ECharts migration + sprint bug fixes, 85e718d merge: sprint-3 ECharts migration + UX fixes, e6c9268 fix: sprint 1-4 comprehensive bug fixes, BOSCH_COLORS (+12 more)

### Community 28 - "Community 28"
Cohesion: 0.12
Nodes (22): ModernDrilldownBarChart(), useEnterpriseTheme(), ModernGaugeChart(), ModernGaugeChartFromData(), ModernGaugeChartProps, useEnterpriseTheme(), useIsDarkMode(), ModernRingGaugeChart() (+14 more)

### Community 29 - "Community 29"
Cohesion: 0.14
Nodes (25): BoschProxyDefaults, buildClientSafeExportConfig(), deriveBoschProxyDefaults(), extractAbsoluteBaseFromUrl(), generateApiClient(), generateAuthGuard(), generateBoschProxyRoute(), generateDashboardLayout() (+17 more)

### Community 30 - "Community 30"
Cohesion: 0.09
Nodes (18): ModernGroupedBarChart(), useEnterpriseTheme(), ModernHorizontalBarChart(), useEnterpriseTheme(), ModernHorizontalStackedBarChart(), useEnterpriseTheme(), ModernLineChart(), useEnterpriseTheme() (+10 more)

### Community 31 - "Community 31"
Cohesion: 0.15
Nodes (24): asRecord(), BoschCredentials, buildEndpoint(), buildForwardedCookie(), buildUpstreamHeaders(), CredentialResolution, extractTokenFromCookieHeader(), extractTokenFromSetCookie() (+16 more)

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (21): 2360297 feat: add distributed runtime cache interface, hasRedisRuntime(), redisCommand(), RedisCommandResult, redisConfig(), redisPipeline(), buckets, checkInMemoryRuntimeRateLimit() (+13 more)

### Community 33 - "Community 33"
Cohesion: 0.16
Nodes (23): asRecord(), buildDashboardExportManifest(), buildDashboardExportPayload(), contentTypeForExport(), createDashboardExport(), CreateDashboardExportInput, createDashboardManifestExport(), CreateDashboardManifestExportInput (+15 more)

### Community 34 - "Community 34"
Cohesion: 0.11
Nodes (22): GET(), isMissingTenancySchema(), mapTenant(), POST(), slugifyTenantName(), TenantCreateSchema, AuditAction, AuditLog (+14 more)

### Community 35 - "Community 35"
Cohesion: 0.13
Nodes (21): bfd42b6 feat: add recurring platform job schedules, c272893 feat: add dashboard health alerts, asRecord(), claimPlatformJobSchedules(), ClaimPlatformJobSchedulesInput, enqueueJobFromSchedule(), listPlatformJobSchedules(), ListPlatformJobSchedulesInput (+13 more)

### Community 36 - "Community 36"
Cohesion: 0.14
Nodes (17): 0e0a84b feat(sprint-2): complete ZIP export with login page, sidebar, ECharts, PDF export, project config + chart groups, 332d704 feat(sprint-2): wire ProjectConfigPanel, fix config-builder types, fill project-config types, dc4b531 feat(auth-ui): refresh login/workspaces UX and extend project header config, ProjectConfigPanel(), Props, ApiEndpointConfig, AuthStrategy, ChartSubgroup (+9 more)

### Community 37 - "Community 37"
Cohesion: 0.19
Nodes (19): cleanupIdlePostgresPools(), createPostgresClient(), decryptPostgresCredential(), evictOldestIdlePool(), executePostgresReadOnlyQuery(), getPostgresPool(), globalForPostgresPools, introspectPostgresSchema() (+11 more)

### Community 38 - "Community 38"
Cohesion: 0.20
Nodes (20): addTable(), aggregationSql(), asRecord(), asSourceColumn(), columnSql(), compileDatasetQueryPlan(), CompiledSelect, compileRelationshipJoin() (+12 more)

### Community 39 - "Community 39"
Cohesion: 0.15
Nodes (16): AISuggestResponse, fetchAIFallbackMapping(), AIFallbackInput, buildDeterministicCandidate(), computeFieldStats(), computeShapeSignature(), hashString(), MappingEngineInput (+8 more)

### Community 40 - "Community 40"
Cohesion: 0.17
Nodes (17): 5eccbb3 feat: track schema introspection freshness, DataSourceCreateSchema, GET(), isMissingDataSourceSchema(), mapDataSource(), POST(), SslModeSchema, mapDataSource() (+9 more)

### Community 41 - "Community 41"
Cohesion: 0.13
Nodes (17): BOSCH_UPPCL_BLUEPRINT, BOSCH_UPPCL_BLUEPRINT_STATS, BOSCH_UPPCL_CHART_INVENTORY, BOSCH_UPPCL_DEFAULT_PROJECT, BOSCH_UPPCL_ENDPOINTS, BOSCH_UPPCL_EXTRA_ENDPOINTS, BoschChartBlueprint, BoschChartInventoryRow (+9 more)

### Community 42 - "Community 42"
Cohesion: 0.15
Nodes (16): MagicPasteModal(), WidgetConfigDialog(), DragDropCanvas(), DragDropCanvasProps, 023e3fb merge: sprint5-monitoring-ui → dev, 172d5f6 Merge branch 'main' of https://github.com/Ujjwaldhariwal/AI-Dashboard-builder- into dev, 1f4e14d feat(nav): redesign chart navigator to clean scrollable tab bar, 21ee7b8 merge(dev→main): enhanced token session timer chip (+8 more)

### Community 43 - "Community 43"
Cohesion: 0.18
Nodes (17): buildOrderMap(), detectLabelComparator(), detectOrderMap(), LabelComparator, MONTHS, NamedValue, normalize(), ORDER_GROUPS (+9 more)

### Community 44 - "Community 44"
Cohesion: 0.13
Nodes (6): INITIAL_EDGES, INITIAL_NODES, NODE_LABELS, NODE_PALETTE, AuthNodeData, NODE_TYPES

### Community 45 - "Community 45"
Cohesion: 0.14
Nodes (10): LabelParam, ModernPieChart(), ModernPieChartProps, PieSlice, TooltipParam, truncate(), useEnterpriseTheme(), wrapLabel() (+2 more)

### Community 46 - "Community 46"
Cohesion: 0.16
Nodes (15): buildDashboardConfig(), DashboardShape, EndpointShape, ExportEndpoint, ExportGroup, ExportWidget, joinOriginAndPath(), resolveBaseUrl() (+7 more)

### Community 47 - "Community 47"
Cohesion: 0.16
Nodes (15): MappingEngineResult, asRecord(), buildRequestInit(), DemoSessionPayload, EndpointProfileComputation, isUnauthorizedPayload(), mapEngineToResult(), normalizeLikelyReason() (+7 more)

### Community 48 - "Community 48"
Cohesion: 0.14
Nodes (15): profileDashboardEndpoints(), TrainingFeedbackPayload, TrainingProfilesResponse, TrainingSummaryResponse, DEFAULT_PROFILE_DRIFT_FLAGS, EndpointMappingFeedback, EndpointProfile, EndpointProfileRun (+7 more)

### Community 49 - "Community 49"
Cohesion: 0.17
Nodes (11): asRecord(), asToken(), AuthFlowPage(), DemoLoginResult, extractByPath(), formatRemainingTime(), getApiMessage(), isLogicalFailure() (+3 more)

### Community 50 - "Community 50"
Cohesion: 0.21
Nodes (14): EXPORTED_CHART_TYPES, GeneratedFileMap, AI_DEPENDENCY_VERSIONS, AIExportConfig, DashboardExportConfigLike, injectAIDependencies(), injectAIEnv(), injectAIFiles() (+6 more)

### Community 51 - "Community 51"
Cohesion: 0.15
Nodes (10): CATEGORY_BY_ID, collectEndpointCandidates(), ENDPOINT_TAXONOMY_LINKS, EndpointTaxonomyLink, LINK_BY_ENDPOINT_KEY, resolveUppclTaxonomy(), UPPCL_TAXONOMY, UppclTaxonomyCategory (+2 more)

### Community 52 - "Community 52"
Cohesion: 0.24
Nodes (12): 09c4244 feat: add alert delivery fanout, 994942f feat: add export artifact storage metadata, f655b1e feat: add dashboard export artifacts, PlatformJobRunResult, requireTargetId(), runAlertDeliveryJob(), runCacheWarmJob(), runDashboardHealthJob() (+4 more)

### Community 53 - "Community 53"
Cohesion: 0.23
Nodes (10): DashboardWidgetRefreshDetail, dispatchDashboardWidgetRefresh(), 1019d7d Overhaul builder caching, manual refresh flow, sizing, and premium health UI, 1083e5c Merge branch 'codex/builder-prefetch-cache-ui-overhaul', 8cc9f6c fix(builder): restore widget spans and make insights on-demand, b610bec Merge branch 'codex/builder-card-layout-insights-toggle', d925a60 feat(ui): add token expiry countdown and session status indicators, e0d0599 Merge branch 'codex/fix-chart-popup-and-supabase-fetch-errors' (+2 more)

### Community 54 - "Community 54"
Cohesion: 0.18
Nodes (7): ModernBarChart(), ModernBarChartProps, normalizeLabel(), toCompactDateLabel(), TooltipParam, useEnterpriseTheme(), XAxisLayout

### Community 55 - "Community 55"
Cohesion: 0.23
Nodes (10): 01cc804 feat: merge viewer page, 0c908fa feat: add dynamic notification bell with contextual alerts, 531a0e2 feat: add standalone viewer page for public dashboard viewing, 7d60153 chore: refine settings page layout and behaviour, 91a9abd chore: resolve widget-card merge conflict keeping latest version, caa1a43 feat: merge notifications, d1502a8 fix: resolve merge conflict in builder page, typeBg (+2 more)

### Community 56 - "Community 56"
Cohesion: 0.21
Nodes (5): dispatchBrowserEvent(), dispatchSupabaseAuthExpired(), dispatchSupabaseAuthNetworkError(), createSupabaseRetryableFetch(), lastWarningAt

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (11): BuilderDemoAuthSession, BuilderDemoAuthTokenMeta, clearBuilderDemoAuthSession(), decodeBase64Url(), getBuilderDemoAuthHeaders(), getBuilderDemoAuthSession(), getBuilderDemoAuthTokenExpiryMs(), getBuilderDemoAuthTokenMeta() (+3 more)

### Community 58 - "Community 58"
Cohesion: 0.24
Nodes (10): c644fdc Merge branch 'codex/chart-fixes-next', fba53e5 feat: add Bosch API training pipeline with mapping feedback and loader UI, FeedbackRequest, getAuthedSupabase(), POST(), AILoader(), AILoaderProps, getPhase() (+2 more)

### Community 59 - "Community 59"
Cohesion: 0.30
Nodes (7): audit_logs, auth.users, dashboard_projects, project_assignments, tenant_domains, tenant_memberships, tenants

### Community 60 - "Community 60"
Cohesion: 0.24
Nodes (9): 1b7f8dd feat: add native alert email delivery, 8209246 feat: render dashboard pdf and zip exports, chartLabel(), DashboardExportManifest, DashboardExportManifestChart, renderDashboardBundleZip(), renderDashboardReportPdf(), styles (+1 more)

### Community 61 - "Community 61"
Cohesion: 0.35
Nodes (9): legacyRouteGone(), LegacyRouteResponseInput, asRecord(), GET(), getAuthedSupabase(), mapDbProfile(), parseHeaders(), parseMappingCandidate() (+1 more)

### Community 62 - "Community 62"
Cohesion: 0.38
Nodes (1): AIInsightsEngine

### Community 63 - "Community 63"
Cohesion: 0.24
Nodes (9): asRecord(), listPlatformAlerts(), mapPlatformAlert(), PlatformAlert, PlatformAlertSeverity, PlatformAlertState, PlatformAlertType, reconcileDashboardHealthAlerts() (+1 more)

### Community 64 - "Community 64"
Cohesion: 0.29
Nodes (8): applyAutoLayout(), AUTO_CHART_TYPES, AutoWidgetBuildResult, AutoWidgetDraft, buildAutoWidgetDraftFromPayload(), buildAutoWidgetsFromEndpoints(), getNextWidgetStartY(), isChartType()

### Community 65 - "Community 65"
Cohesion: 0.29
Nodes (9): DashboardExportConfig, buildValidationConfig(), ensureCleanDir(), EXTRACT_DIR, extractZip(), main(), OUTPUT_ROOT, writeZip() (+1 more)

### Community 66 - "Community 66"
Cohesion: 0.20
Nodes (10): 0fa25a1 feat(export): dynamic ai feature bundling and byok env injection, 239a125 fix(export): harden standalone bosch proxy routing and auth defaults, 2866562 docs: add PROJECT_STATE.md blueprint, 676bfa8 feat(ai): implement structured subagents, strict schemas, and ai pdf report flow, 74e8979 feat(ui): revamp widget header and responsive app layout, 768eb03 Refine builder sticky chart navigator spacing and behavior, 7ae5344 fix(export): prompt for absolute api base url during standalone export, 7b391ce fix(export): resolve login URL 404 and enforce standalone base URL preflight (+2 more)

### Community 67 - "Community 67"
Cohesion: 0.69
Nodes (9): auth.users, dashboard_chart_configs, dashboard_chart_slots, dashboard_pages, dashboard_projects, dashboard_publish_events, dashboard_versions, published_dashboards (+1 more)

### Community 68 - "Community 68"
Cohesion: 0.31
Nodes (1): SchemaDetector

### Community 69 - "Community 69"
Cohesion: 0.39
Nodes (7): buildCreatePrompt(), buildGeminiHistory(), buildStylePrompt(), POST(), 1caf797 feat: add selectedWidgetId + onSelectWidget to canvas for AI style scoping, 49dd6dd feat: AI chat route — style-only mode with Layer 3 enforcement, 71282d3 fix: complete Gemini route with buildStylePrompt + buildCreatePrompt

### Community 70 - "Community 70"
Cohesion: 0.25
Nodes (6): 27b5d6e feat(sprint-4): add bosch demo polish and export validation, d6291d8 chore(next16): migrate to proxy and flat eslint config; add store migrations, AppNotification, NotificationStore, NotifType, useNotificationStore

### Community 71 - "Community 71"
Cohesion: 0.39
Nodes (7): clampLimit(), CreateExportSchema, ExportTypeSchema, GET(), POST(), requireExportAccess(), verifyExportTarget()

### Community 72 - "Community 72"
Cohesion: 0.39
Nodes (7): FieldMappingSchema, GET(), mapEntity(), mapField(), POST(), semanticKey(), BusinessEntityType

### Community 73 - "Community 73"
Cohesion: 0.61
Nodes (7): auth.users, dashboards, endpoint_mapping_feedback, endpoint_profile_runs, endpoint_profiles, endpoints, widgets

### Community 74 - "Community 74"
Cohesion: 0.54
Nodes (7): business_entities, business_fields, business_metrics, business_models, business_relationships, dashboard_projects, tenants

### Community 75 - "Community 75"
Cohesion: 0.46
Nodes (7): auth.users, dashboard_chart_configs, dashboard_projects, data_sources, semantic_datasets, semantic_query_runs, tenants

### Community 76 - "Community 76"
Cohesion: 0.57
Nodes (7): dashboard_chart_configs, dashboard_chart_slots, dashboard_health_runs, dashboard_pages, dashboard_publish_events, dashboard_versions, published_dashboards

### Community 77 - "Community 77"
Cohesion: 0.46
Nodes (7): auth.users, dashboard_export_artifacts, dashboard_projects, dashboard_versions, platform_jobs, published_dashboards, tenants

### Community 78 - "Community 78"
Cohesion: 0.54
Nodes (7): auth.users, dashboard_projects, platform_alert_channels, platform_alert_delivery_attempts, platform_alerts, platform_jobs, tenants

### Community 79 - "Community 79"
Cohesion: 0.62
Nodes (6): auth.users, dashboard_chart_configs, dashboard_chart_validation_results, dashboard_projects, semantic_datasets, tenants

### Community 80 - "Community 80"
Cohesion: 0.52
Nodes (6): auth.users, dashboard_health_runs, dashboard_projects, dashboard_versions, published_dashboards, tenants

### Community 81 - "Community 81"
Cohesion: 0.48
Nodes (5): auth.users, dashboard_projects, platform_job_schedules, platform_jobs, tenants

### Community 82 - "Community 82"
Cohesion: 0.60
Nodes (1): AlertEngine

### Community 83 - "Community 83"
Cohesion: 0.67
Nodes (1): DataAnalyzer

### Community 84 - "Community 84"
Cohesion: 0.40
Nodes (5): getWidgetCardHeightClass(), getWidgetGridSpanClass(), getWidgetSizePreset(), PRESET_POSITION, WidgetPosition

### Community 85 - "Community 85"
Cohesion: 0.33
Nodes (5): 03090c8 docs: refresh db dashboard handoff context, 5caf9c9 feat: expose query runtime history, c2be49d feat: rate limit query runtime calls, e929a78 feat: persist chart health snapshots, f3635b1 chore: remove legacy builder schema

### Community 86 - "Community 86"
Cohesion: 0.53
Nodes (1): PDFExporter

### Community 87 - "Community 87"
Cohesion: 0.60
Nodes (5): auth.users, dashboard_projects, data_source_schema_runs, data_sources, tenants

### Community 88 - "Community 88"
Cohesion: 0.60
Nodes (5): auth.users, dashboard_projects, data_sources, query_budget_policies, tenants

### Community 89 - "Community 89"
Cohesion: 0.70
Nodes (1): CorrelationEngine

### Community 90 - "Community 90"
Cohesion: 0.40
Nodes (1): ErrorBoundaryClass

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
Cohesion: 0.70
Nodes (4): auth.users, dashboard_projects, platform_alerts, tenants

### Community 99 - "Community 99"
Cohesion: 0.83
Nodes (3): dashboard_projects, data_sources, tenants

## Knowledge Gaps
- **529 isolated node(s):** `nextConfig`, `config`, `root`, `apiRoots`, `inventoryPath` (+524 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 62`** (1 nodes): `AIInsightsEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `SchemaDetector`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `AlertEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `DataAnalyzer`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `PDFExporter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 89`** (1 nodes): `CorrelationEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 90`** (1 nodes): `ErrorBoundaryClass`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Button` connect `Community 3` to `Community 7`, `Community 22`, `Community 4`, `Community 5`, `Community 20`, `Community 44`, `Community 49`, `Community 8`, `Community 42`, `Community 26`, `Community 15`, `Community 2`, `Community 11`, `Community 19`, `Community 17`, `Community 55`, `Community 21`, `Community 12`, `Community 6`, `Community 25`, `Community 36`, `Community 27`, `Community 28`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `Badge()` connect `Community 7` to `Community 22`, `Community 4`, `Community 5`, `Community 23`, `Community 20`, `Community 44`, `Community 49`, `Community 3`, `Community 8`, `Community 30`, `Community 11`, `Community 17`, `Community 55`, `Community 12`, `Community 6`, `Community 25`, `Community 2`, `Community 36`, `Community 28`, `Community 19`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `getAuthedSupabase()` connect `Community 0` to `Community 12`, `Community 71`, `Community 40`, `Community 72`, `Community 25`, `Community 23`, `Community 16`, `Community 2`, `Community 10`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `nextConfig`, `config`, `root` to the rest of the system?**
  _529 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04330637915543576 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06504702194357367 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.04417670682730924 - nodes in this community are weakly interconnected._