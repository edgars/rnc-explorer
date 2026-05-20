import type { ArchitectureAnalysis, ComplexityScore, MacroLayerId, ParsedProjectSnapshot } from "@/lib/architecture";
import { MACRO_LAYER_IDS } from "@/lib/architecture";

export type LayerDistribution = Record<MacroLayerId, { count: number; pct: number }>;

export function complexityToProgress(score: ComplexityScore): number {
  switch (score) {
    case "Low":
      return 33;
    case "Medium":
      return 66;
    case "High":
      return 100;
  }
}

/** Client-derived LoC (from ZIP parse) vs model-reported metrics. */
export function buildDashboardModel(snapshot: ParsedProjectSnapshot | null, analysis: ArchitectureAnalysis | null) {
  if (!snapshot || !analysis) {
    return null;
  }

  const clientLoc = snapshot.totalLinesOfCode;
  const modelLoc = analysis.metrics.totalLinesOfCode;
  const locDisplay = modelLoc > 0 ? Math.max(modelLoc, clientLoc) : clientLoc;

  const layerCounts: Record<MacroLayerId, number> = {
    ui: 0,
    bll: 0,
    model: 0,
    dal: 0,
    database: 0,
  };

  for (const [, detail] of Object.entries(analysis.fileAnalysisDetails)) {
    const ly = detail.layer;
    if (ly in layerCounts) layerCounts[ly as MacroLayerId] += 1;
  }

  const totalLayerFiles = MACRO_LAYER_IDS.reduce((s, k) => s + layerCounts[k], 0);

  const distribution: LayerDistribution = {
    ui: { count: layerCounts.ui, pct: totalLayerFiles ? (layerCounts.ui / totalLayerFiles) * 100 : 0 },
    bll: { count: layerCounts.bll, pct: totalLayerFiles ? (layerCounts.bll / totalLayerFiles) * 100 : 0 },
    model: { count: layerCounts.model, pct: totalLayerFiles ? (layerCounts.model / totalLayerFiles) * 100 : 0 },
    dal: { count: layerCounts.dal, pct: totalLayerFiles ? (layerCounts.dal / totalLayerFiles) * 100 : 0 },
    database: { count: layerCounts.database, pct: totalLayerFiles ? (layerCounts.database / totalLayerFiles) * 100 : 0 },
  };

  const perLanguage = Object.entries(snapshot.linesByExtension)
    .filter(([k]) => k && k !== "(no ext)")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16);

  return {
    clientLoc,
    modelLoc,
    locDisplay,
    perLanguage,
    distribution,
    totalLayerFiles,
    metrics: analysis.metrics,
  };
}
