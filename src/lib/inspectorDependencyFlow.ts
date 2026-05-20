import type { ArchitectureAnalysis, MacroLayerId, ParsedProjectSnapshot } from "@/lib/architecture";
import { MACRO_LAYER_IDS } from "@/lib/architecture";

const JAVA_IMPORT =
  /^\s*import\s+(?:static\s+)?([\w.]+)\s*;\s*$/gm;

function norm(p: string): string {
  return p.replaceAll("\\", "/").trim();
}

/** Imports Java (pacote.Classe), exclui java/javax/jakarta de propósito genérico. */
export function extractJavaImportFqns(source: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(JAVA_IMPORT.source, "gm");
  while ((m = re.exec(source)) !== null) {
    const fqn = m[1];
    if (!fqn) continue;
    if (/^(java|javax|jakarta|org\.w3c|org\.xml|sun\.|com\.sun)\./i.test(fqn)) continue;
    out.push(fqn);
  }
  return [...new Set(out)];
}

function allTextPaths(snapshot: ParsedProjectSnapshot): string[] {
  return [...new Set([...Object.keys(snapshot.sources), ...Object.keys(snapshot.snippets)])].map(norm);
}

/** Converte FQN Java em caminho provável no ZIP (…/com/foo/Bar.java). */
export function resolveJavaFqnToPath(fqn: string, snapshot: ParsedProjectSnapshot): string | null {
  const keys = allTextPaths(snapshot);
  const asPath = `${fqn.replaceAll(".", "/")}.java`;
  for (const k of keys) {
    const nk = norm(k);
    if (nk.endsWith(asPath) || nk.endsWith("/" + asPath)) return k;
  }
  const simple = fqn.split(".").pop();
  if (!simple) return null;
  const suffix = `${simple}.java`;
  const hits = keys.filter((k) => norm(k).endsWith("/" + suffix) || norm(k).endsWith(suffix));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    const pref = fqn.split(".").slice(0, -1).join("/");
    const prefHit = hits.find((h) => norm(h).includes(pref));
    return prefHit ?? hits[0];
  }
  return null;
}

export type InspectorFlowNode = {
  path: string;
  shortLabel: string;
  layer: MacroLayerId | "unknown";
  isCurrent: boolean;
};

function layerForPath(path: string, analysis: ArchitectureAnalysis | null): MacroLayerId | "unknown" {
  if (!analysis) return "unknown";
  const d =
    analysis.fileAnalysisDetails[path] ??
    Object.entries(analysis.fileAnalysisDetails).find(([k]) => norm(k) === norm(path) || norm(k).endsWith("/" + path.split("/").pop()))?.[1];
  if (!d?.layer) return "unknown";
  const lid = d.layer as string;
  return MACRO_LAYER_IDS.includes(lid as MacroLayerId) ? (lid as MacroLayerId) : "unknown";
}

/**
 * Nós para o fluxo: arquivo atual + outros ficheiros do projeto referenciados por imports.
 * Ordenados por camada (UI → … → base de dados) para leitura esquerda‑direita.
 */
export function buildInspectorDependencyFlow(
  currentPath: string,
  source: string,
  snapshot: ParsedProjectSnapshot,
  analysis: ArchitectureAnalysis | null,
): InspectorFlowNode[] {
  const layerOrder = (l: MacroLayerId | "unknown") =>
    l === "unknown" ? 99 : MACRO_LAYER_IDS.indexOf(l as MacroLayerId);

  const nodes: InspectorFlowNode[] = [];
  const seen = new Set<string>();

  const push = (path: string, isCurrent: boolean) => {
    const n = norm(path);
    if (seen.has(n)) return;
    seen.add(n);
    nodes.push({
      path: n,
      shortLabel: n.split("/").pop() ?? n,
      layer: layerForPath(n, analysis),
      isCurrent,
    });
  };

  push(norm(currentPath), true);

  for (const fqn of extractJavaImportFqns(source)) {
    const p = resolveJavaFqnToPath(fqn, snapshot);
    if (p) push(norm(p), false);
  }

  const sorted = [...nodes].sort((a, b) => {
    const d = layerOrder(a.layer) - layerOrder(b.layer);
    if (d !== 0) return d;
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? 1 : -1;
    return a.shortLabel.localeCompare(b.shortLabel);
  });
  if (sorted.length <= 8) return sorted;
  const cur = sorted.find((n) => n.isCurrent);
  const others = sorted.filter((n) => !n.isCurrent).slice(0, 7);
  return [...(cur ? [cur] : []), ...others].sort((a, b) => {
    const d = layerOrder(a.layer) - layerOrder(b.layer);
    if (d !== 0) return d;
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? 1 : -1;
    return a.shortLabel.localeCompare(b.shortLabel);
  });
}
