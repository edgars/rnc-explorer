import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  FolderTree,
  History as HistoryIcon,
  Loader2,
  Lock,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  ShieldAlert,
  UploadCloud,
} from "lucide-react";
import { ArchitectureFlowView } from "@/components/ArchitectureFlowView";
import { DocumentationSuite } from "@/components/DocumentationSuite";
import { FileExplorer } from "@/components/FileExplorer";
import { FileInspectorSheet } from "@/components/FileInspectorSheet";
import { LlmConfigurationForm } from "@/components/LlmConfigurationForm";
import { MetricsDashboard } from "@/components/MetricsDashboard";
import {
  ARCHITECTURE_ANALYSIS_STEPS,
  ProcessingProgressModal,
  ZIP_PARSE_STEPS,
  type LongTaskProgressApi,
  type ProcessingProgressState,
} from "@/components/ProcessingProgressModal";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import type { ArchitectureAnalysis, MacroLayerId, ParsedProjectSnapshot } from "@/lib/architecture";
import { resolveMicroNodeToPath } from "@/lib/fileResolve";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { LlmConfig } from "@/lib/llm";
import { runArchitectureAnalysis } from "@/lib/llm";
import { logger } from "@/lib/logger";
import { coerceLlmConfig, defaultLlmConfig, getActiveApiContext, isActiveProviderReady } from "@/lib/llmConfig";
import {
  appendHistory,
  deleteHistoryEntry,
  loadHistory,
  loadLlmConfig,
  readTenantId,
  replaceHistoryEntry,
  saveLlmConfig,
  writeTenantId,
  type HistoryEntry,
} from "@/lib/storage";
import { parseProjectZip } from "@/lib/zipParser";
import { cn } from "@/lib/utils";

const LEFT_PANEL_STORAGE_KEY = "archlens:v1:left-sidebar-width-px";
const LEFT_PANEL_DEFAULT = 288;
const LEFT_PANEL_MIN = 200;
const LEFT_PANEL_MAX = 560;
/** Espaço mínimo reservado para a área central ao redimensionar o painel esquerdo. */
const MAIN_MIN_WIDTH_RESIZE = 260;

function clampLeftPanelWidth(px: number): number {
  if (typeof window === "undefined") {
    return Math.min(LEFT_PANEL_MAX, Math.max(LEFT_PANEL_MIN, px));
  }
  const maxByViewport = Math.max(LEFT_PANEL_MIN, window.innerWidth - 48 - MAIN_MIN_WIDTH_RESIZE);
  return Math.min(LEFT_PANEL_MAX, maxByViewport, Math.max(LEFT_PANEL_MIN, px));
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const { t } = useLocale();

  const [llmOpen, setLlmOpen] = useState(false);
  const [llmDraft, setLlmDraft] = useState<LlmConfig>(() => loadLlmConfig() ?? defaultLlmConfig());

  const [storedLlm, setStoredLlm] = useState<LlmConfig | null>(() => loadLlmConfig());
  const [tenantInput, setTenantInput] = useState(() => readTenantId());

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [snapshot, setSnapshot] = useState<ParsedProjectSnapshot | null>(null);
  const [analysis, setAnalysis] = useState<ArchitectureAnalysis | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [drillLayer, setDrillLayer] = useState<MacroLayerId | null>(null);
  const [processing, setProcessing] = useState<ProcessingProgressState | null>(null);
  const progressFinishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [inspectOpen, setInspectOpen] = useState(false);
  const [inspectPath, setInspectPath] = useState<string | null>(null);
  const [mainTab, setMainTab] = useState<"graph" | "documentation" | "metrics">("graph");

  const [leftExpanded, setLeftExpanded] = useState(true);
  const [leftPanelWidth, setLeftPanelWidth] = useState(LEFT_PANEL_DEFAULT);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const leftResizeStart = useRef({ x: 0, w: LEFT_PANEL_DEFAULT });
  const [rightOpen, setRightOpen] = useState(false);
  const [sidebarAccordionValue, setSidebarAccordionValue] = useState<string[]>([]);
  const filesSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.title = t("app.title");
  }, [t]);

  useEffect(() => {
    if (!leftExpanded || !sidebarAccordionValue.includes("files") || !filesSectionRef.current) return;
    const id = window.requestAnimationFrame(() => {
      filesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [sidebarAccordionValue, leftExpanded]);

  useEffect(() => {
    if (!analysis) {
      setRightOpen(false);
      setMainTab("graph");
      setDrillLayer(null);
    }
  }, [analysis]);

  const reloadFromStorage = useCallback(() => {
    const cfg = loadLlmConfig();
    setStoredLlm(cfg);
    setLlmDraft(cfg ?? defaultLlmConfig());
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    reloadFromStorage();
    setTenantInput(readTenantId());
  }, [reloadFromStorage]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LEFT_PANEL_STORAGE_KEY);
      if (!raw) return;
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) setLeftPanelWidth(clampLeftPanelWidth(n));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isResizingLeft) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - leftResizeStart.current.x;
      setLeftPanelWidth(clampLeftPanelWidth(leftResizeStart.current.w + dx));
    };
    const onUp = () => {
      setIsResizingLeft(false);
      setLeftPanelWidth((w) => {
        const next = clampLeftPanelWidth(w);
        try {
          localStorage.setItem(LEFT_PANEL_STORAGE_KEY, String(Math.round(next)));
        } catch {
          /* ignore */
        }
        return next;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isResizingLeft]);

  useEffect(() => {
    const onResize = () => setLeftPanelWidth((w) => clampLeftPanelWidth(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(
    () => () => {
      if (progressFinishTimer.current) {
        clearTimeout(progressFinishTimer.current);
        progressFinishTimer.current = null;
      }
    },
    [],
  );

  const progressApi = useMemo<LongTaskProgressApi>(
    () => ({
      start: ({ taskKind, title, description, steps }) => {
        if (progressFinishTimer.current) {
          clearTimeout(progressFinishTimer.current);
          progressFinishTimer.current = null;
        }
        setProcessing({ taskKind, title, description, steps, activeStepIndex: 0, finished: false });
      },
      atStep: (index) => {
        setProcessing((prev) => (prev ? { ...prev, activeStepIndex: index, finished: false } : null));
      },
      succeed: () => {
        setProcessing((prev) => (prev ? { ...prev, finished: true } : null));
        progressFinishTimer.current = setTimeout(() => {
          progressFinishTimer.current = null;
          setProcessing(null);
        }, 280);
      },
      fail: () => {
        if (progressFinishTimer.current) {
          clearTimeout(progressFinishTimer.current);
          progressFinishTimer.current = null;
        }
        setProcessing(null);
      },
    }),
    [],
  );

  const effectiveLlm = coerceLlmConfig(storedLlm ?? llmDraft);
  const activeLlmContext = getActiveApiContext(effectiveLlm);

  const persistLlm = useCallback(() => {
    const next = coerceLlmConfig(llmDraft);
    saveLlmConfig(next);
    setStoredLlm(next);
    setLlmDraft(next);
    toast({ title: t("toast.savedLlmTitle"), description: t("toast.savedLlmDesc") });
    setLlmOpen(false);
  }, [llmDraft, t]);

  const applyTenant = useCallback(() => {
    writeTenantId(tenantInput);
    reloadFromStorage();
    toast({
      title: t("toast.tenantSwitchTitle"),
      description: t("toast.tenantSwitchDesc", { tenant: readTenantId() }),
    });
  }, [tenantInput, reloadFromStorage, t]);

  const openInspector = useCallback((path: string) => {
    setInspectPath(path);
    setInspectOpen(true);
  }, []);

  const handleZipFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!file.name.toLowerCase().endsWith(".zip")) {
        toast({ variant: "destructive", title: t("toast.zipInvalidTitle"), description: t("toast.zipInvalidDesc") });
        return;
      }
      progressApi.start({
        taskKind: "zip",
        title: t("progress.task.zip.title"),
        description: file.name,
        steps: ZIP_PARSE_STEPS,
      });
      try {
        const parsed = await parseProjectZip(file, (i) => progressApi.atStep(i));
        setSnapshot(parsed);
        setAnalysis(null);
        setDrillLayer(null);
        setActiveRunId(null);
        setSidebarAccordionValue(["files"]);
        progressApi.succeed();
        toast({
          title: t("toast.zipParsedTitle"),
          description: t("app.zipIndexed", { included: String(parsed.includedFiles), total: String(parsed.totalFiles) }),
        });
      } catch (e) {
        progressApi.fail();
        const msg = e instanceof Error ? e.message : t("errors.unknown");
        logger.error("ZIP import failed", { file: file.name, error: e });
        toast({ variant: "destructive", title: t("toast.zipFailTitle"), description: msg });
      }
    },
    [progressApi, t],
  );

  const analyze = useCallback(async () => {
    if (!snapshot) {
      toast({ variant: "destructive", title: t("toast.noSnapshotTitle"), description: t("toast.noSnapshotDesc") });
      return;
    }
    const cfg = coerceLlmConfig(storedLlm ?? llmDraft);
    if (!isActiveProviderReady(cfg)) {
      toast({
        variant: "destructive",
        title: t("toast.llmNotConfiguredTitle"),
        description: t("toast.llmNotConfiguredDesc"),
      });
      setLlmOpen(true);
      return;
    }
    progressApi.start({
      taskKind: "analysis",
      title: t("progress.task.analysis.title"),
      description: `${activeLlmContext.provider} · ${activeLlmContext.model}`,
      steps: ARCHITECTURE_ANALYSIS_STEPS,
    });
    const controller = new AbortController();
    try {
      const result = await runArchitectureAnalysis(snapshot, cfg, controller.signal, (i) => progressApi.atStep(i));
      setAnalysis(result);
      setDrillLayer(null);
      const entry: HistoryEntry = {
        id: newId(),
        createdAt: new Date().toISOString(),
        zipName: snapshot.zipName,
        snapshot,
        analysis: result,
      };
      setActiveRunId(entry.id);
      const r = appendHistory(entry);
      setHistory(r.entries);
      if (!r.persisted) {
        toast({
          variant: "destructive",
          title: t("toast.historySaveFailTitle"),
          description: t("toast.historySaveFailDesc"),
        });
      }
      progressApi.succeed();
      toast({
        title: t("toast.analysisDoneTitle"),
        description: result.summary.slice(0, 140) + (result.summary.length > 140 ? "…" : ""),
      });
    } catch (e) {
      progressApi.fail();
      const msg = e instanceof Error ? e.message : t("errors.unknown");
      logger.error("Architecture analysis failed", { provider: activeLlmContext.provider, model: activeLlmContext.model, error: e });
      toast({ variant: "destructive", title: t("toast.analysisFailTitle"), description: msg });
    }
  }, [snapshot, storedLlm, llmDraft, progressApi, activeLlmContext.provider, activeLlmContext.model, t]);

  const loadHistoryEntry = useCallback(
    (entry: HistoryEntry) => {
      setSnapshot(entry.snapshot);
      setAnalysis(entry.analysis);
      setDrillLayer(null);
      setActiveRunId(entry.id);
      setSidebarAccordionValue(["files"]);
      toast({ title: t("toast.loadedTitle"), description: entry.zipName });
    },
    [t],
  );

  const removeHistoryEntry = useCallback(
    (id: string) => {
      const r = deleteHistoryEntry(id);
      setHistory(r.entries);
      if (!r.persisted) {
        toast({
          variant: "destructive",
          title: t("toast.historySaveFailTitle"),
          description: t("toast.historySaveFailDesc"),
        });
        return;
      }
      if (activeRunId === id) setActiveRunId(null);
      toast({ title: t("toast.removedHistoryTitle"), description: t("toast.removedHistoryDesc") });
    },
    [activeRunId, t],
  );

  const onDocumentationUpdated = useCallback(
    (next: ArchitectureAnalysis) => {
      setAnalysis(next);
      if (activeRunId) {
        const r = replaceHistoryEntry(activeRunId, (prev) => ({ ...prev, analysis: next }));
        if (r) {
          setHistory(r.entries);
          if (!r.persisted) {
            toast({
              variant: "destructive",
              title: t("toast.historySaveFailTitle"),
              description: t("toast.historySaveFailDesc"),
            });
          }
        } else {
          setHistory(loadHistory());
        }
      }
    },
    [activeRunId, t],
  );

  const onMicroInspect = useCallback(
    (info: { microId: string; layerId: MacroLayerId; sourcePath?: string }) => {
      if (!snapshot || !analysis) return;
      const hit = analysis.graph.micro[info.layerId].find((n) => n.id === info.microId);
      const resolved = hit ? resolveMicroNodeToPath(hit, analysis, snapshot) : null;
      const path = resolved ?? info.sourcePath ?? null;
      if (path) {
        openInspector(path);
        return;
      }
      toast({ variant: "destructive", title: t("toast.mapNodeTitle"), description: t("toast.mapNodeDesc") });
    },
    [analysis, snapshot, openInspector, t],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      void handleZipFile(file);
    },
    [handleZipFile],
  );

  const onLeftResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      leftResizeStart.current = { x: e.clientX, w: leftPanelWidth };
      setIsResizingLeft(true);
    },
    [leftPanelWidth],
  );

  const leftRail = (
    <motion.div
      initial={false}
      className="flex w-12 shrink-0 flex-col items-center gap-1.5 border-r border-border bg-muted/25 py-2"
    >
      <motion.span whileTap={{ scale: 0.92 }} transition={{ type: "spring", stiffness: 520, damping: 28 }} className="inline-flex">
        <Button
          type="button"
          size="icon"
          variant="default"
          className="h-9 w-9 shrink-0 shadow-sm"
          title={t("app.railZipCta")}
          onClick={() => {
            setLeftExpanded(true);
            window.requestAnimationFrame(() => fileInputRef.current?.click());
          }}
        >
          <UploadCloud className="h-4 w-4" />
        </Button>
      </motion.span>
      <motion.span whileTap={{ scale: 0.92 }} transition={{ type: "spring", stiffness: 520, damping: 28 }} className="inline-flex">
        <Button
          type="button"
          size="icon"
          variant={leftExpanded && sidebarAccordionValue.includes("files") ? "secondary" : "ghost"}
          className="h-9 w-9 shrink-0"
          title={t("app.sectionFiles")}
          disabled={!snapshot}
          onClick={() => {
            setLeftExpanded(true);
            setSidebarAccordionValue(["files"]);
          }}
        >
          <FolderTree className="h-4 w-4" />
        </Button>
      </motion.span>
      <motion.span whileTap={{ scale: 0.92 }} transition={{ type: "spring", stiffness: 520, damping: 28 }} className="inline-flex">
        <Button
          type="button"
          size="icon"
          variant={leftExpanded && sidebarAccordionValue.includes("history") ? "secondary" : "ghost"}
          className="h-9 w-9 shrink-0"
          title={t("app.sectionHistory")}
          onClick={() => {
            setLeftExpanded(true);
            setSidebarAccordionValue(["history"]);
          }}
        >
          <HistoryIcon className="h-4 w-4" />
        </Button>
      </motion.span>
    </motion.div>
  );

  const workspacePanel = (
    <aside
      style={{
        width: leftExpanded ? leftPanelWidth : 0,
        opacity: leftExpanded ? 1 : 0,
        boxSizing: "border-box",
        transition: isResizingLeft ? "none" : "width 0.22s ease-out, opacity 0.2s ease-out, border-color 0.2s ease-out",
      }}
      className={cn(
        "flex h-full min-h-0 max-w-full shrink flex-col overflow-hidden border-r bg-card/30",
        leftExpanded ? "min-w-0 border-border" : "pointer-events-none min-w-0 border-transparent",
      )}
    >
      <div className="flex h-11 min-w-0 shrink-0 items-center gap-2 border-b border-border px-2">
        <span className="min-w-0 flex-1 truncate pl-1 text-xs font-semibold tracking-wide text-muted-foreground">
          {t("app.sidebarWorkspace")}
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          title={t("app.sidebarCollapse")}
          onClick={() => setLeftExpanded(false)}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="box-border flex w-full min-w-0 max-w-full flex-col gap-3 p-3 pb-6">
          {!snapshot ? (
            <>
              <div className="min-w-0 max-w-full">
                <h2 className="text-sm font-semibold text-foreground">{t("app.welcomeTitle")}</h2>
                <ol className="mt-2 space-y-2 text-[11px] leading-snug text-muted-foreground">
                  <li className="flex min-w-0 gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                      1
                    </span>
                    <span className="min-w-0 break-words">
                      <span className="font-medium text-foreground">{t("app.step1Title")}</span> — {t("app.step1Desc")}
                    </span>
                  </li>
                  <li className="flex min-w-0 gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                      2
                    </span>
                    <span className="min-w-0 break-words">
                      <span className="font-medium text-foreground">{t("app.step2Title")}</span> — {t("app.step2Desc")}
                    </span>
                  </li>
                </ol>
                <p className="mt-2 break-words text-[10px] text-muted-foreground/90">{t("app.helperConfigureLlm")}</p>
              </div>

              <div
                className={cn(
                  "min-w-0 max-w-full rounded-lg border border-dashed p-3 text-center transition-colors sm:p-4",
                  dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/15",
                )}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <div className="flex flex-col items-center gap-2">
                  {processing?.taskKind === "zip" ? (
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  ) : (
                    <UploadCloud className="h-6 w-6 text-primary/90" />
                  )}
                  <div className="max-w-full break-words text-xs text-muted-foreground">
                    {t("app.dropZip")} <span className="font-medium text-foreground">{t("app.zipFile")}</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="w-full max-w-full min-w-0 shrink-0 px-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t("app.browse")}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="box-border w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-muted/20 p-2.5 sm:p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("app.currentProjectLabel")}</div>
                <div className="mt-1 truncate text-sm font-medium text-foreground" title={snapshot.zipName}>
                  {snapshot.zipName}
                </div>
                <div className="mt-2 min-w-0 break-words text-[11px] text-muted-foreground">
                  {t("app.filesLabel")}: <span className="text-foreground">{snapshot.includedFiles}</span> · {t("app.linesAbbr")}:{" "}
                  <span className="text-foreground">{snapshot.totalLinesOfCode.toLocaleString("pt-BR")}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 flex h-auto min-h-9 w-full min-w-0 max-w-full shrink-0 flex-col items-center justify-center gap-1 overflow-hidden px-2 py-2 sm:flex-row sm:gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 max-w-full truncate text-center text-xs">{t("app.changeZip")}</span>
                </Button>
                <p className="mt-1.5 break-words text-[10px] leading-snug text-muted-foreground">{t("app.changeZipHint")}</p>
              </div>

              <div className="box-border w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-background/60 p-2.5 sm:p-3">
                <div className="min-w-0 truncate text-xs font-semibold text-foreground">{t("app.analysisCardTitle")}</div>
                <p className="mt-1 break-words text-[11px] leading-snug text-muted-foreground">{t("app.analysisCardDesc")}</p>
                {analysis ? (
                  <p className="mt-2 break-words rounded-md border border-primary/25 bg-primary/5 px-2 py-1.5 text-[11px] leading-snug text-primary">
                    {t("app.analysisDoneHint")}
                  </p>
                ) : null}
                <div className="mt-3 w-full min-w-0 max-w-full shrink-0 overflow-hidden">
                  <Button
                    className="flex h-auto min-h-9 w-full min-w-0 max-w-full flex-col items-center justify-center gap-1 overflow-hidden px-2 py-2.5 text-center text-[11px] leading-snug sm:flex-row sm:gap-2 sm:px-3"
                    size="sm"
                    disabled={processing !== null}
                    variant={analysis ? "secondary" : "default"}
                    onClick={() => void analyze()}
                  >
                    {processing?.taskKind === "analysis" ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <Activity className="h-4 w-4 shrink-0" />
                    )}
                    <span className="max-w-full whitespace-normal break-words sm:min-w-0 sm:truncate sm:whitespace-nowrap">
                      {t("app.runAnalysis")}
                    </span>
                  </Button>
                </div>
                <div className="mt-2 min-w-0 space-y-0.5 text-[10px] text-muted-foreground">
                  <div className="leading-tight">{t("app.modelLabel")}</div>
                  <div
                    className="break-all font-mono leading-tight text-foreground"
                    title={`${activeLlmContext.provider}:${activeLlmContext.model}`}
                  >
                    {activeLlmContext.provider}:{activeLlmContext.model}
                  </div>
                </div>
              </div>
            </>
          )}

          <Accordion type="multiple" value={sidebarAccordionValue} onValueChange={setSidebarAccordionValue} className="w-full min-w-0 max-w-full space-y-2">
            {snapshot ? (
              <AccordionItem
                ref={filesSectionRef}
                value="files"
                className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-background/50 !border-b-0"
              >
                <AccordionTrigger className="px-2 py-2.5 text-xs font-semibold hover:no-underline sm:px-3">
                  {t("app.sectionFiles")}
                </AccordionTrigger>
                <AccordionContent className="flex min-h-[100px] flex-col px-2 pb-2 pt-0 [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col">
                  <FileExplorer
                    className="min-h-0 w-full min-w-0 flex-1"
                    tree={snapshot.tree}
                    onPickFile={(p) => openInspector(p)}
                    scrollClassName="min-h-[100px] max-h-[min(42vh,400px)] flex-1"
                  />
                </AccordionContent>
              </AccordionItem>
            ) : null}

            <AccordionItem value="history" className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-background/50 !border-b-0">
              <AccordionTrigger className="px-2 py-2.5 text-xs font-semibold hover:no-underline sm:px-3">
                {t("app.sectionHistory")}
              </AccordionTrigger>
              <AccordionContent className="min-w-0 max-w-full px-2 pb-2 pt-0">
                <p className="mb-2 break-words text-[11px] text-muted-foreground">{t("app.historyDesc")}</p>
                {history.length ? (
                  <div className="max-h-[220px] min-w-0 max-w-full overflow-x-auto overflow-y-auto rounded-md border border-border">
                    <Table className="w-full min-w-0 table-fixed text-[10px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[26%] p-1.5 align-middle text-[10px] font-semibold">{t("app.historyWhen")}</TableHead>
                          <TableHead className="w-[34%] p-1.5 align-middle text-[10px] font-semibold">{t("app.historyZip")}</TableHead>
                          <TableHead className="w-[40%] p-1.5 text-right text-[10px] font-semibold"> </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((h) => (
                          <TableRow key={h.id}>
                            <TableCell className="p-1.5 align-top text-[10px] text-muted-foreground">
                              <span className="block break-words leading-tight">{new Date(h.createdAt).toLocaleDateString("pt-BR")}</span>
                            </TableCell>
                            <TableCell className="p-1.5 align-top">
                              <span className="block break-all leading-tight" title={h.zipName}>
                                {h.zipName}
                              </span>
                            </TableCell>
                            <TableCell className="p-1.5 align-top text-right">
                              <div className="flex min-w-0 flex-col items-stretch gap-1">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 w-full min-w-0 max-w-full shrink-0 truncate px-1.5 text-[9px]"
                                  onClick={() => loadHistoryEntry(h)}
                                >
                                  {t("app.historyLoad")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-full min-w-0 max-w-full shrink-0 px-1.5 text-[10px]"
                                  onClick={() => removeHistoryEntry(h.id)}
                                >
                                  ×
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="break-words text-xs text-muted-foreground">{t("app.historyEmpty")}</div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </ScrollArea>
    </aside>
  );

  return (
    <motion.div
      className="flex h-screen flex-col overflow-hidden bg-background"
      initial={{ opacity: 0.98 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          void handleZipFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <FileInspectorSheet
        open={inspectOpen}
        onOpenChange={setInspectOpen}
        filePath={inspectPath}
        snapshot={snapshot}
        analysis={analysis}
      />

      <ProcessingProgressModal open={processing !== null} state={processing} />

      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-3 shadow-sm">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {!leftExpanded ? (
            <motion.span whileTap={{ scale: 0.92 }} transition={{ type: "spring", stiffness: 520, damping: 28 }} className="inline-flex">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0 border-border"
                title={t("app.sidebarExpand")}
                onClick={() => setLeftExpanded(true)}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </motion.span>
          ) : null}
          <img src="/logo-branca.avif" alt={t("app.title")} className="h-8 w-auto shrink-0 object-contain" width={120} height={32} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight sm:text-base">{t("app.title")}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2 py-1">
            <Label htmlFor="tenant" className="whitespace-nowrap font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("app.tenant")}
            </Label>
            <Input
              id="tenant"
              className="h-7 w-[100px] border-0 bg-transparent px-1 text-xs"
              value={tenantInput}
              onChange={(e) => setTenantInput(e.target.value)}
              placeholder="default"
            />
            <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" onClick={applyTenant}>
              {t("app.apply")}
            </Button>
          </div>

          <Dialog
            open={llmOpen}
            onOpenChange={(open) => {
              setLlmOpen(open);
              if (open) setLlmDraft(storedLlm ?? defaultLlmConfig());
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Settings className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("app.llmSettings")}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="tracking-tight">{t("app.llmDialogTitle")}</DialogTitle>
                <DialogDescription>{t("app.llmDialogDesc")}</DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-2">
                <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <div className="flex gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>{t("app.llmWarning")}</div>
                  </div>
                </div>

                <LlmConfigurationForm
                  value={llmDraft}
                  onChange={setLlmDraft}
                  onSave={persistLlm}
                  onCancel={() => {
                    setLlmDraft(storedLlm ?? defaultLlmConfig());
                    setLlmOpen(false);
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {leftRail}
        {workspacePanel}
        {leftExpanded ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("app.resizeSidebar")}
            title={t("app.resizeSidebar")}
            onPointerDown={onLeftResizePointerDown}
            className="group relative z-0 flex h-full w-1.5 shrink-0 grow-0 cursor-col-resize touch-none select-none items-stretch justify-center border-l border-transparent hover:bg-primary/10 active:bg-primary/15"
          >
            <span className="my-auto h-20 w-px shrink-0 rounded-full bg-border transition-colors duration-200 group-hover:bg-primary/55" />
          </div>
        ) : null}

        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          {snapshot && analysis ? (
            <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)} className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background/60 px-3 py-2">
                <TabsList className="grid h-9 w-full max-w-xl grid-cols-3 sm:inline-flex sm:w-auto">
                  <TabsTrigger value="graph" className="gap-1.5 text-xs sm:text-sm">
                    <Network className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    {t("app.tabGraph")}
                  </TabsTrigger>
                  <TabsTrigger value="documentation" className="gap-1.5 text-xs sm:text-sm">
                    <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    {t("app.tabDocs")}
                  </TabsTrigger>
                  <TabsTrigger value="metrics" className="gap-1.5 text-xs sm:text-sm">
                    <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    {t("app.tabMetrics")}
                  </TabsTrigger>
                </TabsList>
                <Button
                  type="button"
                  size="sm"
                  variant={rightOpen ? "secondary" : "outline"}
                  className="gap-1.5 shrink-0"
                  title={rightOpen ? t("app.rightClose") : t("app.rightOpen")}
                  onClick={() => setRightOpen((v) => !v)}
                >
                  {rightOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  <span className="hidden sm:inline">{t("app.rightSummary")}</span>
                </Button>
              </div>

              <TabsContent value="graph" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
                  <div className="max-w-[720px] text-[11px] leading-snug text-muted-foreground sm:text-xs">{t("app.graphHints")}</div>
                  {drillLayer ? (
                    <Button size="sm" variant="secondary" className="shrink-0" onClick={() => setDrillLayer(null)}>
                      {t("app.backMacro")}
                    </Button>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 p-3">
                  <ArchitectureFlowView
                    analysis={analysis}
                    drillLayer={drillLayer}
                    onRequestDrill={(l) => setDrillLayer(l)}
                    onMicroInspect={onMicroInspect}
                  />
                </div>
              </TabsContent>

              <TabsContent value="documentation" className="mt-0 min-h-0 flex-1 overflow-auto p-3 data-[state=inactive]:hidden">
                <DocumentationSuite
                  snapshot={snapshot}
                  analysis={analysis}
                  llm={effectiveLlm}
                  progress={progressApi}
                  onDocumentationUpdated={onDocumentationUpdated}
                />
              </TabsContent>

              <TabsContent value="metrics" className="mt-0 min-h-0 flex-1 overflow-auto p-3 data-[state=inactive]:hidden">
                <MetricsDashboard snapshot={snapshot} analysis={analysis} />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8">
                <div className="w-full max-w-md rounded-xl border border-border bg-card/60 px-5 py-8 text-center shadow-sm backdrop-blur-sm sm:px-8">
                  {snapshot ? (
                    <Lock className="mx-auto mb-4 h-11 w-11 text-primary/80" aria-hidden />
                  ) : (
                    <UploadCloud className="mx-auto mb-4 h-11 w-11 text-primary/80" aria-hidden />
                  )}
                  <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                    {snapshot ? t("app.mainLockedTitle") : t("app.mainNoZipTitle")}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{snapshot ? t("app.mainLockedDesc") : t("app.mainNoZipDesc")}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {analysis && rightOpen ? (
            <motion.aside
              key="right-summary"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 28 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="flex h-full min-h-0 w-[min(18rem,calc(100vw-3rem))] max-w-[min(24rem,calc(100vw-4rem))] shrink-0 flex-col overflow-hidden border-l border-border bg-card/25 sm:w-80"
            >
              <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
                <span className="truncate text-xs font-semibold tracking-wide text-muted-foreground">{t("app.rightSummary")}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  title={t("app.rightClose")}
                  onClick={() => setRightOpen(false)}
                >
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </div>
              <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
                <div className="min-w-0 space-y-3 p-3">
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("app.summaryTitle")}</div>
                    <div className="mt-1 truncate text-sm font-semibold text-foreground">{analysis.projectName}</div>
                  </div>
                  <p className="break-words text-xs leading-relaxed text-muted-foreground">{analysis.summary}</p>
                  <div className="flex flex-wrap gap-1">
                    {analysis.detectedLanguages.map((l) => (
                      <span key={l} className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-foreground">
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
