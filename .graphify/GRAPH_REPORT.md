# Graph Report - .  (2026-08-04)

## Corpus Check
- Large corpus: 528 files · ~408,030 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 3648 nodes · 11462 edges · 142 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output
- Edge kinds: contains: 2848 · imports: 2263 · MODIFIES: 1906 · ON_BRANCH: 1477 · imports_from: 1279 · calls: 934 · PARENT_OF: 349 · references: 182 · reads_from: 114 · method: 79 · inherits: 13 · triggers: 12 · re_exports: 6


## Input Scope
- Requested: auto
- Resolved: committed (source: default-auto)
- Included files: 528 · Candidates: 620
- Excluded: 0 untracked · 82337 ignored · 2 sensitive · 0 missing committed
- Recommendation: Use --scope all or graphify.yaml inputs.corpus for a knowledge-base folder.

## Graph Freshness
- Built from Git commit: `957753d`
- Compare this hash to `git rev-parse HEAD` before trusting freshness-sensitive graph output.
## God Nodes (most connected - your core abstractions)
1. `getAuthedSupabase()` - 64 edges
2. `Button` - 58 edges
3. `requireProjectAccess()` - 58 edges
4. `AccessContext` - 57 edges
5. `Badge()` - 52 edges
6. `Input` - 28 edges
7. `useDashboardStore` - 26 edges
8. `publish_dashboard_version_immutable()` - 26 edges
9. `Card` - 25 edges
10. `CardContent` - 25 edges

## Surprising Connections (you probably didn't know these)
- `PATCH()` --calls--> `mapChart()`  [EXTRACTED]
  src/app/api/admin/semantic-models/[id]/route.ts → src/app/api/admin/dashboard-charts/[id]/route.ts
- `PATCH()` --calls--> `mapDataset()`  [EXTRACTED]
  src/app/api/admin/semantic-models/[id]/route.ts → src/app/api/admin/datasets/[id]/route.ts
- `POST()` --calls--> `labelForId()`  [EXTRACTED]
  src/app/api/client/[tenantSlug]/datasets/[id]/run/route.ts → src/app/api/client/[tenantSlug]/charts/[id]/run/route.ts
- `PATCH()` --calls--> `selectionFromDataset()`  [EXTRACTED]
  src/app/api/admin/semantic-models/[id]/route.ts → src/app/api/admin/dashboard-charts/[id]/route.ts
- `GET()` --calls--> `isMissingGuidedSchema()`  [EXTRACTED]
  src/app/api/training/profile/route.ts → src/app/api/admin/guided-review/profile/route.ts

## Communities

### Community 81 - "Community 81"
Cohesion: 0.22
Nodes (9): api(), titleFromColumn(), normalized(), roleForColumn(), entityForTable(), metricSpecForField(), compactSelection(), createDataset() (+1 more)

### Community 34 - "Community 34"
Cohesion: 0.09
Nodes (27): AiChartContext, buildAiChartExamplePrompts(), AiFieldClassification, AiFieldClassificationResult, PII_PATTERNS, ADMIN_PATTERNS, AGGREGATED_PATTERNS, SAFE_PATTERNS (+19 more)

### Community 74 - "Community 74"
Cohesion: 0.21
Nodes (13): GuidedPublishSeedIds, GuidedPublishSupabaseFixture, requireIntegrationSupabaseUrl(), createSupabase(), createGuidedPublishSeedIds(), column(), guidedState(), assertNoSupabaseError() (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.10
Nodes (58): 141619a chore: ignore supabase temp directory, 1ee2c2a merge: absorb origin/feature/sprint4-dnd-canvas into current next16 architecture, 1fdc423 feat(widget-config): add all 9 chart types to picker, fix ChartType record type error, 27b5d6e feat(sprint-4): add bosch demo polish and export validation, 2a091ef chore: add codex skills contract file, 3a8b2af feat(builder): restore missed builder and api-config workflows from stash, 4ea1b1b fix(api): support multi-env bosch proxy credentials and diagnostics, 5c8088e feat(builder): add advanced chart widgets, aliases, and global filters (+50 more)

### Community 140 - "Community 140"
Cohesion: 0.40
Nodes (3): supabaseConnectionSources, securityHeaders, nextConfig

### Community 23 - "Community 23"
Cohesion: 0.06
Nodes (27): config, QUICK_ACTIONS, releasePath, capabilities, workflow, CHART_ICONS, ChartSuggesterProps, ChartSuggester() (+19 more)

### Community 85 - "Community 85"
Cohesion: 0.14
Nodes (10): root, apiRoots, inventoryPath, actual, inventory, documented, actualSet, documentedSet (+2 more)

### Community 96 - "Community 96"
Cohesion: 0.29
Nodes (9): OUTPUT_ROOT, ZIP_PATH, EXTRACT_DIR, ensureCleanDir(), buildValidationConfig(), writeZip(), extractZip(), main() (+1 more)

### Community 104 - "Community 104"
Cohesion: 0.36
Nodes (4): ApiDocEndpoint, extractLine(), parseApiInventory(), readApiInventory()

### Community 77 - "Community 77"
Cohesion: 0.19
Nodes (8): ProjectOption, CHART_TYPES, ProjectAutopilotPanel(), 0302a9b feat(navigation): expose project autopilot, 0ac3822 feat(autopilot): auto-approve validated semantic models, 633f552 feat(ui): add one-brief autopilot workspace, 673016e feat(ai): make assistant launch project autopilot, d4ecc8e feat(ui): hand autopilot draft to publishing

### Community 46 - "Community 46"
Cohesion: 0.09
Nodes (19): ProjectOption, DatasetPlan, AiRefinementGateState, AiRefinementSummaryState, AiRolloutScopeType, AiRolloutPolicyState, AiRefinementRolloutState, aiRolloutPolicyStateLabel() (+11 more)

### Community 30 - "Community 30"
Cohesion: 0.07
Nodes (25): ProjectOption, EntityWithFields, DatasetPlan, DatasetRunResult, DatasetsAdminPanel(), AssistantMessage, INITIAL_MESSAGE, QUICK_PROMPTS (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (60): PublishSchema, AuthProvider, createPublishedDashboardPublishPostHandler(), POST, RollbackSchema, AuthProvider, asRecord(), createPublishedDashboardRollbackPostHandler() (+52 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (74): supabase, FieldError, GRADIENTS, DemoEndpointPreset, DemoWidgetPreset, UPPCL_DEMO_ENDPOINTS, UPPCL_DEMO_WIDGETS, geistSans (+66 more)

### Community 117 - "Community 117"
Cohesion: 0.33
Nodes (4): HarnessTheme, DARK_VARS, LIGHT_VARS, AiChartRefinementVisualHarness()

### Community 38 - "Community 38"
Cohesion: 0.10
Nodes (21): STEPS, STAGE_ORDER, BuilderFlowIndicator(), NAV_ITEMS, PlatformAdminShell(), DASHBOARDOS_PREPARED_DEMO_HOSTS, isLocalDemoHost(), isDashboardOsDemoHost() (+13 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (101): AuthType, StatusType, AUTH_HINTS, DEFAULT_FORM, BOSCH_UPPCL_PRESET, CHART_TYPE_OPTIONS, POST(), DataPrepModal() (+93 more)

### Community 47 - "Community 47"
Cohesion: 0.12
Nodes (22): DemoLoginResult, STEP_LABELS, extractByPath(), asRecord(), getApiMessage(), isLogicalFailure(), asToken(), resolveLoginToken() (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (65): NavSelection, DEFAULT_NAV_SELECTION, BuilderHeaderProps, SortColumn, SortDirection, STATUS_SORT_ORDER, InsightSeverity, InsightItem (+57 more)

### Community 50 - "Community 50"
Cohesion: 0.11
Nodes (18): TenantRecord, RuntimeDashboard, DashboardHealthRunRecord, formatUpdatedAt(), gridSpanFromSlot(), chartWithSlotLayout(), healthBadgeClassName(), healthLabel() (+10 more)

### Community 49 - "Community 49"
Cohesion: 0.13
Nodes (23): dispatchDashboardWidgetRefresh(), 0acf28f feat(charts): preserve bosch config in shared view and upgrade modern chart styling, 0fa25a1 feat(export): dynamic ai feature bundling and byok env injection, 1019d7d Overhaul builder caching, manual refresh flow, sizing, and premium health UI, 1083e5c Merge branch 'codex/builder-prefetch-cache-ui-overhaul', 239a125 fix(export): harden standalone bosch proxy routing and auth defaults, 24860a1 feat(nav): add user-defined group/subgroup nav and pdf filter persistence, 2866562 docs: add PROJECT_STATE.md blueprint (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (82): BuilderGuideDialogProps, GUIDE_STEPS, BuilderGuideDialog(), DragDropCanvasProps, WidgetCard(), DashboardBriefDialogProps, TYPE_LABEL, makeId() (+74 more)

### Community 103 - "Community 103"
Cohesion: 0.36
Nodes (7): ChannelTypeSchema, SeveritySchema, UpsertChannelSchema, clampLimit(), requireChannelAccess(), GET(), POST()

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (93): clampLimit(), requireDeliveryAccess(), GET(), AlertStateSchema, clampLimit(), GET(), requireAuditAccess(), GET() (+85 more)

### Community 31 - "Community 31"
Cohesion: 0.09
Nodes (33): UpdateAlertSchema, PATCH(), StatusSchema, toStringArray(), selectionFromDataset(), mapChart(), DataSourceSchemaScopeSchema, mapDataset() (+25 more)

### Community 21 - "Community 21"
Cohesion: 0.07
Nodes (43): ScopeSchema, RolloutMutationSchema, policyScopeId(), policyColumns(), policyFromRow(), findPolicyForScope(), buildRolloutState(), requireRolloutViewAccess() (+35 more)

### Community 44 - "Community 44"
Cohesion: 0.13
Nodes (19): clampWindowDays(), GET(), ChartContextBodySchema, GateBodySchema, PreviewObservedBodySchema, RejectBodySchema, serializeGovernedAiChartContext(), listAiChartRefinementRolloutPolicies() (+11 more)

### Community 105 - "Community 105"
Cohesion: 0.36
Nodes (6): EncodingSchema, ChartSchema, toStringArray(), selectionFromDataset(), mapChart(), POST()

### Community 106 - "Community 106"
Cohesion: 0.39
Nodes (7): ExportTypeSchema, CreateExportSchema, clampLimit(), requireExportAccess(), verifyExportTarget(), GET(), POST()

### Community 83 - "Community 83"
Cohesion: 0.18
Nodes (13): SslModeSchema, SchemaListSchema, CommonDataSourceFields, PostgresDataSourceCreateSchema, OracleDataSourceCreateSchema, DataSourceCreateSchema, isMissingDataSourceSchema(), GET() (+5 more)

### Community 67 - "Community 67"
Cohesion: 0.18
Nodes (15): RequestSchema, strings(), usageRecord(), POST(), SemanticProposalRequestSchema, usageRecord(), POST(), AI_WORKFLOW_CONTRACT_VERSION (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (54): POST(), RequestSchema, RequestSchema, labelForId(), resolvedChartFields(), runDraftChartRequest(), labelForId(), runPublishedChartRequest() (+46 more)

### Community 52 - "Community 52"
Cohesion: 0.09
Nodes (6): createGuidedDashboardDraftPostHandler(), Mutation, FakeQuery, FakeSupabase, schemaRunnerFake(), createGuidedDashboardDraftPostHandler()

### Community 16 - "Community 16"
Cohesion: 0.07
Nodes (42): DatasetDraftSchema, mapDataset(), POST(), GuidedInferenceKind, GuidedSchemaProfile, GuidedSemanticDraft, GuidedWorkflowLineage, GuidedDraftLineage (+34 more)

### Community 22 - "Community 22"
Cohesion: 0.07
Nodes (36): DecisionSchema, ApprovalSchema, GET(), PATCH(), QuerySchema, AuthProvider, createGuidedPublishReadinessGetHandler(), GET (+28 more)

### Community 45 - "Community 45"
Cohesion: 0.12
Nodes (27): JobTypeSchema, JobStatusSchema, JobTargetTypeSchema, EnqueueJobSchema, clampLimit(), requireJobAccess(), GET(), POST() (+19 more)

### Community 62 - "Community 62"
Cohesion: 0.14
Nodes (19): workerSecret(), isAuthorized(), batchSize(), POST(), PlatformJobSchedule, ListPlatformJobSchedulesInput, UpsertPlatformJobScheduleInput, ClaimPlatformJobSchedulesInput (+11 more)

### Community 115 - "Community 115"
Cohesion: 0.36
Nodes (7): ScheduleJobTypeSchema, ScheduleTargetTypeSchema, UpsertScheduleSchema, clampLimit(), requireScheduleAccess(), GET(), POST()

### Community 116 - "Community 116"
Cohesion: 0.43
Nodes (6): workerSecret(), isAuthorized(), batchSize(), POST(), getSupabaseServiceRoleKey(), getServiceSupabase()

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (44): RequestSchema, ProjectScope, RunContext, SemanticModelSummary, AutopilotSemanticApprovalDecision, AutopilotChartApprovalDecision, canAutopilotUseSemanticModel(), SemanticContextSourceColumn (+36 more)

### Community 27 - "Community 27"
Cohesion: 0.07
Nodes (35): RequestSchema, migrationMissing(), GET(), POST(), projectAutopilotIdempotencyKey(), PROJECT_AUTOPILOT_VERSION, ChartTypeSchema, ProjectAutopilotBriefSchema (+27 more)

### Community 33 - "Community 33"
Cohesion: 0.10
Nodes (27): RequestSchema, usageRecord(), POST(), DATASET_COPILOT_VERSION, DatasetFieldEvidence, DatasetMetricEvidence, DatasetRelationshipEvidence, DatasetCopilotProposalSchema (+19 more)

### Community 59 - "Community 59"
Cohesion: 0.11
Nodes (22): TenantCreateSchema, slugifyTenantName(), mapTenant(), isMissingTenancySchema(), GET(), POST(), PlatformRole, TenantStatus (+14 more)

### Community 19 - "Community 19"
Cohesion: 0.08
Nodes (38): ReportAgentRequestSchema, POST(), TransformAgentRequestSchema, TransformAgentResponseSchema, StoredTransformBlueprint, asRecord(), asTrimmedString(), clampText() (+30 more)

### Community 39 - "Community 39"
Cohesion: 0.12
Nodes (27): ChartRefineBodySchema, auditChartRefine(), staleChartRevisionResponse(), POST(), ChartAiPatchSchema, ChartAiPresentationPatchSchema, ChartRefinementMode, ChartAiPatchParseResult (+19 more)

### Community 79 - "Community 79"
Cohesion: 0.19
Nodes (14): MessageSchema, ChatContextSchema, ChatBodySchema, WidgetActionSchema, StyleActionSchema, ChatContext, ChatMessage, POST() (+6 more)

### Community 43 - "Community 43"
Cohesion: 0.10
Nodes (26): SuggestBodySchema, SuggestionSchema, SuggestResponseSchema, POST(), RedisCommandResult, redisConfig(), hasRedisRuntime(), redisCommand() (+18 more)

### Community 54 - "Community 54"
Cohesion: 0.15
Nodes (24): BoschCredentials, CredentialResolution, JsonRecord, RouteContext, buildEndpoint(), normalizeEnvTarget(), pickFirstDefined(), resolveBaseUrl() (+16 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (42): Props, SharedDashboardViewer(), DataRow, sanitizeNumericString(), parseSanitizedNumber(), parseComparableNumber(), compareFilterValues(), applyParseNumber() (+34 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (37): NaturalLanguageQuery(), useEnterpriseTheme(), ModernDrilldownBarChart(), useEnterpriseTheme(), ModernLineChart(), PublishedChartsGridProps, PublishedChartViewMode, ChartRunState (+29 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (37): WidgetAction, StyleAction, Message, ConfigChatbotProps, BASE_PROMPTS, EDIT_PROMPTS, ConfigChatbot(), DataPrepModalProps (+29 more)

### Community 73 - "Community 73"
Cohesion: 0.13
Nodes (6): INITIAL_NODES, INITIAL_EDGES, NODE_PALETTE, NODE_LABELS, AuthNodeData, NODE_TYPES

### Community 35 - "Community 35"
Cohesion: 0.08
Nodes (22): WidgetCardProps, chartTypeIcon, inferNumericField(), inferCategoryField(), WidgetHeaderProps, WidgetInsightsProps, trendConfig, predictionConfig (+14 more)

### Community 51 - "Community 51"
Cohesion: 0.10
Nodes (21): GROUP_ICONS, NavSelection, FrozenChartNavProps, NavSubgroup, NavGroup, FrozenChartNav, config, 15dee24 feat: improve builder/viewer flows and shared dashboard fetch fidelity (+13 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (45): Props, ProjectConfigPanel(), Dashboard, APIEndpoint, DragState, supabase, CHART_TYPES, DEFAULT_DRAG_STATE (+37 more)

### Community 28 - "Community 28"
Cohesion: 0.09
Nodes (27): CHART_COLORS, useEnterpriseTheme(), useIsDarkMode(), ModernGaugeChartProps, ModernGaugeChart(), ModernGaugeChartFromData(), useEnterpriseTheme(), ModernRingGaugeChartProps (+19 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (46): TooltipParam, ModernAreaChartProps, TooltipParam, ModernBarChartProps, XAxisLayout, normalizeLabel(), ModernDrilldownBarChartProps, TooltipParam (+38 more)

### Community 40 - "Community 40"
Cohesion: 0.09
Nodes (29): useEnterpriseTheme(), ModernBarChart(), useEnterpriseTheme(), ModernHorizontalBarChart(), AiFieldDescriptor, AiMetricDescriptor, RefineResponse, AiChartRefinementDialogProps (+21 more)

### Community 78 - "Community 78"
Cohesion: 0.15
Nodes (8): useEnterpriseTheme(), ModernPieChartProps, PieSlice, TooltipParam, LabelParam, truncate(), wrapLabel(), ModernPieChart()

### Community 129 - "Community 129"
Cohesion: 0.40
Nodes (1): ErrorBoundaryClass

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (44): GuidedProgressStepper(), statusLabel(), statusClassName(), GuidedPublishReadinessPanel(), ProjectOption, GuidedProfileApiRecord, GuidedLandingSnapshot, errorToText() (+36 more)

### Community 66 - "Community 66"
Cohesion: 0.13
Nodes (16): ProjectOption, EntityWithFields, MappingSuggestion, RelationshipSuggestion, FIELD_ROLES, titleFromColumn(), normalizeToken(), isNumericType() (+8 more)

### Community 41 - "Community 41"
Cohesion: 0.10
Nodes (26): PdfWidgetInput, PdfDownloadButtonProps, PdfDownloadButton(), ReportWidget, ReportDocumentProps, styles, ReportDocument(), TransformAgentResponseSchema (+18 more)

### Community 95 - "Community 95"
Cohesion: 0.22
Nodes (8): EndpointCacheEntry, CACHE, CachedResponse, fetchWithEndpointCache(), clearEndpointResponseCache(), EndpointRuntimeTarget, clearEndpointFailureCache(), clearEndpointProbeCache()

### Community 123 - "Community 123"
Cohesion: 0.60
Nodes (1): AlertEngine

### Community 92 - "Community 92"
Cohesion: 0.31
Nodes (8): BuilderWidgetPatchSchema, BuilderWidgetPatch, BuilderWidgetPatchResult, validateBuilderWidgetPatch(), describeBuilderWidgetPatch(), Widget, widget, bca00da feat(ai): add persistent help and governed chart editing

### Community 71 - "Community 71"
Cohesion: 0.19
Nodes (14): ChartAiPatch, GovernedChartDescriptor, GovernedChartIntentContext, ChartRefinementExample, DeterministicChartIntentResolution, normalize(), tokens(), mentionedDescriptors() (+6 more)

### Community 72 - "Community 72"
Cohesion: 0.17
Nodes (16): AiChartRefinementEventType, AiChartRefinementFailureCategory, AiChartRefinementPromptType, PROMPT_CLASSIFIERS, classifyAiChartRefinementPrompt(), classifyAiChartRefinementFailureCategory(), buildAiChartRefinementEventMetadata(), AiChartRefinementMetricRow (+8 more)

### Community 63 - "Community 63"
Cohesion: 0.13
Nodes (17): CHART_SUITE_COPILOT_VERSION, TemplateSchema, EncodingSchema, ChartSuiteDraftSchema, ChartSuiteCopilotProposalSchema, ChartSuiteCopilotProposal, ChartSuiteFieldEvidence, ChartSuiteMetricEvidence (+9 more)

### Community 128 - "Community 128"
Cohesion: 0.70
Nodes (1): CorrelationEngine

### Community 93 - "Community 93"
Cohesion: 0.38
Nodes (1): AIInsightsEngine

### Community 55 - "Community 55"
Cohesion: 0.13
Nodes (21): SEMANTIC_COPILOT_VERSION, MetricProposalSchema, SemanticMappingProposalSchema, SemanticRelationshipProposalSchema, SemanticCopilotProposalSchema, SemanticMappingProposal, SemanticCopilotProposal, SemanticProposalValidationIssue (+13 more)

### Community 26 - "Community 26"
Cohesion: 0.07
Nodes (39): AI_WORKFLOW_TYPES, AI_WORKFLOW_STATUSES, AI_ARTIFACT_TYPES, AI_PROPOSAL_STATUSES, AiWorkflowTypeSchema, AiWorkflowStatusSchema, AiArtifactTypeSchema, AiProposalStatusSchema (+31 more)

### Community 32 - "Community 32"
Cohesion: 0.12
Nodes (34): PlatformAlertChannelType, PlatformAlertDeliveryStatus, PlatformAlertChannel, PlatformAlertDeliveryAttempt, ListPlatformAlertChannelsInput, UpsertPlatformAlertChannelInput, SEVERITY_RANK, AlertDeliveryPolicy (+26 more)

### Community 94 - "Community 94"
Cohesion: 0.24
Nodes (9): PlatformAlertState, PlatformAlertSeverity, PlatformAlertType, PlatformAlert, asRecord(), mapPlatformAlert(), listPlatformAlerts(), updatePlatformAlertState() (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.10
Nodes (28): EndpointFetchPayload, EndpointFetchErrorDetails, EndpointProbeStatus, EndpointProbeResult, AUTH_STATUS_CODES, CachedFailureEntry, ProbeCacheEntry, FAILURE_CACHE (+20 more)

### Community 24 - "Community 24"
Cohesion: 0.08
Nodes (39): parseCookie(), hasSessionExpiredSignalCookie(), consumeSessionExpiredSignalCookie(), hasSupabaseAuthCookieFootprint(), LEGACY_UI_ROUTES, LEGACY_PUBLIC_SHARE_ROUTES, legacyUiRoutesEnabled(), isLegacyUiRoute() (+31 more)

### Community 86 - "Community 86"
Cohesion: 0.15
Nodes (12): BoschChartBlueprint, BoschSectionBlueprint, BoschGroupBlueprint, TWO_SERIES_DEFAULT, BOSCH_UPPCL_BLUEPRINT, BoschEndpointPreset, BOSCH_UPPCL_EXTRA_ENDPOINTS, BOSCH_UPPCL_ENDPOINTS (+4 more)

### Community 29 - "Community 29"
Cohesion: 0.07
Nodes (32): ChartNavItem, ChartNavSubgroup, ChartNavCategory, ChartNavTree, ChartNavSelection, ChartNavEndpointRef, ChartNavBuildOptions, MutableSubgroup (+24 more)

### Community 65 - "Community 65"
Cohesion: 0.15
Nodes (16): BriefFieldProfile, BriefEndpointProfile, DashboardBriefDraft, DashboardBriefPlan, TIME_WORDS, VALUE_WORDS, words(), overlapScore() (+8 more)

### Community 75 - "Community 75"
Cohesion: 0.14
Nodes (14): PRESET_POSITION, getWidgetSizePreset(), getWidgetGridSpanClass(), getWidgetCardHeightClass(), DashboardChartDensity, DashboardChartTextOverflow, DashboardChartDateFormat, DashboardChartLocale (+6 more)

### Community 17 - "Community 17"
Cohesion: 0.05
Nodes (47): HexColorSchema, FontWeightSchema, MarginSchema, DensitySchema, TextOverflowSchema, DateFormatSchema, LocaleSchema, TimeZoneSchema (+39 more)

### Community 68 - "Community 68"
Cohesion: 0.18
Nodes (17): ORDER_GROUPS, NamedValue, LabelComparator, MONTHS, WEEKDAYS, normalize(), buildOrderMap(), detectOrderMap() (+9 more)

### Community 69 - "Community 69"
Cohesion: 0.15
Nodes (16): DashboardShape, EndpointShape, ExportWidget, ExportEndpoint, ExportGroup, buildDashboardConfig(), slugifyDashboardName(), resolveBaseUrl() (+8 more)

### Community 48 - "Community 48"
Cohesion: 0.14
Nodes (25): generateProjectFromConfig(), buildClientSafeExportConfig(), BoschProxyDefaults, sanitizeDefaultHeadersForExport(), normalizeEnvTarget(), normalizeUrl(), extractAbsoluteBaseFromUrl(), deriveBoschProxyDefaults() (+17 more)

### Community 80 - "Community 80"
Cohesion: 0.21
Nodes (14): GeneratedFileMap, EXPORTED_CHART_TYPES, AIExportConfig, DashboardExportConfigLike, AI_DEPENDENCY_VERSIONS, verifyChartTypeCoverage(), parseExportConfig(), parseInternalAIConfig() (+6 more)

### Community 53 - "Community 53"
Cohesion: 0.14
Nodes (23): GuidedProfileRecord, GuidedProfileConflictError, mapGuidedProfile(), semanticKey(), titleFromKey(), normalizeToken(), singularToken(), sourceColumnKey() (+15 more)

### Community 57 - "Community 57"
Cohesion: 0.15
Nodes (22): PostgresRuntimeOptions, PostgresColumnMetadata, PostgresSchemaTruncationReason, PostgresSchemaIntrospectionResult, PostgresSchemaRow, PostgresForeignKeyRow, ManagedPostgresPool, globalForPostgresPools (+14 more)

### Community 42 - "Community 42"
Cohesion: 0.11
Nodes (24): PostgresTableMetadata, isMissingSchemaInventory(), SchemaRelationClassificationResult, SchemaInventoryRelationInput, postgresRelationType(), classifySchemaRelation(), relationFingerprint(), buildSchemaInventoryRelations() (+16 more)

### Community 56 - "Community 56"
Cohesion: 0.12
Nodes (20): buildPostgresSchemaIntrospectionResult(), SchemaSensitivity, SchemaSemanticType, SchemaProfileColumnInput, SchemaProfileTableInput, SchemaForeignKeyEvidence, SchemaColumnProfile, SchemaTableProfile (+12 more)

### Community 60 - "Community 60"
Cohesion: 0.15
Nodes (20): SchemaIntrospectionRunResult, SchemaRefreshPlan, schemasFromConnectionConfig(), buildSchemaRefreshPlan(), SchemaIntrospectionIncompleteError, SchemaIntrospectionRecordingError, isMissingSchemaSnapshotRpc(), isMissingSchemaInventoryRpc() (+12 more)

### Community 97 - "Community 97"
Cohesion: 0.36
Nodes (9): PlatformJobRunResult, requireTargetId(), runDashboardHealthJob(), runSchemaRefreshJob(), runCacheWarmJob(), runExportJob(), runAlertDeliveryJob(), runPlatformJob() (+1 more)

### Community 124 - "Community 124"
Cohesion: 0.53
Nodes (1): PDFExporter

### Community 58 - "Community 58"
Cohesion: 0.16
Nodes (23): DashboardExportStatus, DashboardExportStorageStatus, DashboardExportArtifact, CreateDashboardExportInput, ListDashboardExportArtifactsInput, asRecord(), toArtifactRecord(), makeArtifactName() (+15 more)

### Community 114 - "Community 114"
Cohesion: 0.36
Nodes (7): DashboardExportManifestChart, DashboardExportManifest, styles, text(), chartLabel(), renderDashboardReportPdf(), renderDashboardBundleZip()

### Community 70 - "Community 70"
Cohesion: 0.23
Nodes (15): TenantCapability, EntitlementDecision, EntitlementContext, ScopedTarget, DashboardEntitlementInput, DatasetEntitlementInput, allow(), deny() (+7 more)

### Community 76 - "Community 76"
Cohesion: 0.19
Nodes (13): ChartHealthState, DashboardChartAuditItem, DashboardChartAudit, AuditDashboardChartsInput, toStringArray(), asRecord(), asEncoding(), selectionFromDataset() (+5 more)

### Community 37 - "Community 37"
Cohesion: 0.10
Nodes (26): CHART_TEMPLATE_REGISTRY, getChartTemplate(), SemanticFieldRow, SemanticMetricRow, DATE_TYPE_HINTS, NUMBER_TYPE_HINTS, BOOLEAN_TYPE_HINTS, asRecord() (+18 more)

### Community 25 - "Community 25"
Cohesion: 0.10
Nodes (41): SourceColumn, FieldRow, MetricRow, RelationshipRow, SelectTable, CompiledSelect, DatasetQueryCompileResult, asRecord() (+33 more)

### Community 89 - "Community 89"
Cohesion: 0.21
Nodes (5): dispatchBrowserEvent(), dispatchSupabaseAuthNetworkError(), dispatchSupabaseAuthExpired(), lastWarningAt, createSupabaseRetryableFetch()

### Community 99 - "Community 99"
Cohesion: 0.31
Nodes (1): SchemaDetector

### Community 82 - "Community 82"
Cohesion: 0.15
Nodes (11): DASHBOARD_BRIEF_VERSION, BRIEF_CHART_TYPES, BriefChartType, DashboardChartRequirementSchema, DashboardBriefSchema, DashboardChartRequirement, DashboardBrief, parseDashboardBrief() (+3 more)

### Community 100 - "Community 100"
Cohesion: 0.22
Nodes (6): DashboardChartConfig, previewChart, previewPatch, chartContext, hideFrameworkChrome(), openHarness()

### Community 130 - "Community 130"
Cohesion: 1.00
Nodes (4): dashboards, auth.users, endpoints, widgets

### Community 107 - "Community 107"
Cohesion: 0.61
Nodes (7): endpoint_profile_runs, auth.users, dashboards, endpoints, endpoint_profiles, endpoint_mapping_feedback, widgets

### Community 131 - "Community 131"
Cohesion: 0.90
Nodes (4): chart_groups, dashboards, auth.users, chart_subgroups

### Community 132 - "Community 132"
Cohesion: 0.70
Nodes (4): transform_blueprints, auth.users, dashboards, endpoints

### Community 90 - "Community 90"
Cohesion: 0.30
Nodes (7): tenants, tenant_domains, tenant_memberships, auth.users, dashboard_projects, project_assignments, audit_logs

### Community 108 - "Community 108"
Cohesion: 0.54
Nodes (7): business_models, tenants, dashboard_projects, business_entities, business_fields, business_metrics, business_relationships

### Community 141 - "Community 141"
Cohesion: 0.83
Nodes (3): data_sources, tenants, dashboard_projects

### Community 133 - "Community 133"
Cohesion: 0.70
Nodes (4): data_source_columns, tenants, dashboard_projects, data_sources

### Community 134 - "Community 134"
Cohesion: 0.70
Nodes (4): semantic_datasets, tenants, dashboard_projects, business_models

### Community 118 - "Community 118"
Cohesion: 0.62
Nodes (6): dashboard_chart_configs, tenants, dashboard_projects, semantic_datasets, dashboard_chart_validation_results, auth.users

### Community 109 - "Community 109"
Cohesion: 0.46
Nodes (7): semantic_query_runs, tenants, dashboard_projects, semantic_datasets, dashboard_chart_configs, data_sources, auth.users

### Community 135 - "Community 135"
Cohesion: 0.70
Nodes (4): chart_health_runs, tenants, dashboard_projects, auth.users

### Community 98 - "Community 98"
Cohesion: 0.69
Nodes (9): published_dashboards, tenants, dashboard_projects, auth.users, dashboard_versions, dashboard_pages, dashboard_chart_slots, dashboard_chart_configs (+1 more)

### Community 119 - "Community 119"
Cohesion: 0.52
Nodes (6): dashboard_health_runs, tenants, dashboard_projects, published_dashboards, dashboard_versions, auth.users

### Community 110 - "Community 110"
Cohesion: 0.57
Nodes (7): published_dashboards, dashboard_versions, dashboard_pages, dashboard_chart_slots, dashboard_chart_configs, dashboard_publish_events, dashboard_health_runs

### Community 125 - "Community 125"
Cohesion: 0.60
Nodes (5): data_source_schema_runs, tenants, dashboard_projects, data_sources, auth.users

### Community 136 - "Community 136"
Cohesion: 0.70
Nodes (4): platform_jobs, tenants, dashboard_projects, auth.users

### Community 120 - "Community 120"
Cohesion: 0.48
Nodes (5): platform_job_schedules, tenants, dashboard_projects, platform_jobs, auth.users

### Community 137 - "Community 137"
Cohesion: 0.70
Nodes (4): platform_alerts, tenants, dashboard_projects, auth.users

### Community 126 - "Community 126"
Cohesion: 0.60
Nodes (5): query_budget_policies, tenants, dashboard_projects, data_sources, auth.users

### Community 111 - "Community 111"
Cohesion: 0.46
Nodes (7): dashboard_export_artifacts, tenants, dashboard_projects, published_dashboards, dashboard_versions, platform_jobs, auth.users

### Community 112 - "Community 112"
Cohesion: 0.54
Nodes (7): platform_alert_channels, tenants, dashboard_projects, auth.users, platform_alert_delivery_attempts, platform_alerts, platform_jobs

### Community 101 - "Community 101"
Cohesion: 0.47
Nodes (8): tenant_capabilities, tenants, published_dashboard_entitlements, dashboard_projects, published_dashboards, auth.users, semantic_dataset_entitlements, semantic_datasets

### Community 138 - "Community 138"
Cohesion: 0.70
Nodes (4): ai_chart_refinement_rollout_policies, tenants, dashboard_projects, auth.users

### Community 139 - "Community 139"
Cohesion: 0.70
Nodes (4): guided_schema_profiles, tenants, dashboard_projects, data_sources

### Community 113 - "Community 113"
Cohesion: 0.46
Nodes (7): apply_data_source_schema_snapshot_atomic(), v_source, data_sources, data_source_columns, jsonb_to_recordset, was, public

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (52): dashboard_release_dataset_snapshots, tenants, dashboard_projects, dashboard_versions, dashboard_release_chart_snapshots, dashboard_chart_slots, guard_dashboard_release_version_mutation, guard_dashboard_release_page_mutation (+44 more)

### Community 84 - "Community 84"
Cohesion: 0.29
Nodes (12): ai_workflow_runs, tenants, dashboard_projects, auth.users, ai_workflow_proposals, ai_workflow_runs_set_updated_at, ai_workflow_proposals_set_updated_at, ai_workflow_runs_audit (+4 more)

### Community 121 - "Community 121"
Cohesion: 0.48
Nodes (5): data_source_schema_profiles, tenants, dashboard_projects, data_sources, data_source_schema_profiles_set_updated_at

### Community 61 - "Community 61"
Cohesion: 0.22
Nodes (21): data_source_relations, tenants, dashboard_projects, data_sources, data_source_relation_selections, auth.users, apply_data_source_schema_inventory_atomic(), v_source (+13 more)

### Community 88 - "Community 88"
Cohesion: 0.29
Nodes (12): create_dashboard_chart_drafts(), v_dataset, semantic_datasets, business_models, jsonb_array_elements, jsonb_array_elements_text, dashboard_chart_configs, v_chart (+4 more)

### Community 102 - "Community 102"
Cohesion: 0.44
Nodes (7): project_autopilot_runs, tenants, dashboard_projects, auth.users, project_autopilot_steps, project_autopilot_runs_set_updated_at, project_autopilot_steps_set_updated_at

### Community 64 - "Community 64"
Cohesion: 0.19
Nodes (19): compose_project_autopilot_dashboard_draft(), v_run, project_autopilot_runs, jsonb_array_elements, v_unique_chart_count, v_valid_chart_count, dashboard_chart_configs, the (+11 more)

### Community 127 - "Community 127"
Cohesion: 0.47
Nodes (4): dashboard_release_dataset_snapshot_integrity, dashboard_release_dataset_snapshots, enforce_dashboard_release_semantic_snapshot_integrity(), public

### Community 91 - "Community 91"
Cohesion: 0.18
Nodes (1): Query

### Community 122 - "Community 122"
Cohesion: 0.29
Nodes (1): MissingTableQuery

### Community 87 - "Community 87"
Cohesion: 0.23
Nodes (13): 023e3fb merge: sprint5-monitoring-ui → dev, 172d5f6 Merge branch 'main' of https://github.com/Ujjwaldhariwal/AI-Dashboard-builder- into dev, 21ee7b8 merge(dev→main): enhanced token session timer chip, 2354c5d merge(dev): Sprint 3 — macOS double-decker group navigator, 2389a85 merge(dev→main): cleanup stash conflicts, stale branches, codex-skills, remove old docs, 49a12e6 feat(data): add safe declarative data transform layer with edit UI, 74e8979 feat(ui): revamp widget header and responsive app layout, 8a0b538 merge(dev): Sprint 4 — safe data transform layer with edit UI (+5 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (47): 02c54d5 feat(monitoring+notifs): full monitoring page, real notification store, bell wired to errors+health, 06b820f feat(sprint-1): migrate all charts to ECharts — gradients, native gauge, smooth animations, enterprise theme, 0b7de3e fix: lazy-init OpenAI client to prevent build-time crash, 0e0a84b feat(sprint-2): complete ZIP export with login page, sidebar, ECharts, PDF export, project config + chart groups, 115fe9b feat(ai): OpenAI chat + suggest routes, config chatbot, chart suggester, NL query, builder AI sidebar, 1caf797 feat: add selectedWidgetId + onSelectWidget to canvas for AI style scoping, 222761c feat(layout): improve responsive sidebar and mobile navigation, 24cf646 feat(workspaces): inline dashboard rename — pencil icon on hover, Enter/blur to save, Esc to cancel (+39 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (76): 03090c8 docs: refresh db dashboard handoff context, 042fba1 feat: select semantic dataset assets, 0979e20 test(platform): add guided publish db integration fixture, 09c4244 feat: add alert delivery fanout, 0b17d50 feat: add admin API docs inventory page, 0b3c27f feat: enforce query budget policies, 10d4599 feat: add chart compatibility engine, 112f839 fix(demo): trust authoritative production host (+68 more)

## Knowledge Gaps
- **829 isolated node(s):** `supabaseConnectionSources`, `securityHeaders`, `nextConfig`, `config`, `root` (+824 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 129`** (1 nodes): `ErrorBoundaryClass`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 123`** (1 nodes): `AlertEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 128`** (1 nodes): `CorrelationEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 93`** (1 nodes): `AIInsightsEngine`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 124`** (1 nodes): `PDFExporter`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 99`** (1 nodes): `SchemaDetector`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 91`** (1 nodes): `Query`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 122`** (1 nodes): `MissingTableQuery`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Button` connect `Community 3` to `Community 23`, `Community 18`, `Community 1`, `Community 2`, `Community 73`, `Community 47`, `Community 4`, `Community 35`, `Community 8`, `Community 50`, `Community 49`, `Community 51`, `Community 41`, `Community 40`, `Community 117`, `Community 46`, `Community 30`, `Community 10`, `Community 38`, `Community 77`, `Community 66`, `Community 12`, `Community 28`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `Badge()` connect `Community 23` to `Community 18`, `Community 1`, `Community 2`, `Community 104`, `Community 73`, `Community 47`, `Community 3`, `Community 49`, `Community 4`, `Community 40`, `Community 38`, `Community 46`, `Community 30`, `Community 10`, `Community 77`, `Community 66`, `Community 12`, `Community 50`, `Community 28`, `Community 14`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `getAuthedSupabase()` connect `Community 0` to `Community 67`, `Community 21`, `Community 44`, `Community 103`, `Community 27`, `Community 39`, `Community 79`, `Community 7`, `Community 105`, `Community 106`, `Community 83`, `Community 16`, `Community 33`, `Community 15`, `Community 31`, `Community 45`, `Community 54`, `Community 22`, `Community 5`, `Community 115`, `Community 43`, `Community 50`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `supabaseConnectionSources`, `securityHeaders`, `nextConfig` to the rest of the system?**
  _829 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 34` be split into smaller, more focused modules?**
  _Cohesion score 0.08901515151515152 - nodes in this community are weakly interconnected._
- **Should `Community 9` be split into smaller, more focused modules?**
  _Cohesion score 0.09877264757451783 - nodes in this community are weakly interconnected._
- **Should `Community 23` be split into smaller, more focused modules?**
  _Cohesion score 0.05537098560354374 - nodes in this community are weakly interconnected._