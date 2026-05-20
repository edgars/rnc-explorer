import type { ArchitectureAnalysis, MacroLayerId, MicroNode, ParsedProjectSnapshot } from "@/lib/architecture";
import { MACRO_LAYER_IDS } from "@/lib/architecture";

function normPath(p: string): string {
  return p.replaceAll("\\", "/").trim();
}

function basename(p: string): string {
  const n = normPath(p);
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(i + 1) : n;
}

/** Find snapshot path for a micro node using explicit path, LLM file map, or label heuristics. */
export function resolveMicroNodeToPath(
  node: Pick<MicroNode, "id" | "label" | "sourcePath">,
  analysis: ArchitectureAnalysis,
  snapshot: ParsedProjectSnapshot,
): string | null {
  const paths = new Set([
    ...Object.keys(snapshot.sources),
    ...Object.keys(snapshot.snippets),
    ...Object.keys(analysis.fileAnalysisDetails),
  ]);

  if (node.sourcePath) {
    const sp = normPath(node.sourcePath);
    if (paths.has(sp)) return sp;
    for (const p of paths) {
      if (normPath(p).endsWith(sp) || normPath(p) === sp) return p;
    }
  }

  const labelFile = basename(normPath(node.label));
  for (const p of paths) {
    if (basename(p) === labelFile) return p;
  }

  const idSlug = node.id.replaceAll("_", ".").replaceAll("-", ".");
  for (const p of paths) {
    if (p.includes(idSlug) || basename(p).includes(node.id)) return p;
  }

  return null;
}

export function resolvePathFromFileAnalysis(
  requested: string,
  snapshot: ParsedProjectSnapshot,
): string | null {
  const r = normPath(requested);
  const candidates = [...Object.keys(snapshot.sources), ...Object.keys(snapshot.snippets)];
  if (candidates.includes(r)) return r;
  for (const p of candidates) {
    if (normPath(p) === r || normPath(p).endsWith(`/${r}`) || basename(p) === basename(r)) {
      return p;
    }
  }
  return null;
}

export function findMicroNodeById(analysis: ArchitectureAnalysis, microId: string): { node: MicroNode; layer: MacroLayerId } | null {
  for (const lid of MACRO_LAYER_IDS) {
    const hit = analysis.graph.micro[lid].find((n) => n.id === microId);
    if (hit) return { node: hit, layer: lid };
  }
  return null;
}
