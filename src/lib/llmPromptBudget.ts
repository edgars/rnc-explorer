import type { ParsedProjectSnapshot } from "@/lib/architecture";

/** Orçamento conservador para modelos ~128k tokens (entrada + saída + system). */
export const ARCH_PATH_LIST_MAX_CHARS = 72_000;
export const ARCH_SNIPPET_SECTION_MAX_CHARS = 195_000;
export const ARCH_MAX_SNIPPET_FILES = 72;
export const ARCH_MAX_CHARS_PER_SNIPPET = 1_400;
export const ARCH_TREE_MAX_LINES = 720;

export const DOCS_PATH_LIST_MAX_CHARS = 48_000;
export const DOCS_SNIPPET_SECTION_MAX_CHARS = 140_000;
export const DOCS_MAX_SNIPPET_FILES = 48;
export const DOCS_MAX_CHARS_PER_SNIPPET = 1_200;
export const DOCS_TREE_MAX_LINES = 520;

/** Prioridade maior = entra antes no prompt (amostragem para o LLM). */
export function architectureSnippetPathPriority(path: string): number {
  const lower = path.replaceAll("\\", "/").toLowerCase();
  let score = 0;
  const base = lower.includes("/") ? lower.slice(lower.lastIndexOf("/") + 1) : lower;

  if (base === "pom.xml" || base === "build.gradle" || base === "build.gradle.kts" || base === "package.json") score += 120;
  if (lower.includes("web.xml") || lower.includes("application.yml") || lower.includes("application.yaml"))
    score += 95;
  if (lower.includes("persistence.xml") || lower.includes("spring.factories") || lower.includes("import.sql"))
    score += 85;
  if (lower.endsWith("application.properties") || lower.endsWith("hibernate.cfg.xml")) score += 80;
  if (/\.(java|kt|kts)$/.test(lower)) score += 42;
  if (/\.(jsp|jspx|xhtml|jsf|tag)$/.test(lower)) score += 38;
  if (/\.(tsx|jsx|vue|svelte)$/.test(lower)) score += 36;
  if (/\.(sql|ddl)$/.test(lower)) score += 32;
  if (/\.(xml|xsd|wsdl)$/.test(lower)) score += 26;
  if (/\.(yml|yaml|properties|json|toml)$/.test(lower)) score += 18;
  if (/\.(gradle|groovy|kts)$/.test(lower)) score += 22;
  if (lower.includes("/test/") || lower.includes("\\test\\") || lower.includes(".test.")) score -= 25;
  if (lower.includes("/target/") || lower.includes("/build/") || lower.includes("/dist/")) score -= 30;
  if (lower.includes(".min.") || lower.includes("-min.")) score -= 45;
  return score;
}

export function allIndexedPaths(snapshot: ParsedProjectSnapshot): string[] {
  const set = new Set<string>();
  for (const k of Object.keys(snapshot.snippets)) set.add(k);
  for (const k of Object.keys(snapshot.sources)) set.add(k);
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function buildCompactPathList(paths: string[], maxChars: number): { text: string; totalPaths: number; listedPaths: number } {
  let used = 0;
  const out: string[] = [];
  for (const p of paths) {
    const line = `${p}\n`;
    if (used + line.length > maxChars) break;
    out.push(p);
    used += line.length;
  }
  return { text: out.join("\n"), totalPaths: paths.length, listedPaths: out.length };
}

/**
 * Monta blocos Markdown de trechos até caber no orçamento, priorizando arquivos mais informativos.
 */
export function buildBudgetedSnippetsMarkdown(
  snippets: Record<string, string>,
  opts: { maxTotalChars: number; maxPerFileChars: number; maxFiles: number; priority: (path: string) => number },
): { text: string; filesIncluded: number; filesTotal: number } {
  const entries = Object.entries(snippets).sort((a, b) => {
    const d = opts.priority(b[0]) - opts.priority(a[0]);
    if (d !== 0) return d;
    return a[0].localeCompare(b[0], "pt-BR");
  });

  const parts: string[] = [];
  let used = 0;
  let count = 0;
  const filesTotal = entries.length;

  for (const [path, content] of entries) {
    if (count >= opts.maxFiles) break;
    const trimmed = content.slice(0, opts.maxPerFileChars);
    const truncated = content.length > opts.maxPerFileChars;
    const inner = truncated ? `${trimmed}\n… [trecho truncado para caber no contexto do modelo]` : trimmed;
    const block = `### ${path}\n\`\`\`\n${inner}\n\`\`\``;
    const next = used + block.length + (parts.length > 0 ? 2 : 0);
    if (next > opts.maxTotalChars) break;
    parts.push(block);
    used = next;
    count += 1;
  }

  return { text: parts.join("\n\n"), filesIncluded: count, filesTotal };
}
