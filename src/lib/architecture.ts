import { z } from "zod";
import { translate } from "@/lib/i18n/dictionary";
import { logger } from "@/lib/logger";

/** Canonical macro-layer ids (5 layers). */
export const MACRO_LAYER_IDS = ["ui", "bll", "model", "dal", "database"] as const;
export type MacroLayerId = (typeof MACRO_LAYER_IDS)[number];

const layerIdSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.enum(["ui", "bll", "model", "dal", "database"]),
);

function normalizeComplexityScoreInput(v: unknown): unknown {
  const raw = String(v ?? "").trim().toLowerCase();
  const s = raw.normalize("NFD").replace(/\p{M}/gu, "");
  if (["low", "baixo", "l"].includes(s)) return "Low";
  if (["medium", "medio", "m"].includes(s)) return "Medium";
  if (["high", "alto", "h"].includes(s)) return "High";
  return v;
}

export const complexityScoreSchema = z.preprocess(normalizeComplexityScoreInput, z.enum(["Low", "Medium", "High"]));
export type ComplexityScore = z.infer<typeof complexityScoreSchema>;

export const architectureMetricsSchema = z.object({
  totalLinesOfCode: z.number().int().nonnegative(),
  complexityScore: complexityScoreSchema,
  totalTablesAccessed: z.number().int().nonnegative(),
  totalBusinessRules: z.number().int().nonnegative(),
  totalEntities: z.number().int().nonnegative(),
});

export type ArchitectureMetrics = z.infer<typeof architectureMetricsSchema>;

const EMPTY_DOCS = {
  techOverview: "",
  appPurpose: "",
  actors: "",
  intents: "",
  databaseAccessStyle: "",
  externalIntegrations: "",
} as const;

export const documentationBundleSchema = z.object({
  techOverview: z.string(),
  appPurpose: z.string(),
  actors: z.string(),
  intents: z.string(),
  databaseAccessStyle: z.string(),
  externalIntegrations: z.string(),
});

export type DocumentationBundle = z.infer<typeof documentationBundleSchema>;

const metricsPartialSchema = architectureMetricsSchema.partial().transform(
  (m) =>
    ({
      totalLinesOfCode: m.totalLinesOfCode ?? 0,
      complexityScore: m.complexityScore ?? "Medium",
      totalTablesAccessed: m.totalTablesAccessed ?? 0,
      totalBusinessRules: m.totalBusinessRules ?? 0,
      totalEntities: m.totalEntities ?? 0,
    }) satisfies ArchitectureMetrics,
);

const documentationPartialSchema = documentationBundleSchema.partial().transform((d) => ({
  ...EMPTY_DOCS,
  ...d,
}));

export const fileAnalysisDetailSchema = z.object({
  purpose: z.string(),
  layer: layerIdSchema,
  businessRules: z.array(z.string()),
});

export type FileAnalysisDetail = z.infer<typeof fileAnalysisDetailSchema>;

const fileAnalysisDetailsRecordSchema = z
  .record(z.string(), z.unknown())
  .default({})
  .transform((rec) => {
    const out: Record<string, FileAnalysisDetail> = {};
    for (const [k, v] of Object.entries(rec)) {
      const r = fileAnalysisDetailSchema.safeParse(v);
      if (r.success) out[k] = r.data;
    }
    return out;
  });

export const microNodeSchema = z
  .object({
    id: z.string(),
    label: z.string().optional(),
    title: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    summary: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
    /** Repository-relative path when this micro node maps to a concrete file. */
    sourcePath: z.string().optional(),
  })
  .transform((m) => ({
      id: m.id.trim(),
      label: [m.label, m.title, m.name].find((x) => typeof x === "string" && x.trim())?.trim() || m.id.trim() || "component",
      description:
        [m.description, m.summary].find((x) => typeof x === "string" && x.trim())?.trim() || "Sem descrição.",
      dependencies: Array.isArray(m.dependencies) ? m.dependencies.map(String) : [],
      sourcePath: typeof m.sourcePath === "string" && m.sourcePath.trim() ? m.sourcePath.trim() : undefined,
    }),
  );

export type MicroNode = z.infer<typeof microNodeSchema>;

export const macroNodeSchema = z.preprocess((raw: unknown) => {
  if (!raw || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return raw;
  const labelPick = (
    [o.label, o.title, o.name, o.humanLabel, o.layerName, o.displayName].find((x) => typeof x === "string" && x.trim()) as
      | string
      | undefined
  )?.trim();
  const nid = normalizeMacroLayerId(id);
  const label = labelPick || (nid ? defaultMacroLabel(nid) : id);
  const depsRaw = o.dependencies ?? o.dependsOn ?? o.deps ?? [];
  const dependencies = Array.isArray(depsRaw) ? depsRaw.map((x) => String(x)) : [];
  return { id, label, dependencies };
}, z.object({ id: z.string(), label: z.string(), dependencies: z.array(z.string()) }));

export type MacroNode = z.infer<typeof macroNodeSchema>;

export const architectureGraphSchema = z.object({
  macro: z.array(macroNodeSchema),
  micro: z.object({
    ui: z.array(microNodeSchema).default([]),
    bll: z.array(microNodeSchema).default([]),
    model: z.array(microNodeSchema).default([]),
    dal: z.array(microNodeSchema).default([]),
    database: z.array(microNodeSchema).default([]),
  }),
});

export type ArchitectureGraph = z.infer<typeof architectureGraphSchema>;

export const architectureAnalysisSchema = z.object({
  projectName: z.string(),
  detectedLanguages: z.array(z.string()),
  summary: z.string(),
  metrics: z.preprocess((v) => (v == null ? {} : v), metricsPartialSchema),
  documentation: z.preprocess((v) => (v == null ? {} : v), documentationPartialSchema),
  graph: architectureGraphSchema,
  fileAnalysisDetails: fileAnalysisDetailsRecordSchema,
});

export type ArchitectureAnalysis = z.infer<typeof architectureAnalysisSchema>;

export type ParsedProjectSnapshot = {
  zipName: string;
  totalFiles: number;
  includedFiles: number;
  tree: FileTreeNode;
  /** Short excerpts for LLM prompts */
  snippets: Record<string, string>;
  /** Full captured source (bounded) for in-browser inspection */
  sources: Record<string, string>;
  /** Line counts per indexed file */
  linesByPath: Record<string, number>;
  /** Aggregate LoC by file extension bucket */
  linesByExtension: Record<string, number>;
  /** Sum of lines across indexed files */
  totalLinesOfCode: number;
  extensionsHistogram: Record<string, number>;
};

export type FileTreeNode = {
  name: string;
  path: string;
  type: "dir" | "file";
  extension?: string;
  children?: FileTreeNode[];
};

export function normalizeMacroLayerId(id: string): MacroLayerId | null {
  const lower = id.trim().toLowerCase();
  if ((MACRO_LAYER_IDS as readonly string[]).includes(lower)) {
    return lower as MacroLayerId;
  }
  return null;
}

export function isMacroLayerId(id: string): id is MacroLayerId {
  return normalizeMacroLayerId(id) !== null;
}

export function macroLayerTitle(id: MacroLayerId): string {
  return translate(`layer.${id}`);
}

/** Parse analysis JSON from storage or LLM; applies schema defaults for older records. */
export function parseArchitectureAnalysis(raw: unknown): ArchitectureAnalysis {
  const r = architectureAnalysisSchema.safeParse(raw);
  if (!r.success) {
    logger.error("parseArchitectureAnalysis: validation failed", r.error.flatten(), r.error.issues);
    throw r.error;
  }
  return r.data;
}

/** Coerce LLM output toward the expected graph shape. */
export function normalizeArchitectureAnalysis(base: ArchitectureAnalysis): ArchitectureAnalysis {
  const macroById = new Map<string, MacroNode>();

  for (const m of base.graph.macro) {
    const nid = normalizeMacroLayerId(m.id);
    if (!nid) continue;
    const deps = m.dependencies
      .map((d) => normalizeMacroLayerId(d))
      .filter((d): d is MacroLayerId => d !== null);
    macroById.set(nid, { id: nid, label: m.label || defaultMacroLabel(nid), dependencies: deps });
  }

  for (const id of MACRO_LAYER_IDS) {
    if (!macroById.has(id)) {
      macroById.set(id, { id, label: defaultMacroLabel(id), dependencies: defaultMacroDeps(id) });
    }
  }

  const orderedMacro = MACRO_LAYER_IDS.map((id) => macroById.get(id)!);

  return {
    ...base,
    graph: {
      macro: orderedMacro,
      micro: base.graph.micro,
    },
  };
}

function defaultMacroLabel(id: MacroLayerId): string {
  switch (id) {
    case "ui":
      return "UI / Screens";
    case "bll":
      return "Business Logic";
    case "model":
      return "Models & Entities";
    case "dal":
      return "Data Access Layer";
    case "database":
      return "Database Layer";
  }
}

function defaultMacroDeps(id: MacroLayerId): MacroLayerId[] {
  switch (id) {
    case "ui":
      return ["bll"];
    case "bll":
      return ["dal", "model"];
    case "model":
      return [];
    case "dal":
      return ["database"];
    case "database":
      return [];
  }
}

/** Normalize snapshots loaded from older LocalStorage entries. */
export function migrateParsedSnapshot(s: ParsedProjectSnapshot): ParsedProjectSnapshot {
  return {
    ...s,
    sources: s.sources ?? {},
    snippets: s.snippets ?? {},
    linesByPath: s.linesByPath ?? {},
    linesByExtension: s.linesByExtension ?? {},
    totalLinesOfCode: typeof s.totalLinesOfCode === "number" ? s.totalLinesOfCode : 0,
    extensionsHistogram: s.extensionsHistogram ?? {},
  };
}