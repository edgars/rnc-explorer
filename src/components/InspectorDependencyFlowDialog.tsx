import { useId, useMemo } from "react";
import { motion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { macroLayerTitle, type MacroLayerId } from "@/lib/architecture";
import type { InspectorFlowNode } from "@/lib/inspectorDependencyFlow";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function layerLabel(layer: InspectorFlowNode["layer"]) {
  return layer === "unknown" ? "—" : macroLayerTitle(layer as MacroLayerId);
}

type FlowSvgProps = {
  nodes: InspectorFlowNode[];
  uid: string;
};

function FlowSvg(props: FlowSvgProps) {
  const W = 640;
  const H = 220;
  const padX = 40;
  const padY = 72;
  const innerW = W - 2 * padX;
  const count = props.nodes.length;
  const step = count > 1 ? innerW / (count - 1) : 0;
  const pts = useMemo(
    () => props.nodes.map((_, i) => ({ x: padX + i * step, y: padY })),
    [props.nodes, step, count, padX, padY],
  );
  const gradId = `${props.uid}-flow-line-grad`;

  return (
    <div className="text-foreground">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-full overflow-visible" role="img" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
            <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.95" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {props.nodes.map((_, i) => {
          if (i >= count - 1) return null;
          const x1 = pts[i]!.x;
          const y1 = pts[i]!.y;
          const x2 = pts[i + 1]!.x;
          const y2 = pts[i + 1]!.y;
          const mx = (x1 + x2) / 2;
          const d = `M ${x1} ${y1} Q ${mx} ${y1 - 36} ${x2} ${y2}`;
          const edgeId = `${props.uid}-edge-${i}`;
          return (
            <g key={edgeId}>
              <motion.path
                d={d}
                fill="none"
                stroke="hsl(var(--border))"
                strokeWidth="2"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.55, delay: i * 0.08, ease: "easeOut" }}
              />
              <path id={edgeId} d={d} fill="none" stroke={`url(#${gradId})`} strokeWidth="2.5" strokeLinecap="round" opacity={0.85} />
              <motion.path
                d={d}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="6 14"
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: -80 }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "linear", delay: i * 0.12 }}
              />
              <circle r="5" fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="2">
                <animateMotion dur={`${2.1 + i * 0.12}s`} repeatCount="indefinite" rotate="auto" calcMode="linear">
                  <mpath xlinkHref={`#${edgeId}`} href={`#${edgeId}`} />
                </animateMotion>
              </circle>
            </g>
          );
        })}

        {props.nodes.map((n, i) => {
          const { x, y } = pts[i]!;
          const w = 118;
          const h = 46;
          return (
            <g key={n.path} transform={`translate(${x}, ${y})`}>
              <title>{n.path}</title>
              <rect
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                rx="10"
                className={cn(n.isCurrent ? "fill-primary/25 stroke-primary" : "fill-muted/50 stroke-border")}
                strokeWidth="1.5"
              />
              <text y={-4} textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="600" className="select-none">
                {truncate(n.shortLabel, 16)}
              </text>
              <text y={10} textAnchor="middle" fill="currentColor" fontSize="8" opacity={0.75} className="select-none">
                {layerLabel(n.layer)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function InspectorDependencyFlowDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nodes: InspectorFlowNode[];
}) {
  const { t } = useLocale();
  const uid = useId().replace(/:/g, "");
  const hasFlow = props.nodes.length >= 2;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[min(100vw-1rem,40rem)] gap-4 overflow-y-auto border-primary/20 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("inspector.flowTitle")}</DialogTitle>
          <DialogDescription>{t("inspector.flowDesc")}</DialogDescription>
        </DialogHeader>
        {hasFlow ? (
          <>
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: "easeOut" }}>
              <FlowSvg nodes={props.nodes} uid={uid} />
            </motion.div>
            <ol className="max-h-36 space-y-1.5 overflow-y-auto rounded-md border border-border/60 bg-muted/15 p-2 text-[11px] leading-snug text-muted-foreground">
              {props.nodes.map((n, idx) => (
                <li key={n.path} className="flex min-w-0 gap-2">
                  <span className="shrink-0 font-mono text-[10px] text-primary">{idx + 1}.</span>
                  <span className="min-w-0 break-all font-mono text-foreground">{n.path}</span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("inspector.flowEmpty")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
