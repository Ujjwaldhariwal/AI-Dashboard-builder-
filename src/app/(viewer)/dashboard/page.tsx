"use client";

// src/app/(viewer)/dashboard/page.tsx
// ─────────────────────────────────────────────────────────
// Fixed: responsive header, smooth nav, optimized renders
// ─────────────────────────────────────────────────────────

import { useState, useCallback, useEffect, useMemo } from "react";
import { useDashboardStore } from "@/store/builder-store";
import { WidgetCard } from "@/components/builder/canvas/widget-card";
import { FrozenChartNav } from "@/components/builder/nav/linear-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutGrid,
  RefreshCw,
  Share2,
  FolderKanban,
  Download,
  Printer,
  ArrowLeft,
  Clock,
  CheckCircle2,
  FileDown,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  buildDashboardConfig,
  slugifyDashboardName,
} from "@/lib/code-generator/config-builder";
import { generateProjectFromConfig } from "@/lib/code-generator/template-generator";
import { packageProjectAsZip } from "@/lib/code-generator/zip-packager";
import {
  encodeShareToken,
  buildShareUrl,
  type SharePayload,
} from "@/lib/share-utils";
import { motion } from "framer-motion";
import { clearEndpointResponseCache } from "@/lib/api/endpoint-response-cache";
import {
  clearEndpointFailureCache,
  clearEndpointProbeCache,
} from "@/lib/api/endpoint-runtime-cache";
import { useDashboardEndpointPrefetch } from "@/hooks/use-dashboard-endpoint-prefetch";
import { dispatchDashboardWidgetRefresh } from "@/lib/builder/widget-refresh-events";
import {
  CHART_NAV_ALL,
  buildChartNavTree,
  filterWidgetsByNavSelection,
  normalizeChartNavSelection,
} from "@/lib/builder/chart-nav-model";

export default function ViewerPage() {
  const {
    dashboards,
    currentDashboardId,
    endpoints,
    widgets: allWidgets,
    getProjectConfig,
    getGroupsByDashboard,
  } = useDashboardStore();

  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [shareCopied, setShareCopied] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState(CHART_NAV_ALL);
  const [activeSubgroupId, setActiveSubgroupId] = useState(CHART_NAV_ALL);

  const currentDash = useMemo(
    () => dashboards.find((d) => d.id === currentDashboardId),
    [dashboards, currentDashboardId],
  );
  const widgets = useMemo(
    () => allWidgets.filter((w) => w.dashboardId === currentDashboardId),
    [allWidgets, currentDashboardId],
  );
  const dashboardEndpoints = useMemo(
    () =>
      endpoints.filter(
        (ep) => (ep.dashboardId ?? currentDashboardId) === currentDashboardId,
      ),
    [endpoints, currentDashboardId],
  );
  const navEndpointLookup = useMemo(
    () =>
      Object.fromEntries(
        dashboardEndpoints.map((ep) => [ep.id, { name: ep.name, url: ep.url }]),
      ),
    [dashboardEndpoints],
  );
  const chartGroups = useMemo(
    () => (currentDashboardId ? getGroupsByDashboard(currentDashboardId) : []),
    [currentDashboardId, getGroupsByDashboard],
  );
  const navTree = useMemo(
    () =>
      buildChartNavTree(widgets, chartGroups, {
        endpointLookup: navEndpointLookup,
      }),
    [widgets, chartGroups, navEndpointLookup],
  );
  const visibleWidgets = useMemo(
    () =>
      filterWidgetsByNavSelection(
        widgets,
        activeGroupId,
        activeSubgroupId,
        chartGroups,
        { endpointLookup: navEndpointLookup },
      ),
    [widgets, activeGroupId, activeSubgroupId, chartGroups, navEndpointLookup],
  );
  const isNavFiltered =
    activeGroupId !== CHART_NAV_ALL || activeSubgroupId !== CHART_NAV_ALL;

  useDashboardEndpointPrefetch(dashboardEndpoints);

  // Reset nav on dashboard change
  useEffect(() => {
    setActiveGroupId(CHART_NAV_ALL);
    setActiveSubgroupId(CHART_NAV_ALL);
  }, [currentDashboardId]);

  // Normalize nav selection (loop-safe)
  const prevNormKey = useMemo(() => ({ current: "" }), []);
  useEffect(() => {
    const normalized = normalizeChartNavSelection(navTree, {
      groupId: activeGroupId,
      subgroupId: activeSubgroupId,
    });
    const key = `${normalized.groupId}|${normalized.subgroupId}`;
    if (
      key !== prevNormKey.current &&
      (normalized.groupId !== activeGroupId ||
        normalized.subgroupId !== activeSubgroupId)
    ) {
      prevNormKey.current = key;
      setActiveGroupId(normalized.groupId);
      setActiveSubgroupId(normalized.subgroupId);
    }
  }, [activeGroupId, activeSubgroupId, navTree, prevNormKey]);

  // ── Handlers ───────────────────────────────────────────

  const handleRefreshAll = useCallback(() => {
    setRefreshing(true);
    clearEndpointResponseCache();
    clearEndpointFailureCache();
    clearEndpointProbeCache();
    dispatchDashboardWidgetRefresh({ scope: "all", force: false });
    setLastRefreshed(new Date());
    toast.success("All widgets refreshed");
    setTimeout(() => setRefreshing(false), 400);
  }, []);

  const handleShare = useCallback(() => {
    if (!currentDash) return;
    const endpointConfigs = new Map<
      string,
      SharePayload["endpoints"][number]
    >();
    const sharedWidgets: SharePayload["widgets"] = widgets.map((w) => {
      const ep = endpoints.find((e) => e.id === w.endpointId);
      if (ep && !endpointConfigs.has(ep.id)) {
        endpointConfigs.set(ep.id, {
          id: ep.id,
          url: ep.url,
          method: ep.method,
          headers:
            ep.headers && Object.keys(ep.headers).length > 0
              ? ep.headers
              : undefined,
          body: ep.body === undefined ? undefined : ep.body,
        });
      }

      return {
        id: w.id,
        title: w.title,
        type: w.type,
        endpointId: ep?.id ?? w.endpointId,
        xAxis: w.dataMapping.xAxis,
        yAxis: w.dataMapping.yAxis ?? "",
      };
    });

    const payload: SharePayload = {
      dashboardId: currentDash.id,
      dashboardName: currentDash.name,
      exportedAt: new Date().toISOString(),
      endpoints: Array.from(endpointConfigs.values()),
      widgets: sharedWidgets,
    };
    navigator.clipboard.writeText(buildShareUrl(encodeShareToken(payload)));
    setShareCopied(true);
    toast.success("Share link copied!", {
      description: "Anyone with this link can view read-only",
    });
    setTimeout(() => setShareCopied(false), 3000);
  }, [currentDash, widgets, endpoints]);

  const handleExport = useCallback(async () => {
    if (!currentDash || widgets.length === 0) {
      toast.error("No widgets to export");
      return;
    }
    setExporting(true);
    toast.loading("Generating project...", { id: "export" });
    try {
      const config = buildDashboardConfig(
        currentDash,
        endpoints,
        allWidgets,
        getProjectConfig(currentDash.id),
        getGroupsByDashboard(currentDash.id),
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
    } catch (err) {
      toast.error(
        `Export failed: ${err instanceof Error ? err.message : err}`,
        { id: "export" },
      );
    } finally {
      setExporting(false);
    }
  }, [
    currentDash,
    widgets,
    endpoints,
    allWidgets,
    getProjectConfig,
    getGroupsByDashboard,
  ]);

  const handlePdfExport = useCallback(() => {
    window.open(`/pdf-export?dashboardId=${currentDashboardId}`, "_blank");
  }, [currentDashboardId]);

  const handleNavChange = useCallback(
    ({ groupId, subgroupId }: { groupId: string; subgroupId: string }) => {
      setActiveGroupId(groupId);
      setActiveSubgroupId(subgroupId);
    },
    [],
  );

  // ── No dashboard ───────────────────────────────────────

  if (!currentDash) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-8">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <FolderKanban className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              No Dashboard Selected
            </h2>
            <p className="text-muted-foreground mb-4 text-sm">
              Please select a dashboard from the builder
            </p>
            <Link href="/workspaces">
              <Button>Go to Dashboards</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main ───────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background print:bg-white">
      {/* ── Sticky header — responsive ─────────────────── */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          {/* Left */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/builder">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shrink-0 hidden sm:flex">
              <LayoutGrid className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold truncate">{currentDash.name}</h1>
              <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
                {currentDash.description || "Live Dashboard Preview"}
              </p>
            </div>
            <Badge
              variant="secondary"
              className="text-[10px] shrink-0 hidden sm:inline-flex"
            >
              {visibleWidgets.length}/{widgets.length}
            </Badge>
          </div>

          {/* Right — responsive */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Time — desktop */}
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground mr-1">
              <Clock className="w-3 h-3" />
              {lastRefreshed.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>

            {/* Primary: Refresh + Edit */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshAll}
              disabled={refreshing}
              className="hidden sm:flex"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`}
              />
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>

            <Link href="/builder" className="hidden sm:block">
              <Button size="sm">Edit</Button>
            </Link>

            {/* Overflow menu — all secondary actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {/* Mobile-only */}
                <div className="sm:hidden">
                  <DropdownMenuItem
                    onClick={handleRefreshAll}
                    disabled={refreshing}
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                    Refresh All
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/builder" className="flex items-center">
                      <ArrowLeft className="w-3.5 h-3.5 mr-2" />
                      Edit Dashboard
                    </Link>
                  </DropdownMenuItem>
                </div>
                <DropdownMenuItem onClick={() => window.print()}>
                  <Printer className="w-3.5 h-3.5 mr-2" />
                  Print
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePdfExport}>
                  <FileDown className="w-3.5 h-3.5 mr-2" />
                  Export PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleShare}>
                  {shareCopied ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-2 text-green-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5 mr-2" />
                      Share Link
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleExport}
                  disabled={exporting || widgets.length === 0}
                >
                  <Download className="w-3.5 h-3.5 mr-2" />
                  {exporting ? "Exporting..." : "Export Code"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Chart Nav Bar ──────────────────────────────── */}
      {widgets.length > 0 && (
        <div className="border-b bg-card/60 print:hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">
            <FrozenChartNav
              tree={navTree}
              activeGroupId={activeGroupId}
              activeSubgroupId={activeSubgroupId}
              onSelectionChange={handleNavChange}
            />
            {isNavFiltered && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Showing {visibleWidgets.length} of {widgets.length} charts
              </p>
            )}
          </div>
        </div>
      )}

      {/* Print-only header */}
      <div className="hidden print:block px-8 py-6 border-b">
        <h1 className="text-2xl font-bold">{currentDash.name}</h1>
        {currentDash.description && (
          <p className="text-gray-500 text-sm mt-1">
            {currentDash.description}
          </p>
        )}
        <p className="text-xs text-gray-400 mt-2">
          Exported on {new Date().toLocaleString()}
        </p>
      </div>

      {/* ── Widget grid ────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {visibleWidgets.length > 0 ? (
          <div className="grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-2 print:grid-cols-2">
            {visibleWidgets.map((widget) => (
              <motion.div
                key={widget.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
              >
                <WidgetCard widget={widget} viewMode />
              </motion.div>
            ))}
          </div>
        ) : isNavFiltered ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center px-4">
            <LayoutGrid className="w-10 h-10 text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold mb-1">
              No charts in this selection
            </h2>
            <p className="text-muted-foreground text-sm mb-4">
              Pick another category to view charts.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setActiveGroupId(CHART_NAV_ALL);
                setActiveSubgroupId(CHART_NAV_ALL);
              }}
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center mx-auto mb-4">
              <LayoutGrid className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-lg font-semibold mb-1">No widgets yet</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Add widgets in the builder to see them here
            </p>
            <Link href="/builder">
              <Button>Open Builder</Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
