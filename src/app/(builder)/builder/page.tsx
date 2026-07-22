"use client";

/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */

// src/app/(builder)/builder/page.tsx
// Optimized: reduced state, fixed effect loops, responsive
// header, memoized computations, modular sub-components

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDashboardStore } from "@/store/builder-store";
import { DragDropCanvas } from "@/components/builder/canvas/drag-drop-canvas";
import { WidgetConfigDialog } from "@/components/builder/widget-config-dialog";
import { MagicPasteModal } from "@/components/builder/magic-paste-modal";
import { DashboardBriefDialog } from "@/components/builder/dashboard-brief-dialog";
import { ConfigChatbot } from "@/components/builder/ai-assistant/config-chatbot";
import { ChartSuggester } from "@/components/builder/ai-assistant/chart-suggester";
import { WidgetStylePanel } from "@/components/builder/style-panel/widget-style-panel";
import { ProjectConfigPanel } from "@/components/builder/project-config/project-config-panel";
import { ExportConfigModal } from "@/components/builder/export/export-config-modal";
import { toast } from "sonner";
import {
  Plus,
  Settings2,
  Eye,
  Database,
  FolderKanban,
  Download,
  Wand2,
  Sparkles,
  X,
  Bot,
  Circle,
  Minimize2,
  Maximize2,
  Palette,
  SlidersHorizontal,
  Loader2,
  Radar,
  RefreshCw,
  MoreHorizontal,
  ListChecks,
} from "lucide-react";
import Link from "next/link";
import {
  buildDashboardConfig,
  slugifyDashboardName,
} from "@/lib/code-generator/config-builder";
import { generateProjectFromConfig } from "@/lib/code-generator/template-generator";
import { packageProjectAsZip } from "@/lib/code-generator/zip-packager";
import { motion, AnimatePresence } from "framer-motion";
import { useDashboardEndpointPrefetch } from "@/hooks/use-dashboard-endpoint-prefetch";
import { clearEndpointResponseCache } from "@/lib/api/endpoint-response-cache";
import {
  clearEndpointFailureCache,
  clearEndpointProbeCache,
  getEndpointSessionScope,
  prefetchDashboardEndpoints,
  probeDashboardEndpoints,
  type DashboardEndpointProbeSummary,
} from "@/lib/api/endpoint-runtime-cache";
import { buildAutoWidgetsFromEndpoints } from "@/lib/builder/auto-widget-generator";
import {
  fetchTrainingProfiles,
  profileMapFromList,
} from "@/lib/training/profile-client";
import { dispatchDashboardWidgetRefresh } from "@/lib/builder/widget-refresh-events";
import {
  BUILDER_API_HEALTH_RESCAN_EVENT,
  dispatchBuilderApiHealthSummary,
} from "@/lib/builder/api-health-events";
import { FrozenChartNav } from "@/components/builder/nav/linear-bar";
import {
  buildChartNavTree,
  filterWidgetsByNavSelection,
  type ChartNavTree,
} from "@/lib/builder/chart-nav-model";
import type { AIExportConfig } from "@/types/project-config";
import type { EndpointProfile } from "@/types/training";

interface NavSelection {
  groupId: string;
  subgroupId: string;
}

const DEFAULT_NAV_SELECTION: NavSelection = {
  groupId: "",
  subgroupId: "",
};

function resolveStrictNavSelection(
  tree: ChartNavTree,
  selection: NavSelection,
): NavSelection {
  const firstCategory = tree.categories[0];
  if (!firstCategory) return DEFAULT_NAV_SELECTION;

  const resolvedCategory =
    tree.categories.find((category) => category.id === selection.groupId) ??
    firstCategory;
  const resolvedSubgroup =
    resolvedCategory.subgroups.find(
      (subgroup) => subgroup.id === selection.subgroupId,
    ) ?? resolvedCategory.subgroups[0];

  if (!resolvedSubgroup) {
    return DEFAULT_NAV_SELECTION;
  }

  return {
    groupId: resolvedCategory.id,
    subgroupId: resolvedSubgroup.id,
  };
}

export default function BuilderPage() {
  const router = useRouter();
  const {
    dashboards,
    currentDashboardId,
    setCurrentDashboard,
    endpoints: allEndpoints,
    widgets: allWidgets,
    addWidget,
    getProjectConfig,
    getGroupsByDashboard,
    chartNavSelections,
    setChartNavSelection,
  } = useDashboardStore();

  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [magicOpen, setMagicOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [exportConfigOpen, setExportConfigOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);

  const [aiPanel, setAiPanel] = useState({ open: false, minimized: false });

  const [ops, setOps] = useState({
    scanning: false,
    autoAdding: false,
    refreshing: false,
  });

  const [scanSummary, setScanSummary] = useState<DashboardEndpointProbeSummary | null>(null);
  const [sessionScope, setSessionScope] = useState(() => getEndpointSessionScope());

  const hasMounted = useRef(false);
  const lastSavedCount = useRef(0);
  const [unsaved, setUnsaved] = useState(false);

  const currentDash = useMemo(
    () => dashboards.find((d) => d.id === currentDashboardId),
    [dashboards, currentDashboardId],
  );
  const currentAIExportConfig = useMemo(
    () => (currentDash ? getProjectConfig(currentDash.id).aiExportConfig : undefined),
    [currentDash, getProjectConfig],
  );

  const dashboardEndpoints = useMemo(
    () => allEndpoints.filter((ep) => (ep.dashboardId ?? currentDashboardId) === currentDashboardId),
    [allEndpoints, currentDashboardId],
  );

  const widgets = useMemo(
    () => allWidgets.filter((w) => w.dashboardId === currentDashboardId),
    [allWidgets, currentDashboardId],
  );

  const activeDashboardEndpoints = useMemo(
    () => dashboardEndpoints.filter((ep) => ep.status !== "inactive" && ep.url?.trim()),
    [dashboardEndpoints],
  );

  const collections = useMemo(
    () => (currentDashboardId ? getGroupsByDashboard(currentDashboardId) : []),
    [currentDashboardId, getGroupsByDashboard],
  );

  const navEndpointLookup = useMemo(
    () => Object.fromEntries(dashboardEndpoints.map((ep) => [ep.id, { name: ep.name, url: ep.url }])),
    [dashboardEndpoints],
  );

  const useTaxonomyFallback = collections.length === 0;
  const navSelection = useMemo<NavSelection>(() => {
    if (!currentDashboardId) return DEFAULT_NAV_SELECTION;
    return chartNavSelections[currentDashboardId] ?? DEFAULT_NAV_SELECTION;
  }, [chartNavSelections, currentDashboardId]);

  const orderedWidgets = useMemo(
    () =>
      [...widgets].sort((a, b) => {
        const ay = a.position?.y ?? 0;
        const by = b.position?.y ?? 0;
        if (ay !== by) return ay - by;
        const ax = a.position?.x ?? 0;
        const bx = b.position?.x ?? 0;
        if (ax !== bx) return ax - bx;
        return a.id.localeCompare(b.id);
      }),
    [widgets],
  );

  const navTree = useMemo(
    () =>
      buildChartNavTree(orderedWidgets, collections, {
        endpointLookup: navEndpointLookup,
        useTaxonomyFallback,
      }),
    [orderedWidgets, collections, navEndpointLookup, useTaxonomyFallback],
  );

  const strictNavSelection = useMemo(
    () => resolveStrictNavSelection(navTree, navSelection),
    [navTree, navSelection],
  );

  const visibleWidgets = useMemo(() => {
    if (!strictNavSelection.groupId || !strictNavSelection.subgroupId) {
      return orderedWidgets;
    }
    return filterWidgetsByNavSelection(
      orderedWidgets,
      strictNavSelection.groupId,
      strictNavSelection.subgroupId,
      collections,
      { endpointLookup: navEndpointLookup, useTaxonomyFallback },
    );
  }, [orderedWidgets, strictNavSelection.groupId, strictNavSelection.subgroupId, collections, navEndpointLookup, useTaxonomyFallback]);

  const allWidgetsWithoutGroup = useMemo(
    () => orderedWidgets.length > 0 && orderedWidgets.every((widget) => !widget.groupId || widget.groupId.trim().length === 0),
    [orderedWidgets],
  );

  useDashboardEndpointPrefetch(activeDashboardEndpoints);

  useEffect(() => {
    if (!currentDashboardId && dashboards.length > 0) {
      setCurrentDashboard(dashboards[0].id);
    }
  }, [currentDashboardId, dashboards, setCurrentDashboard]);

  useEffect(() => {
    setSelectedWidgetId(null);
  }, [currentDashboardId]);

  useEffect(() => {
    const handler = () => setSessionScope(getEndpointSessionScope());
    window.addEventListener("builderDemoAuthSessionChanged", handler);
    return () => window.removeEventListener("builderDemoAuthSessionChanged", handler);
  }, []);

  useEffect(() => {
    const normalized = strictNavSelection;
    if (!currentDashboardId) return;
    if (normalized.groupId !== navSelection.groupId || normalized.subgroupId !== navSelection.subgroupId) {
      setChartNavSelection(currentDashboardId, normalized);
    }
  }, [
    currentDashboardId,
    navSelection.groupId,
    navSelection.subgroupId,
    setChartNavSelection,
    strictNavSelection,
  ]);

  useEffect(() => {
    if (selectedWidgetId && !visibleWidgets.some((widget) => widget.id === selectedWidgetId)) {
      setSelectedWidgetId(null);
    }
  }, [selectedWidgetId, visibleWidgets]);

  useEffect(() => {
    if (!hasMounted.current) {
      lastSavedCount.current = widgets.length;
      hasMounted.current = true;
      return;
    }
    if (widgets.length !== lastSavedCount.current) setUnsaved(true);
  }, [widgets.length]);

  const runApiScan = useCallback(
    async (opts: { force?: boolean; silent?: boolean } = {}) => {
      if (activeDashboardEndpoints.length === 0) {
        setScanSummary(null);
        if (!opts.silent) toast.info("No active APIs available for scan.");
        return null;
      }
      setOps((p) => ({ ...p, scanning: true }));
      if (!opts.silent) toast.loading("Scanning API health...", { id: "api-scan" });
      try {
        const summary = await probeDashboardEndpoints(activeDashboardEndpoints, { force: opts.force, sessionScope });
        setScanSummary(summary);
        if (!opts.silent) toast.success(`Scan: ${summary.healthy} healthy, ${summary.unauthorized} auth, ${summary.failed} failed.`, { id: "api-scan" });
        return summary;
      } catch (e) {
        if (!opts.silent) toast.error(`Scan failed: ${e instanceof Error ? e.message : e}`, { id: "api-scan" });
        return null;
      } finally {
        setOps((p) => ({ ...p, scanning: false }));
      }
    },
    [activeDashboardEndpoints, sessionScope],
  );

  useEffect(() => { void runApiScan({ silent: true }); }, [runApiScan]);

  useEffect(() => {
    dispatchBuilderApiHealthSummary(scanSummary);
  }, [scanSummary]);

  useEffect(() => {
    const handler = () => { void runApiScan({ force: true }); };
    window.addEventListener(BUILDER_API_HEALTH_RESCAN_EVENT, handler);
    return () => {
      window.removeEventListener(BUILDER_API_HEALTH_RESCAN_EVENT, handler);
      dispatchBuilderApiHealthSummary(null);
    };
  }, [runApiScan]);

  const handleScanApis = useCallback(() => { void runApiScan({ force: true }); }, [runApiScan]);

  const handleRefreshAll = useCallback(async () => {
    setOps((p) => ({ ...p, refreshing: true }));
    toast.loading("Refreshing...", { id: "refresh" });
    try {
      clearEndpointResponseCache();
      clearEndpointFailureCache();
      clearEndpointProbeCache();
      if (activeDashboardEndpoints.length > 0) {
        await prefetchDashboardEndpoints(activeDashboardEndpoints, { sessionScope });
        await runApiScan({ silent: true });
      }
      dispatchDashboardWidgetRefresh({ scope: "all", force: false });
      toast.dismiss("refresh");
    } catch (e) {
      toast.error(`Refresh failed: ${e instanceof Error ? e.message : e}`, { id: "refresh" });
    } finally {
      setOps((p) => ({ ...p, refreshing: false }));
    }
  }, [activeDashboardEndpoints, runApiScan, sessionScope]);

  const handleAutoAdd = useCallback(async () => {
    if (!currentDashboardId || activeDashboardEndpoints.length === 0) {
      toast.info("No active APIs to auto-add.");
      return;
    }
    setOps((p) => ({ ...p, autoAdding: true }));
    toast.loading("Building widgets...", { id: "auto-add" });

    try {
      const summary = scanSummary ?? (await runApiScan({ silent: true }));
      if (!summary) {
        toast.error("Scan required first.", { id: "auto-add" });
        return;
      }

      const healthyIds = new Set(summary.results.filter((r) => r.status === "healthy").map((r) => r.endpointId as string));
      if (healthyIds.size === 0) {
        toast.info("No healthy APIs.", { id: "auto-add" });
        return;
      }

      let trainedProfilesByEndpointId: Record<string, EndpointProfile> | undefined;
      try {
        const profiles = await fetchTrainingProfiles(currentDashboardId);
        trainedProfilesByEndpointId = profileMapFromList(profiles);
      } catch {
        trainedProfilesByEndpointId = undefined;
      }

      const { drafts, skippedExisting, skippedFetch, skippedNoData, skippedReview } = await buildAutoWidgetsFromEndpoints({
        endpoints: activeDashboardEndpoints,
        widgets,
        sessionScope,
        healthyEndpointIds: healthyIds,
        trainedProfilesByEndpointId,
      });

      if (drafts.length === 0) {
        toast.info(`No new widgets. Skip: ${skippedExisting} existing, ${skippedReview} review, ${skippedNoData} no-data, ${skippedFetch} failed.`, { id: "auto-add" });
        return;
      }

      for (const d of drafts) {
        addWidget({
          title: d.title,
          type: d.type,
          endpointId: d.endpointId,
          dataMapping: { xAxis: d.xAxis, yAxis: d.yAxis, yAxes: d.yAxes },
          position: d.position,
        });
      }
      toast.dismiss("auto-add");
    } finally {
      setOps((p) => ({ ...p, autoAdding: false }));
    }
  }, [currentDashboardId, activeDashboardEndpoints, scanSummary, runApiScan, widgets, sessionScope, addWidget]);

  const handleCanvasClick = useCallback(() => { setSelectedWidgetId(null); }, []);

  const handleExport = useCallback(() => {
    if (!currentDash) return toast.error("No active dashboard");
    if (!widgets.length) return toast.error("Add at least one widget first");
    setExportConfigOpen(true);
  }, [currentDash, widgets.length]);

  const handleGenerateZip = useCallback(async (dashboardId: string, aiExportConfig: AIExportConfig): Promise<void> => {
    const dashboard = dashboards.find((item) => item.id === dashboardId);
    if (!dashboard) {
      toast.error("No active dashboard");
      return;
    }

    const dashboardWidgets = allWidgets.filter((widget) => widget.dashboardId === dashboardId);
    if (dashboardWidgets.length === 0) {
      toast.error("Add at least one widget first");
      return;
    }

    const store = useDashboardStore.getState();
    const baseProjectConfig = store.getProjectConfig(dashboardId);
    const loginEndpoint = baseProjectConfig.login.endpoint.trim();
    if (!loginEndpoint) {
      toast.error("Login endpoint is required to export standalone dashboard.");
      return;
    }

    setExporting(true);
    toast.loading("Generating project...", { id: "export" });

    try {
      const config = buildDashboardConfig(dashboard, allEndpoints, allWidgets, { ...baseProjectConfig, aiExportConfig }, store.getGroupsByDashboard(dashboardId));
      const blob = await packageProjectAsZip(generateProjectFromConfig(config));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugifyDashboardName(dashboard.name)}-dashboard.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success("Export ready!", { id: "export" });
      lastSavedCount.current = dashboardWidgets.length;
      setUnsaved(false);
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : err}`, { id: "export" });
    } finally {
      setExporting(false);
    }
  }, [dashboards, allWidgets, allEndpoints]);

  const handleNavChange = useCallback((selection: NavSelection) => {
    if (!currentDashboardId) return;
    setChartNavSelection(currentDashboardId, selection);
  }, [currentDashboardId, setChartNavSelection]);

  const openAi = useCallback(() => { setAiPanel({ open: true, minimized: false }); }, []);
  const closeAi = useCallback(() => { setAiPanel({ open: false, minimized: false }); }, []);
  const toggleAiMin = useCallback(() => { setAiPanel((p) => ({ ...p, minimized: !p.minimized })); }, []);

  // Empty state: No Dashboard
  if (dashboards.length === 0) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="flex min-h-[28rem] items-center justify-center rounded-lg border bg-card p-6 text-center">
          <div>
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border bg-muted text-foreground">
              <FolderKanban className="h-4 w-4" />
            </div>
            <h1 className="mt-4 text-xl font-semibold tracking-tight">Create a dashboard workspace</h1>
            <div className="mt-5 flex justify-center">
              <Button onClick={() => router.push("/workspaces")}>Open workspaces</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state: No APIs/Widgets
  if (dashboardEndpoints.length === 0 && widgets.length === 0) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-muted/20">
        <div className="border-b bg-background">
          <div className="mx-auto w-full max-w-[96rem] px-4 py-4 lg:px-6">
            <BuilderHeader
              currentDash={currentDash}
              widgetCount={0}
              endpointCount={0}
              exporting={false}
              unsaved={false}
              ops={{ scanning: false, autoAdding: false, refreshing: false }}
              scanSummary={null}
              onAddWidget={() => setAddWidgetOpen(true)}
              onOpenAssistant={openAi}
              onOpenBrief={() => setBriefOpen(true)}
              onMagicOpen={() => setMagicOpen(true)}
              onExport={handleExport}
              onScanApis={handleScanApis}
              onRefreshAll={handleRefreshAll}
              onAutoAdd={handleAutoAdd}
            />
          </div>
        </div>
        <div className="mx-auto w-full max-w-[96rem] px-4 py-6 lg:px-6">
          <section className="flex min-h-[34rem] items-center justify-center rounded-lg border bg-card p-6 text-center">
            <div>
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border bg-muted">
                <Database className="h-4 w-4" />
              </div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight">Connect data to start</h2>
              <div className="mt-5 flex justify-center">
                <Button asChild>
                  <Link href="/api-config">
                    <Settings2 className="mr-2 h-4 w-4" /> Configure data
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        </div>
        <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />
        <MagicPasteModal isOpen={magicOpen} onClose={() => setMagicOpen(false)} />
        <DashboardBriefDialog open={briefOpen} onOpenChange={setBriefOpen} />
        {currentDash && (
          <ExportConfigModal
            open={exportConfigOpen}
            onOpenChange={setExportConfigOpen}
            dashboardId={currentDash.id}
            initialConfig={currentAIExportConfig}
            exporting={exporting}
            generateZip={handleGenerateZip}
          />
        )}
      </div>
    );
  }

  // Main Builder UI
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-muted/20">
      
      {/* The Header scrolls AWAY naturally */}
      <div className="border-b bg-background">
        <div className="mx-auto w-full max-w-[96rem] px-4 py-4 lg:px-6">
          <BuilderHeader
            currentDash={currentDash}
            widgetCount={widgets.length}
            endpointCount={dashboardEndpoints.length}
            exporting={exporting}
            unsaved={unsaved}
            ops={ops}
            scanSummary={scanSummary}
            onAddWidget={() => setAddWidgetOpen(true)}
            onOpenAssistant={openAi}
            onOpenBrief={() => setBriefOpen(true)}
            onMagicOpen={() => setMagicOpen(true)}
            onExport={handleExport}
            onScanApis={handleScanApis}
            onRefreshAll={handleRefreshAll}
            onAutoAdd={handleAutoAdd}
          />
        </div>
      </div>

      {orderedWidgets.length > 0 && (
        <FrozenChartNav
          tree={navTree}
          activeGroupId={navSelection.groupId}
          activeSubgroupId={navSelection.subgroupId}
          onSelectionChange={handleNavChange}
          showUngroupedHint={allWidgetsWithoutGroup}
        />
      )}

      <div
        className={cn(
          "mx-auto grid w-full max-w-[96rem] gap-4 px-4 py-6 lg:px-6",
          aiPanel.open && "xl:grid-cols-[minmax(0,1fr)_24rem]",
        )}
      >
        <section className="min-w-0 overflow-hidden rounded-lg border bg-background" onClick={handleCanvasClick}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <p className="text-sm font-medium">Canvas</p>
            <span className="font-mono text-[11px] text-muted-foreground">{visibleWidgets.length}</span>
          </div>
          <div className="bg-muted/15 p-4 md:p-5">
            <DragDropCanvas
              selectedWidgetId={selectedWidgetId}
              onSelectWidget={setSelectedWidgetId}
              widgetsOverride={visibleWidgets}
            />
          </div>
        </section>
        <AiPanel
          open={aiPanel.open}
          minimized={aiPanel.minimized}
          widgetId={selectedWidgetId}
          dashId={currentDashboardId}
          onClose={closeAi}
          onMinToggle={toggleAiMin}
        />
      </div>

      {/* AI fab */}
      {!aiPanel.open && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={openAi}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-md hover:bg-primary/90 sm:bottom-5 sm:right-5"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">AI Assistant</span>
        </motion.button>
      )}

      <WidgetConfigDialog open={addWidgetOpen} onOpenChange={setAddWidgetOpen} />
      <MagicPasteModal isOpen={magicOpen} onClose={() => setMagicOpen(false)} />
      <DashboardBriefDialog open={briefOpen} onOpenChange={setBriefOpen} />
      {currentDash && (
        <ExportConfigModal
          open={exportConfigOpen}
          onOpenChange={setExportConfigOpen}
          dashboardId={currentDash.id}
          initialConfig={currentAIExportConfig}
          exporting={exporting}
          generateZip={handleGenerateZip}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Builder workbench subcomponents
// ----------------------------------------------------------------------

interface BuilderHeaderProps {
  currentDash: any;
  widgetCount: number;
  endpointCount: number;
  exporting: boolean;
  unsaved: boolean;
  ops: { scanning: boolean; autoAdding: boolean; refreshing: boolean };
  scanSummary: DashboardEndpointProbeSummary | null;
  onAddWidget: () => void;
  onOpenAssistant: () => void;
  onOpenBrief: () => void;
  onMagicOpen: () => void;
  onExport: () => void;
  onScanApis: () => void;
  onRefreshAll: () => void;
  onAutoAdd: () => void;
}

function BuilderHeader({
  currentDash,
  widgetCount,
  endpointCount,
  exporting,
  unsaved,
  ops,
  scanSummary,
  onAddWidget,
  onOpenAssistant,
  onOpenBrief,
  onMagicOpen,
  onExport,
  onScanApis,
  onRefreshAll,
  onAutoAdd,
}: BuilderHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="max-w-[16rem] truncate text-lg font-semibold tracking-tight sm:max-w-none">
            {currentDash?.name ?? "Builder"}
          </h1>
          {unsaved && (
            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <Circle className="h-2 w-2 fill-current" />
              Unsaved
            </div>
          )}
        </div>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {widgetCount} widgets · {endpointCount} sources
          {scanSummary ? ` · ${scanSummary.healthy} ready` : ""}
          {scanSummary?.unauthorized ? ` · ${scanSummary.unauthorized} need authorization` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:flex-shrink-0">
        <Link href="/dashboard" className="hidden sm:block">
          <Button variant="outline" size="sm">
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            Preview
          </Button>
        </Link>
        <Button variant="outline" size="sm" onClick={onOpenAssistant}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          Assistant
        </Button>
        <Button variant="outline" size="sm" onClick={onOpenBrief} disabled={endpointCount === 0}>
          <ListChecks className="mr-1.5 h-3.5 w-3.5" />
          Build from brief
        </Button>
        <Button size="sm" onClick={onAddWidget} disabled={endpointCount === 0}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add widget
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9" aria-label="More builder actions">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onScanApis} disabled={ops.scanning || endpointCount === 0}>
              {ops.scanning ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Radar className="w-3.5 h-3.5 mr-2" />}
              {ops.scanning ? "Scanning..." : "Scan data sources"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRefreshAll} disabled={ops.refreshing || endpointCount === 0}>
              {ops.refreshing ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
              {ops.refreshing ? "Refreshing..." : "Refresh all charts"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAutoAdd} disabled={ops.autoAdding || !scanSummary || scanSummary.healthy === 0}>
              {ops.autoAdding ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-2" />}
              {ops.autoAdding ? "Adding..." : "Add recommended charts"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMagicOpen}>
              <Wand2 className="mr-2 h-3.5 w-3.5" />
              Build with AI
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExport} disabled={exporting || widgetCount === 0}>
              <Download className="mr-2 h-3.5 w-3.5" />
              {exporting ? "Exporting..." : "Export project"}
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/api-config" className="flex items-center">
                <Settings2 className="mr-2 h-3.5 w-3.5" />
                Data sources
              </Link>
            </DropdownMenuItem>
            <div className="sm:hidden">
              <DropdownMenuItem asChild>
                <Link href="/dashboard" className="flex items-center">
                  <Eye className="w-3.5 h-3.5 mr-2" />
                  Preview dashboard
                </Link>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function AiPanel({
  open,
  minimized,
  widgetId,
  dashId,
  onClose,
  onMinToggle,
}: {
  open: boolean;
  minimized: boolean;
  widgetId: string | null;
  dashId: string | null;
  onClose: () => void;
  onMinToggle: () => void;
}) {
  const [assistView, setAssistView] = useState<"chat" | "ideas">("chat");
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="ai"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-x-3 bottom-3 z-50 overflow-hidden rounded-lg border bg-card shadow-lg sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[460px] xl:sticky xl:inset-auto xl:top-20 xl:z-20 xl:w-full xl:self-start xl:shadow-none"
          style={{ height: minimized ? "auto" : "min(680px, 82vh)" }}
        >
          <Tabs defaultValue="assist" className="flex h-full flex-col">
            <div className="flex-shrink-0 border-b bg-background px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border bg-muted text-foreground">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-sm font-semibold truncate">Builder Assistant</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onMinToggle} aria-label={minimized ? "Expand inspector" : "Minimize inspector"}>
                    {minimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onClose} aria-label="Close inspector">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {!minimized && (
              <>
                <div className="border-b bg-muted/35 px-3 py-2">
                  <TabsList className="grid h-8 w-full grid-cols-3">
                    <TabsTrigger value="assist" className="h-7 gap-1.5 text-[11px]" onClick={() => setAssistView("chat")}>
                      <Bot className="h-3.5 w-3.5" /> Assistant
                    </TabsTrigger>
                    <TabsTrigger value="style" className="h-7 gap-1.5 text-[11px]">
                      <Palette className="h-3.5 w-3.5" /> Style
                    </TabsTrigger>
                    <TabsTrigger value="config" className="h-7 gap-1.5 text-[11px]">
                      <SlidersHorizontal className="h-3.5 w-3.5" /> Dashboard
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden">
                  <TabsContent value="assist" className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                    <div className="flex justify-end border-b bg-muted/15 px-3 py-2">
                      <Button type="button" variant="outline" size="sm" className="h-7 flex-shrink-0 text-[11px]" onClick={() => setAssistView((v) => (v === "chat" ? "ideas" : "chat"))}>
                        {assistView === "chat" ? "Chart Ideas" : "Back to Chat"}
                      </Button>
                    </div>
                    {assistView === "chat" ? (
                      <ConfigChatbot selectedWidgetId={widgetId} />
                    ) : (
                      <div className="h-full overflow-y-auto p-3">
                        <ChartSuggester />
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="style" className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                    <WidgetStylePanel selectedWidgetId={widgetId} />
                  </TabsContent>
                  <TabsContent value="config" className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                    {dashId ? (
                      <ProjectConfigPanel dashboardId={dashId} />
                    ) : (
                      <div className="flex h-full items-center justify-center p-6 text-center">
                        <div>
                          <SlidersHorizontal className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Select a dashboard first</p>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </div>
              </>
            )}
          </Tabs>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
