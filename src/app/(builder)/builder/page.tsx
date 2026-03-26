"use client";

// src/app/(builder)/builder/page.tsx
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Optimized: reduced state, fixed effect loops, responsive
// header, memoized computations, modular sub-components
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { ConfigChatbot } from "@/components/builder/ai-assistant/config-chatbot";
import { ChartSuggester } from "@/components/builder/ai-assistant/chart-suggester";
import { WidgetStylePanel } from "@/components/builder/style-panel/widget-style-panel";
import { ProjectConfigPanel } from "@/components/builder/project-config/project-config-panel";
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
  CHART_NAV_ALL,
  buildChartNavTree,
  filterWidgetsByNavSelection,
  normalizeChartNavSelection,
} from "@/lib/builder/chart-nav-model";
import type { EndpointProfile } from "@/types/training";

interface NavSelection {
  groupId: string;
  subgroupId: string;
}

const DEFAULT_NAV_SELECTION: NavSelection = {
  groupId: CHART_NAV_ALL,
  subgroupId: CHART_NAV_ALL,
};

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main Page
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function BuilderPage() {
  const router = useRouter();
  const {
    dashboards,
    currentDashboardId,
    setCurrentDashboard,
    endpoints: allEndpoints,
    widgets: allWidgets,
    addWidget,
    getGroupsByDashboard,
  } = useDashboardStore();

  // â”€â”€ Core UI state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const [magicOpen, setMagicOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);

  // â”€â”€ AI panel â€” single object â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [aiPanel, setAiPanel] = useState({ open: false, minimized: false });

  // â”€â”€ Async ops â€” single object â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [ops, setOps] = useState({
    scanning: false,
    autoAdding: false,
    refreshing: false,
  });

  const [navSelection, setNavSelection] =
    useState<NavSelection>(DEFAULT_NAV_SELECTION);

  // â”€â”€ Nav state â€” single object â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // â”€â”€ API health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [scanSummary, setScanSummary] =
    useState<DashboardEndpointProbeSummary | null>(null);
  const [sessionScope, setSessionScope] = useState(() =>
    getEndpointSessionScope(),
  );

  // â”€â”€ Unsaved tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hasMounted = useRef(false);
  const lastSavedCount = useRef(0);
  const [unsaved, setUnsaved] = useState(false);

  // â”€â”€ Derived data (all memoized) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const currentDash = useMemo(
    () => dashboards.find((d) => d.id === currentDashboardId),
    [dashboards, currentDashboardId],
  );

  const dashboardEndpoints = useMemo(
    () =>
      allEndpoints.filter(
        (ep) => (ep.dashboardId ?? currentDashboardId) === currentDashboardId,
      ),
    [allEndpoints, currentDashboardId],
  );

  const widgets = useMemo(
    () => allWidgets.filter((w) => w.dashboardId === currentDashboardId),
    [allWidgets, currentDashboardId],
  );

  const activeDashboardEndpoints = useMemo(
    () =>
      dashboardEndpoints.filter(
        (ep) => ep.status !== "inactive" && ep.url?.trim(),
      ),
    [dashboardEndpoints],
  );

  const collections = useMemo(
    () => (currentDashboardId ? getGroupsByDashboard(currentDashboardId) : []),
    [currentDashboardId, getGroupsByDashboard],
  );

  const navEndpointLookup = useMemo(
    () =>
      Object.fromEntries(
        dashboardEndpoints.map((ep) => [ep.id, { name: ep.name, url: ep.url }]),
      ),
    [dashboardEndpoints],
  );

  const useTaxonomyFallback = collections.length === 0;

  const sectionCount = useMemo(() => {
    const names = new Set<string>();
    for (const w of widgets) {
      const s = w.sectionName?.trim();
      if (s) names.add(s);
    }
    return names.size;
  }, [widgets]);

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

  const visibleWidgets = useMemo(
    () =>
      filterWidgetsByNavSelection(
        orderedWidgets,
        navSelection.groupId,
        navSelection.subgroupId,
        collections,
        {
          endpointLookup: navEndpointLookup,
          useTaxonomyFallback,
        },
      ),
    [
      orderedWidgets,
      navSelection.groupId,
      navSelection.subgroupId,
      collections,
      navEndpointLookup,
      useTaxonomyFallback,
    ],
  );

  const allWidgetsWithoutGroup = useMemo(
    () =>
      orderedWidgets.length > 0 &&
      orderedWidgets.every(
        (widget) => !widget.groupId || widget.groupId.trim().length === 0,
      ),
    [orderedWidgets],
  );

  // â”€â”€ Prefetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useDashboardEndpointPrefetch(activeDashboardEndpoints);

  // â”€â”€ Effects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Auto-select first dashboard
  useEffect(() => {
    if (!currentDashboardId && dashboards.length > 0) {
      setCurrentDashboard(dashboards[0].id);
    }
  }, [currentDashboardId, dashboards, setCurrentDashboard]);

  // Reset state when dashboard changes
  useEffect(() => {
    setNavSelection(DEFAULT_NAV_SELECTION);
    setSelectedWidgetId(null);
  }, [currentDashboardId]);

  // Session scope listener
  useEffect(() => {
    const handler = () => setSessionScope(getEndpointSessionScope());
    window.addEventListener("builderDemoAuthSessionChanged", handler);
    return () =>
      window.removeEventListener("builderDemoAuthSessionChanged", handler);
  }, []);

  const prevNormKey = useRef("");
  useEffect(() => {
    const normalized = normalizeChartNavSelection(navTree, navSelection);
    const key = `${normalized.groupId}|${normalized.subgroupId}`;
    if (
      key !== prevNormKey.current &&
      (normalized.groupId !== navSelection.groupId ||
        normalized.subgroupId !== navSelection.subgroupId)
    ) {
      prevNormKey.current = key;
      setNavSelection(normalized);
    }
  }, [navTree, navSelection]);

  useEffect(() => {
    if (
      selectedWidgetId &&
      !visibleWidgets.some((widget) => widget.id === selectedWidgetId)
    ) {
      setSelectedWidgetId(null);
    }
  }, [selectedWidgetId, visibleWidgets]);

  // Unsaved tracking
  useEffect(() => {
    if (!hasMounted.current) {
      lastSavedCount.current = widgets.length;
      hasMounted.current = true;
      return;
    }
    if (widgets.length !== lastSavedCount.current) setUnsaved(true);
  }, [widgets.length]);

  // â”€â”€ API Scan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const runApiScan = useCallback(
    async (opts: { force?: boolean; silent?: boolean } = {}) => {
      if (activeDashboardEndpoints.length === 0) {
        setScanSummary(null);
        if (!opts.silent) toast.info("No active APIs available for scan.");
        return null;
      }
      setOps((p) => ({ ...p, scanning: true }));
      if (!opts.silent)
        toast.loading("Scanning API health...", { id: "api-scan" });
      try {
        const summary = await probeDashboardEndpoints(
          activeDashboardEndpoints,
          { force: opts.force, sessionScope },
        );
        setScanSummary(summary);
        if (!opts.silent)
          toast.success(
            `Scan: ${summary.healthy} healthy, ${summary.unauthorized} auth, ${summary.failed} failed.`,
            { id: "api-scan" },
          );
        return summary;
      } catch (e) {
        if (!opts.silent)
          toast.error(`Scan failed: ${e instanceof Error ? e.message : e}`, {
            id: "api-scan",
          });
        return null;
      } finally {
        setOps((p) => ({ ...p, scanning: false }));
      }
    },
    [activeDashboardEndpoints, sessionScope],
  );

  // Initial scan + broadcast
  useEffect(() => {
    void runApiScan({ silent: true });
  }, [runApiScan]);
  useEffect(() => {
    dispatchBuilderApiHealthSummary(scanSummary);
  }, [scanSummary]);

  // Sidebar rescan
  useEffect(() => {
    const handler = () => void runApiScan({ force: true });
    window.addEventListener(BUILDER_API_HEALTH_RESCAN_EVENT, handler);
    return () => {
      window.removeEventListener(BUILDER_API_HEALTH_RESCAN_EVENT, handler);
      dispatchBuilderApiHealthSummary(null);
    };
  }, [runApiScan]);

  // â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleScanApis = useCallback(
    () => void runApiScan({ force: true }),
    [runApiScan],
  );

  const handleRefreshAll = useCallback(async () => {
    setOps((p) => ({ ...p, refreshing: true }));
    toast.loading("Refreshing...", { id: "refresh" });
    try {
      clearEndpointResponseCache();
      clearEndpointFailureCache();
      clearEndpointProbeCache();
      if (activeDashboardEndpoints.length > 0) {
        await prefetchDashboardEndpoints(activeDashboardEndpoints, {
          sessionScope,
        });
        await runApiScan({ silent: true });
      }
      dispatchDashboardWidgetRefresh({ scope: "all", force: false });
      toast.success("All widgets refreshed", { id: "refresh" });
    } catch (e) {
      toast.error(`Refresh failed: ${e instanceof Error ? e.message : e}`, {
        id: "refresh",
      });
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
      const healthyIds = new Set(
        summary.results
          .filter((r) => r.status === "healthy" && r.endpointId)
          .map((r) => r.endpointId as string),
      );
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

      const { drafts, skippedExisting, skippedFetch, skippedNoData, skippedReview } =
        await buildAutoWidgetsFromEndpoints({
          endpoints: activeDashboardEndpoints,
          widgets,
          sessionScope,
          healthyEndpointIds: healthyIds,
          trainedProfilesByEndpointId,
        });
      if (drafts.length === 0) {
        toast.info(
          `No new widgets. Skip: ${skippedExisting} existing, ${skippedReview} review, ${skippedNoData} no-data, ${skippedFetch} failed.`,
          { id: "auto-add" },
        );
        return;
      }
      for (const d of drafts)
        addWidget({
          title: d.title,
          type: d.type,
          endpointId: d.endpointId,
          dataMapping: { xAxis: d.xAxis, yAxis: d.yAxis, yAxes: d.yAxes },
          position: d.position,
        });
      toast.success(`Added ${drafts.length} widgets.`, { id: "auto-add" });
    } finally {
      setOps((p) => ({ ...p, autoAdding: false }));
    }
  }, [
    currentDashboardId,
    activeDashboardEndpoints,
    scanSummary,
    runApiScan,
    widgets,
    sessionScope,
    addWidget,
  ]);

  const handleCanvasClick = useCallback(() => setSelectedWidgetId(null), []);

  const handleExport = useCallback(async () => {
    if (!currentDash) {
      toast.error("No active dashboard");
      return;
    }
    if (!widgets.length) {
      toast.error("Add at least one widget first");
      return;
    }
    setExporting(true);
    toast.loading("Generating projectâ€¦", { id: "export" });
    try {
      const store = useDashboardStore.getState();
      const config = buildDashboardConfig(
        currentDash,
        allEndpoints,
        allWidgets,
        store.getProjectConfig(currentDash.id),
        store.getGroupsByDashboard(currentDash.id),
      );
      const blob = await packageProjectAsZip(generateProjectFromConfig(config));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugifyDashboardName(currentDash.name)}-dashboard.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Export ready!", { id: "export" });
      lastSavedCount.current = widgets.length;
      setUnsaved(false);
    } catch (err) {
      toast.error(
        `Export failed: ${err instanceof Error ? err.message : err}`,
        { id: "export" },
      );
    } finally {
      setExporting(false);
    }
  }, [currentDash, widgets, allEndpoints, allWidgets]);

  const handleNavChange = useCallback((selection: NavSelection) => {
    setNavSelection(selection);
  }, []);

  const openAi = useCallback(
    () => setAiPanel({ open: true, minimized: false }),
    [],
  );
  const closeAi = useCallback(
    () => setAiPanel({ open: false, minimized: false }),
    [],
  );
  const toggleAiMin = useCallback(
    () => setAiPanel((p) => ({ ...p, minimized: !p.minimized })),
    [],
  );

  // â”€â”€ Empty states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (dashboards.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold mb-2">No Dashboard Yet</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Create one from Workspaces first.
          </p>
          <Button onClick={() => router.push("/workspaces")}>
            Go to Workspaces
          </Button>
        </div>
      </div>
    );
  }

  if (dashboardEndpoints.length === 0 && widgets.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <BuilderHeader
          currentDash={currentDash}
          widgetCount={0}
          endpointCount={0}
          collectionCount={0}
          sectionCount={0}
          exporting={false}
          unsaved={false}
          ops={{ scanning: false, autoAdding: false, refreshing: false }}
          scanSummary={null}
          onAddWidget={() => setAddWidgetOpen(true)}
          onMagicOpen={() => setMagicOpen(true)}
          onExport={handleExport}
          onScanApis={handleScanApis}
          onRefreshAll={handleRefreshAll}
          onAutoAdd={handleAutoAdd}
        />
        <div className="flex items-center justify-center min-h-[50vh] border-2 border-dashed border-muted-foreground/20 rounded-xl mt-4">
          <div className="text-center max-w-sm px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center mx-auto mb-4">
              <Database className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold mb-2">No APIs Connected</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Add APIs or let AI build your dashboard instantly.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => setMagicOpen(true)}
                className="bg-gradient-to-r from-purple-600 to-blue-600 text-white"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Magic Auto-Build
              </Button>
              <Link href="/api-config">
                <Button variant="outline" className="w-full">
                  <Settings2 className="w-4 h-4 mr-2" />
                  Configure APIs Manually
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <WidgetConfigDialog
          open={addWidgetOpen}
          onOpenChange={setAddWidgetOpen}
        />
        <MagicPasteModal
          isOpen={magicOpen}
          onClose={() => setMagicOpen(false)}
        />
      </div>
    );
  }

  // â”€â”€ Main layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b bg-card/80 backdrop-blur flex-shrink-0">
        <BuilderHeader
          currentDash={currentDash}
          widgetCount={widgets.length}
          endpointCount={dashboardEndpoints.length}
          collectionCount={collections.length}
          sectionCount={sectionCount}
          exporting={exporting}
          unsaved={unsaved}
          ops={ops}
          scanSummary={scanSummary}
          onAddWidget={() => setAddWidgetOpen(true)}
          onMagicOpen={() => setMagicOpen(true)}
          onExport={handleExport}
          onScanApis={handleScanApis}
          onRefreshAll={handleRefreshAll}
          onAutoAdd={handleAutoAdd}
        />
      </div>

      {/* Canvas */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-6"
        onClick={handleCanvasClick}
      >
        {orderedWidgets.length > 0 && (
          <div className="mb-4" onClick={(event) => event.stopPropagation()}>
            <FrozenChartNav
              tree={navTree}
              activeGroupId={navSelection.groupId}
              activeSubgroupId={navSelection.subgroupId}
              onSelectionChange={handleNavChange}
              showUngroupedHint={allWidgetsWithoutGroup}
            />
          </div>
        )}

        <DragDropCanvas
          selectedWidgetId={selectedWidgetId}
          onSelectWidget={setSelectedWidgetId}
          widgetsOverride={visibleWidgets}
        />
      </div>

      {/* AI panel */}
      <AiPanel
        open={aiPanel.open}
        minimized={aiPanel.minimized}
        widgetId={selectedWidgetId}
        dashId={currentDashboardId}
        onClose={closeAi}
        onMinToggle={toggleAiMin}
      />

      {/* AI fab */}
      {!aiPanel.open && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={openAi}
          className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-sm font-medium px-4 py-2.5 rounded-2xl shadow-lg transition-all active:scale-95"
        >
          <Sparkles className="w-4 h-4" />
          <span className="hidden sm:inline">AI Assistant</span>
        </motion.button>
      )}

      <WidgetConfigDialog
        open={addWidgetOpen}
        onOpenChange={setAddWidgetOpen}
      />
      <MagicPasteModal isOpen={magicOpen} onClose={() => setMagicOpen(false)} />
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BuilderHeader â€” responsive with overflow menu
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface BuilderHeaderProps {
  currentDash: { id: string; name: string; description?: string } | undefined;
  widgetCount: number;
  endpointCount: number;
  collectionCount: number;
  sectionCount: number;
  exporting: boolean;
  unsaved: boolean;
  ops: { scanning: boolean; autoAdding: boolean; refreshing: boolean };
  scanSummary: DashboardEndpointProbeSummary | null;
  onAddWidget: () => void;
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
  collectionCount,
  sectionCount,
  exporting,
  unsaved,
  ops,
  scanSummary,
  onAddWidget,
  onMagicOpen,
  onExport,
  onScanApis,
  onRefreshAll,
  onAutoAdd,
}: BuilderHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Left */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <h1 className="text-lg sm:text-xl font-bold truncate max-w-[200px] sm:max-w-none">
            {currentDash?.name ?? "Builder"}
          </h1>
          <Badge variant="secondary" className="text-[10px]">
            {widgetCount} widget{widgetCount !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {endpointCount} API{endpointCount !== 1 ? "s" : ""}
          </Badge>
          {collectionCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] hidden sm:inline-flex"
            >
              {collectionCount} grp{collectionCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {sectionCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] hidden md:inline-flex"
            >
              {sectionCount} sec{sectionCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {scanSummary && (
            <>
              <Badge
                variant="outline"
                className="text-[10px] border-emerald-300 text-emerald-700 hidden lg:inline-flex"
              >
                {scanSummary.healthy} ready
              </Badge>
              {scanSummary.unauthorized > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] border-amber-300 text-amber-700 hidden lg:inline-flex"
                >
                  {scanSummary.unauthorized} auth
                </Badge>
              )}
            </>
          )}
          {unsaved && (
            <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <Circle className="w-2 h-2 fill-amber-500 text-amber-500" />
              Unsaved
            </div>
          )}
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">
          {currentDash?.description || "Add widgets from your connected APIs"}
        </p>
      </div>

      {/* Right */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        <Link href="/api-config" className="hidden sm:block">
          <Button variant="outline" size="sm">
            <Settings2 className="w-3.5 h-3.5 mr-1.5" />
            APIs
          </Button>
        </Link>
        <Link href="/dashboard" className="hidden sm:block">
          <Button variant="outline" size="sm">
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            Preview
          </Button>
        </Link>

        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={exporting || widgetCount === 0}
        >
          <Download className="w-3.5 h-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">
            {exporting ? "Exportingâ€¦" : "Export"}
          </span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onMagicOpen}
          className="border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-900 dark:text-purple-400"
        >
          <Wand2 className="w-3.5 h-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">Magic</span>
        </Button>
        <Button size="sm" onClick={onAddWidget} disabled={endpointCount === 0}>
          <Plus className="w-3.5 h-3.5 sm:mr-1.5" />
          <span className="hidden sm:inline">Add Widget</span>
        </Button>

        {/* Overflow */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              onClick={onScanApis}
              disabled={ops.scanning || endpointCount === 0}
            >
              {ops.scanning ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : (
                <Radar className="w-3.5 h-3.5 mr-2" />
              )}
              {ops.scanning ? "Scanning..." : "Scan APIs"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onRefreshAll}
              disabled={ops.refreshing || endpointCount === 0}
            >
              {ops.refreshing ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-2" />
              )}
              {ops.refreshing ? "Refreshing..." : "Refresh All"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onAutoAdd}
              disabled={
                ops.autoAdding || !scanSummary || scanSummary.healthy === 0
              }
            >
              {ops.autoAdding ? (
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 mr-2" />
              )}
              {ops.autoAdding ? "Adding..." : "Auto Add Working"}
            </DropdownMenuItem>
            <div className="sm:hidden">
              <DropdownMenuItem asChild>
                <Link href="/api-config" className="flex items-center">
                  <Settings2 className="w-3.5 h-3.5 mr-2" />
                  API Config
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard" className="flex items-center">
                  <Eye className="w-3.5 h-3.5 mr-2" />
                  Preview
                </Link>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// AiPanel â€” extracted for isolation
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 overflow-hidden rounded-2xl border bg-card shadow-2xl w-[calc(100vw-1.5rem)] sm:w-[460px]"
          style={{ height: minimized ? "auto" : "min(680px, 82vh)" }}
        >
          <Tabs defaultValue="assist" className="flex h-full flex-col">
            <div className="flex-shrink-0 border-b bg-background/95 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue-600 text-white">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-sm font-semibold truncate">
                      Builder Assistant
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    Ask AI, style the selected chart, and configure dashboard
                    settings in one place.
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onMinToggle}
                    title={minimized ? "Expand panel" : "Minimize panel"}
                  >
                    {minimized ? (
                      <Maximize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Minimize2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={onClose}
                    title="Close assistant"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
            {!minimized && (
              <>
                <div className="border-b bg-muted/35 px-3 py-2">
                  <TabsList className="grid h-8 w-full grid-cols-3">
                    <TabsTrigger
                      value="assist"
                      className="h-7 gap-1.5 text-[11px]"
                      onClick={() => setAssistView("chat")}
                    >
                      <Bot className="h-3.5 w-3.5" />
                      Assistant
                    </TabsTrigger>
                    <TabsTrigger value="style" className="h-7 gap-1.5 text-[11px]">
                      <Palette className="h-3.5 w-3.5" />
                      Style
                    </TabsTrigger>
                    <TabsTrigger value="config" className="h-7 gap-1.5 text-[11px]">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Dashboard
                    </TabsTrigger>
                  </TabsList>
                </div>
                <div className="flex-1 min-h-0 overflow-hidden">
                  <TabsContent
                    value="assist"
                    className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
                  >
                    <div className="flex items-center justify-between gap-3 border-b bg-muted/15 px-3 py-2">
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        {assistView === "chat"
                          ? "Use natural language to build charts or update the selected chart style."
                          : "Analyze API data and add recommended charts in one click."}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 flex-shrink-0 text-[11px]"
                        onClick={() =>
                          setAssistView((v) => (v === "chat" ? "ideas" : "chat"))
                        }
                      >
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
                <TabsContent
                  value="style"
                  className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
                >
                    <WidgetStylePanel selectedWidgetId={widgetId} />
                  </TabsContent>
                  <TabsContent
                    value="config"
                    className="mt-0 h-full overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
                  >
                    {dashId ? (
                      <ProjectConfigPanel dashboardId={dashId} />
                    ) : (
                      <div className="flex h-full items-center justify-center p-6 text-center">
                        <div>
                          <SlidersHorizontal className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            Select a dashboard first
                          </p>
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
