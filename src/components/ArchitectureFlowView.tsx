import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  MarkerType,
  type Edge,
  type Node,
  type NodeTypes,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { ArchitectureAnalysis, MacroLayerId } from "@/lib/architecture";
import { isMacroLayerId, MACRO_LAYER_IDS, macroLayerTitle } from "@/lib/architecture";
import { MacroFlowNode, type MacroNodeData } from "@/components/flow/MacroFlowNode";
import { MicroFlowNode, type MicroNodeData } from "@/components/flow/MicroFlowNode";
import { MacroPreviewContext, type MacroPreviewBridge } from "@/components/flow/macroPreviewContext";

const nodeTypes = {
  macro: MacroFlowNode,
  micro: MicroFlowNode,
} satisfies NodeTypes;

const MACRO_LAYOUT: Record<MacroLayerId, { x: number; y: number }> = {
  ui: { x: 520, y: 40 },
  bll: { x: 260, y: 240 },
  model: { x: 780, y: 240 },
  dal: { x: 260, y: 460 },
  database: { x: 520, y: 660 },
};

function collectLayerPaths(analysis: ArchitectureAnalysis, layerId: MacroLayerId): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of analysis.graph.micro[layerId] ?? []) {
    const p = n.sourcePath?.trim();
    if (!p || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  out.sort((a, b) => a.localeCompare(b, "pt-BR"));
  return out.slice(0, 120);
}

function buildMacroGraph(analysis: ArchitectureAnalysis): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = analysis.graph.macro.map((m) => ({
    id: m.id,
    type: "macro",
    position: MACRO_LAYOUT[m.id as MacroLayerId] ?? { x: 0, y: 0 },
    data: {
      kind: "macro",
      label: m.label,
      layerId: m.id,
    } satisfies MacroNodeData,
  }));

  const edges: Edge[] = [];
  for (const m of analysis.graph.macro) {
    for (const dep of m.dependencies) {
      if (!isMacroLayerId(dep)) continue;
      edges.push({
        id: `${m.id}->${dep}`,
        source: m.id,
        target: dep,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
      });
    }
  }

  return { nodes, edges };
}

type MicroWithLayer = {
  id: string;
  label: string;
  description: string;
  layerId: MacroLayerId;
  dependencies: string[];
  sourcePath?: string;
};

function collectMicroDrillSubgraph(analysis: ArchitectureAnalysis, layer: MacroLayerId) {
  const all: MicroWithLayer[] = [];
  for (const lid of MACRO_LAYER_IDS) {
    for (const n of analysis.graph.micro[lid]) {
      all.push({
        id: n.id,
        label: n.label,
        description: n.description,
        layerId: lid,
        dependencies: n.dependencies,
        sourcePath: n.sourcePath,
      });
    }
  }

  const idTo = new Map(all.map((n) => [n.id, n]));
  const visited = new Set<string>();
  const queue: string[] = analysis.graph.micro[layer].map((n) => n.id);

  while (queue.length) {
    const id = queue.pop()!;
    if (visited.has(id)) continue;
    if (!idTo.has(id)) continue;
    visited.add(id);
    const node = idTo.get(id)!;
    for (const dep of node.dependencies) {
      if (idTo.has(dep)) queue.push(dep);
    }
  }

  const nodesList = [...visited].map((id) => idTo.get(id)!);

  const sorted = [...nodesList].sort((a, b) => {
    const la = MACRO_LAYER_IDS.indexOf(a.layerId);
    const lb = MACRO_LAYER_IDS.indexOf(b.layerId);
    if (la !== lb) return la - lb;
    return a.label.localeCompare(b.label, "pt-BR");
  });

  const nodes: Node[] = sorted.map((n, i) => ({
    id: n.id,
    type: "micro",
    position: { x: 60 + (i % 4) * 300, y: 40 + Math.floor(i / 4) * 170 },
    data: {
      kind: "micro",
      label: n.label,
      description: n.description,
      layerId: n.layerId,
      sourcePath: n.sourcePath,
    } satisfies MicroNodeData,
  }));

  const edges: Edge[] = [];
  for (const n of nodesList) {
    for (const dep of n.dependencies) {
      if (!visited.has(dep)) continue;
      edges.push({
        id: `${n.id}->${dep}`,
        source: n.id,
        target: dep,
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      });
    }
  }

  return { nodes, edges };
}

type LayerPreviewState = {
  layerId: MacroLayerId;
  paths: string[];
  anchor: { x: number; y: number };
};

function LayerFilesPopup(props: {
  popup: LayerPreviewState;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  title: string;
  hint: string;
  empty: string;
}) {
  const { popup } = props;
  const pos = useMemo(() => {
    const panelW = 300;
    const panelH = 280;
    let left = popup.anchor.x + 10;
    let top = popup.anchor.y + 6;
    if (typeof window !== "undefined") {
      left = Math.min(Math.max(8, left), window.innerWidth - panelW - 8);
      top = Math.min(Math.max(8, top), window.innerHeight - panelH - 8);
    }
    return { left, top, width: panelW };
  }, [popup.anchor.x, popup.anchor.y]);

  return (
    <motion.div
      role="dialog"
      aria-label={props.title}
      className="fixed z-[100] flex max-h-[min(320px,42vh)] w-[min(300px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-primary/25 bg-popover/95 p-2 text-popover-foreground shadow-2xl shadow-primary/10 backdrop-blur-sm"
      style={{ left: pos.left, top: pos.top, width: pos.width }}
      initial={{ opacity: 0, scale: 0.94, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 6 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      onPointerEnter={props.onPointerEnter}
      onPointerLeave={props.onPointerLeave}
    >
      <div className="border-b border-border/60 px-1.5 pb-1.5 pt-0.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{props.title}</div>
        <div className="mt-0.5 text-xs font-semibold leading-tight">{macroLayerTitle(popup.layerId)}</div>
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{props.hint}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-1.5">
        {popup.paths.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">{props.empty}</p>
        ) : (
          <ul className="space-y-0.5">
            {popup.paths.map((p, i) => (
              <motion.li
                key={p}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(0.04 * i, 0.6), duration: 0.18 }}
                className="break-all font-mono text-[10px] leading-snug text-foreground"
              >
                {p}
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
}

function ArchitectureFlowCanvas(props: {
  analysis: ArchitectureAnalysis;
  drillLayer: MacroLayerId | null;
  onRequestDrill: (layer: MacroLayerId) => void;
  onMicroInspect?: (info: { microId: string; layerId: MacroLayerId; sourcePath?: string }) => void;
}) {
  const { t } = useLocale();
  const macro = useMemo(() => buildMacroGraph(props.analysis), [props.analysis]);

  const micro = useMemo(() => {
    if (!props.drillLayer) return { nodes: [] as Node[], edges: [] as Edge[] };
    return collectMicroDrillSubgraph(props.analysis, props.drillLayer);
  }, [props.analysis, props.drillLayer]);

  const bundle = props.drillLayer ? micro : macro;
  const [nodes, setNodes, onNodesChange] = useNodesState(bundle.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(bundle.edges);

  const [layerPreview, setLayerPreview] = useState<LayerPreviewState | null>(null);
  const dwellTimer = useRef<number | null>(null);
  const dismissTimer = useRef<number | null>(null);
  const lastMove = useRef({ x: 0, y: 0 });

  const cancelDwell = useCallback(() => {
    if (dwellTimer.current != null) {
      window.clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
    }
  }, []);

  const cancelDismiss = useCallback(() => {
    if (dismissTimer.current != null) {
      window.clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);

  const onMacroPointerLeave = useCallback(() => {
    cancelDwell();
    dismissTimer.current = window.setTimeout(() => setLayerPreview(null), 200);
  }, [cancelDwell]);

  const startDwellFrom = useCallback(
    (layerId: MacroLayerId, x: number, y: number) => {
      if (props.drillLayer) return;
      cancelDismiss();
      cancelDwell();
      lastMove.current = { x, y };
      dwellTimer.current = window.setTimeout(() => {
        dwellTimer.current = null;
        const paths = collectLayerPaths(props.analysis, layerId);
        setLayerPreview({ layerId, paths, anchor: { x, y } });
      }, 420);
    },
    [props.analysis, props.drillLayer, cancelDwell, cancelDismiss],
  );

  const macroPreviewBridge = useMemo<MacroPreviewBridge>(
    () => ({
      onMacroPointerEnter: (layerId, x, y) => {
        startDwellFrom(layerId, x, y);
      },
      onMacroPointerMove: (layerId, x, y) => {
        const d = Math.hypot(x - lastMove.current.x, y - lastMove.current.y);
        if (d > 12) startDwellFrom(layerId, x, y);
      },
      onMacroPointerLeave: () => {
        onMacroPointerLeave();
      },
    }),
    [startDwellFrom, onMacroPointerLeave],
  );

  useEffect(() => {
    return () => {
      cancelDwell();
      if (dismissTimer.current != null) window.clearTimeout(dismissTimer.current);
    };
  }, [cancelDwell]);

  useEffect(() => {
    setNodes(bundle.nodes);
    setEdges(bundle.edges);
  }, [bundle.nodes, bundle.edges, setEdges, setNodes]);

  /** Ao mudar para vista micro, fecha o popup macro. */
  useEffect(() => {
    if (props.drillLayer) {
      cancelDwell();
      cancelDismiss();
      setLayerPreview(null);
    }
  }, [props.drillLayer, cancelDwell, cancelDismiss]);

  const onNodeDoubleClick = useCallback(
    (_: unknown, node: Node) => {
      if (props.drillLayer) return;
      if (node.type !== "macro") return;
      const layer = node.id;
      if (!isMacroLayerId(layer)) return;
      setLayerPreview(null);
      cancelDwell();
      cancelDismiss();
      props.onRequestDrill(layer);
    },
    [props.drillLayer, props.onRequestDrill, cancelDwell, cancelDismiss],
  );

  const onNodeClick = useCallback(
    (_evt: React.MouseEvent, node: Node) => {
      if (!props.drillLayer) return;
      if (node.type !== "micro") return;
      const d = node.data as MicroNodeData;
      props.onMicroInspect?.({
        microId: node.id,
        layerId: d.layerId as MacroLayerId,
        sourcePath: d.sourcePath,
      });
    },
    [props.drillLayer, props.onMicroInspect],
  );

  const onPopupPointerEnter = useCallback(() => {
    cancelDismiss();
  }, [cancelDismiss]);

  const onPopupPointerLeave = useCallback(() => {
    onMacroPointerLeave();
  }, [onMacroPointerLeave]);

  return (
    <MacroPreviewContext.Provider value={props.drillLayer ? null : macroPreviewBridge}>
      <div className="h-[min(78vh,900px)] min-h-[min(480px,45vh)] w-full min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-background">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={1.4}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeClick={onNodeClick}
          defaultEdgeOptions={{
            style: { stroke: "hsl(var(--primary))", strokeWidth: 1.35, opacity: 0.85 },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="hsl(187 35% 38% / 0.35)" />
          <Controls />
          <MiniMap pannable zoomable className="!bg-card" />
        </ReactFlow>
      </div>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {layerPreview ? (
              <LayerFilesPopup
                key={layerPreview.layerId}
                popup={layerPreview}
                onPointerEnter={onPopupPointerEnter}
                onPointerLeave={onPopupPointerLeave}
                title={t("flow.layerFilesTitle")}
                hint={t("flow.layerFilesHint")}
                empty={t("flow.layerFilesEmpty")}
              />
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </MacroPreviewContext.Provider>
  );
}

export function ArchitectureFlowView(props: {
  analysis: ArchitectureAnalysis | null;
  drillLayer: MacroLayerId | null;
  onRequestDrill: (layer: MacroLayerId) => void;
  onMicroInspect?: (info: { microId: string; layerId: MacroLayerId; sourcePath?: string }) => void;
}) {
  const { t } = useLocale();
  if (!props.analysis) {
    return (
      <div className="flex h-full min-h-[min(520px,50vh)] flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        {t("flow.empty")}
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <ArchitectureFlowCanvas
        analysis={props.analysis}
        drillLayer={props.drillLayer}
        onRequestDrill={props.onRequestDrill}
        onMicroInspect={props.onMicroInspect}
      />
    </ReactFlowProvider>
  );
}
