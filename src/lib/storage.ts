import type { ArchitectureAnalysis, ParsedProjectSnapshot } from "@/lib/architecture";
import { migrateParsedSnapshot, parseArchitectureAnalysis } from "@/lib/architecture";
import type { LlmConfig } from "@/lib/llmConfig";
import { defaultModelForProvider, normalizeLlmConfig } from "@/lib/llmConfig";
import { logger } from "@/lib/logger";

const LEGACY_LLM_KEY = "archlens:llm-config";
const LEGACY_HISTORY_KEY = "archlens:analysis-history";

const TENANT_ID_KEY = "archlens:tenant-id";

export type HistoryEntry = {
  id: string;
  createdAt: string;
  zipName: string;
  snapshot: ParsedProjectSnapshot;
  analysis: ArchitectureAnalysis;
};

function getTenantId(): string {
  try {
    const id = localStorage.getItem(TENANT_ID_KEY)?.trim();
    return id && id.length > 0 ? id : "default";
  } catch {
    return "default";
  }
}

export function readTenantId(): string {
  return getTenantId();
}

export function writeTenantId(tenantId: string) {
  const t = tenantId.trim() || "default";
  localStorage.setItem(TENANT_ID_KEY, t);
}

function nsKey(suffix: string): string {
  return `archlens:v1:tenant:${getTenantId()}:${suffix}`;
}

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** One-time migration from legacy global keys to tenant-namespaced storage. */
function migrateLegacyStorageIfNeeded() {
  try {
    const tenantLlm = localStorage.getItem(nsKey("llm-config"));
    if (!tenantLlm) {
      const legacy = localStorage.getItem(LEGACY_LLM_KEY);
      if (legacy) {
        localStorage.setItem(nsKey("llm-config"), legacy);
      }
    }
    const tenantHist = localStorage.getItem(nsKey("analysis-history"));
    if (!tenantHist) {
      const legacyH = localStorage.getItem(LEGACY_HISTORY_KEY);
      if (legacyH) {
        localStorage.setItem(nsKey("analysis-history"), legacyH);
      }
    }
  } catch {
    /* ignore */
  }
}

export function loadLlmConfig(): LlmConfig | null {
  migrateLegacyStorageIfNeeded();
  const raw = safeJsonParse<unknown>(localStorage.getItem(nsKey("llm-config")));
  if (!raw) return null;
  return normalizeLlmConfig(raw);
}

export function saveLlmConfig(cfg: LlmConfig) {
  localStorage.setItem(nsKey("llm-config"), JSON.stringify(cfg));
}

function normalizeHistoryEntry(raw: unknown): HistoryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<HistoryEntry>;
  if (!e.id || !e.createdAt || !e.zipName || !e.snapshot || !e.analysis) return null;
  try {
    return {
      id: e.id,
      createdAt: e.createdAt,
      zipName: e.zipName,
      snapshot: migrateParsedSnapshot(e.snapshot as ParsedProjectSnapshot),
      analysis: parseArchitectureAnalysis(e.analysis),
    };
  } catch {
    return null;
  }
}

export function loadHistory(): HistoryEntry[] {
  migrateLegacyStorageIfNeeded();
  const parsed = safeJsonParse<unknown[]>(localStorage.getItem(nsKey("analysis-history")));
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeHistoryEntry).filter((x): x is HistoryEntry => x !== null);
}

/** Persiste o histórico; devolve false se quota, JSON ou LocalStorage falharem. */
export function saveHistory(entries: HistoryEntry[]): boolean {
  migrateLegacyStorageIfNeeded();
  try {
    const key = nsKey("analysis-history");
    const payload = JSON.stringify(entries);
    localStorage.setItem(key, payload);
    return true;
  } catch (e) {
    logger.error("saveHistory: não foi possível gravar no LocalStorage", e);
    return false;
  }
}

export type HistoryMutationResult = { entries: HistoryEntry[]; persisted: boolean };

export function appendHistory(entry: HistoryEntry): HistoryMutationResult {
  const prev = loadHistory();
  const next = [entry, ...prev].slice(0, 24);
  const persisted = saveHistory(next);
  return { entries: persisted ? next : prev, persisted };
}

export function deleteHistoryEntry(id: string): HistoryMutationResult {
  const prev = loadHistory();
  const next = prev.filter((e) => e.id !== id);
  const persisted = saveHistory(next);
  return { entries: persisted ? next : prev, persisted };
}

export function replaceHistoryEntry(id: string, updater: (prev: HistoryEntry) => HistoryEntry): HistoryMutationResult | null {
  const prev = loadHistory();
  const idx = prev.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const next = [...prev];
  next[idx] = updater(next[idx]!);
  const persisted = saveHistory(next);
  return { entries: persisted ? next : prev, persisted };
}

export function defaultModelsForProvider(provider: LlmConfig["provider"]): string {
  return defaultModelForProvider(provider);
}
