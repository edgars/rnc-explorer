import {
  architectureAnalysisSchema,
  documentationBundleSchema,
  normalizeArchitectureAnalysis,
  type ArchitectureAnalysis,
  type DocumentationBundle,
  type ParsedProjectSnapshot,
} from "@/lib/architecture";
import {
  allIndexedPaths,
  architectureSnippetPathPriority,
  ARCH_MAX_CHARS_PER_SNIPPET,
  ARCH_MAX_SNIPPET_FILES,
  ARCH_PATH_LIST_MAX_CHARS,
  ARCH_SNIPPET_SECTION_MAX_CHARS,
  ARCH_TREE_MAX_LINES,
  buildBudgetedSnippetsMarkdown,
  buildCompactPathList,
  DOCS_MAX_CHARS_PER_SNIPPET,
  DOCS_MAX_SNIPPET_FILES,
  DOCS_PATH_LIST_MAX_CHARS,
  DOCS_SNIPPET_SECTION_MAX_CHARS,
  DOCS_TREE_MAX_LINES,
} from "@/lib/llmPromptBudget";
import { fileTreeToStringBounded } from "@/lib/zipParser";
import type { LlmConfig } from "@/lib/llmConfig";
import { getActiveApiContext } from "@/lib/llmConfig";
import { anthropicApiBaseUrl, geminiGenerativeBaseUrl, openAiChatBaseUrl } from "@/lib/llmUpstream";
import { logger } from "@/lib/logger";
import { z } from "zod";

export type { LlmConfig, LlmProvider } from "@/lib/llmConfig";

const documentationOnlySchema = z.object({
  documentation: documentationBundleSchema,
});

export function buildArchitecturePrompt(snapshot: ParsedProjectSnapshot): { system: string; user: string } {
  const treeText = fileTreeToStringBounded(snapshot.tree, ARCH_TREE_MAX_LINES);
  const topExtensions = Object.entries(snapshot.extensionsHistogram)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([ext, n]) => `${ext}: ${n}`)
    .join(", ");

  const allPaths = allIndexedPaths(snapshot);
  const pathBlock = buildCompactPathList(allPaths, ARCH_PATH_LIST_MAX_CHARS);
  const snippetPack = buildBudgetedSnippetsMarkdown(snapshot.snippets, {
    maxTotalChars: ARCH_SNIPPET_SECTION_MAX_CHARS,
    maxPerFileChars: ARCH_MAX_CHARS_PER_SNIPPET,
    maxFiles: ARCH_MAX_SNIPPET_FILES,
    priority: architectureSnippetPathPriority,
  });
  const snippetsText = snippetPack.text;

  const pathListNote =
    pathBlock.listedPaths < pathBlock.totalPaths
      ? `\n(Nota: a lista acima contém ${pathBlock.listedPaths} de ${pathBlock.totalPaths} caminhos indexados, por limite de contexto. Em fileAnalysisDetails, prefira chaves que apareçam aqui ou caminhos inequívocos nos trechos.)`
      : "";
  const snippetNote =
    snippetPack.filesIncluded < snippetPack.filesTotal
      ? `\n(Nota: trechos de ${snippetPack.filesIncluded} arquivo(s), escolhidos por prioridade entre ${snippetPack.filesTotal} com amostra local; infira o restante pela árvore e pelos caminhos.)`
      : "";

  logger.debug("buildArchitecturePrompt sizes", {
    treeChars: treeText.length,
    pathListChars: pathBlock.text.length,
    pathsListed: pathBlock.listedPaths,
    pathsTotal: pathBlock.totalPaths,
    snippetChars: snippetsText.length,
    snippetFiles: snippetPack.filesIncluded,
    snippetFilesTotal: snippetPack.filesTotal,
  });

  const system = `Você é um arquiteto de software sênior. Analise o snapshot do repositório enviado e infira arquitetura, métricas, documentação e insights por arquivo.

Idioma: TODO o conteúdo legível por humanos deve estar em português do Brasil (pt-BR): projectName, summary, labels e descriptions dos nós macro e micro, campos de documentation em Markdown, purpose, businessRules em fileAnalysisDetails, textos explicativos. Nomes técnicos de APIs/frameworks podem permanecer no original.

Você DEVE classificar componentes em exatamente cinco camadas macro com estes ids (somente estes ids, minúsculos):
1) ui — UI / telas: JSP, JSF/Facelets/XHTML, Struts/JSTL, Swing/JavaFX, Thymeleaf, páginas web; Delphi (.dfm, formulários VCL/FMX); Oracle Forms (.fmb, .mmb, canvas/blocks quando inferível); WinForms/WPF; qualquer template de view.
2) bll — Lógica de negócio: EJB stateless/stateful (3.x), serviços Spring @Service, CDI beans de aplicação, controladores que orquestram regras, managers Delphi, packages PL/SQL de negócio quando claramente regra (não só DDL).
3) model — Modelos e entidades: JPA/Hibernate entities, EJB 2.x Entity Beans (CMP/BMP) quando aparecerem, DTOs, value objects, classes de domínio Delphi, tipos de contrato.
4) dal — Acesso a dados em código: JDBC (PreparedStatement, DAO), repositórios Spring Data, MyBatis/iBATIS mappers XML/Java, JdbcTemplate, FireDAC/ADO em Delphi apontando para SQL dinâmico, clientes ORM fora de entidades puras.
5) database — Persistência declarativa e scripts: SQL .sql, DDL/DML em migrações (Flyway/Liquibase), scripts Oracle/Sybase, ORM mapping só XML (hbm/orm.xml) quando for definição de persistência, procedures/functions puramente de schema quando o foco for dados.

Heurísticas importantes para stacks Java enterprise:
- Separe JSP/JSF/XHTML (ui) de Session Beans / @Stateless que contêm regra (bll) e de @Entity/JPA (model).
- JDBC explícito, DAOs e mappers MyBatis → dal; entidades JPA e EJB Entity → model.
- Arquivos persistence.xml, orm.xml, hbm → podem ser database ou dal conforme o conteúdo (definição de tabelas → database; queries nomeadas só ligação → dal).

Delphi e Oracle Forms:
- .pas/.dpr com regra → bll; .dfm/.lfm ligados a UI → ui; DataModules com queries → dal ou model conforme contenham SQL/fields.
- .fmb/.mmb/.pll Oracle Forms → preferencialmente ui (formulário) ou bll se forem apenas bibliotecas de código sem tela (use descrição no micro-nó).

Scripts DDL e dados:
- Qualquer CREATE/ALTER/DROP TABLE, índices, constraints, seeds massivos em .sql → database.
- packages .pks/.pkb com corpo misto: se maior parte DDL/catalog → database; se procedures de negócio → bll/dal conforme uso de SQL.

Regras do grafo macro:
- Retorne graph.macro como array de 5 objetos, um por id acima em qualquer ordem, cada um com id, label legível em pt-BR (o nome do campo DEVE ser exatamente \`label\`; você pode enviar \`title\` ou \`name\` como fallback), e dependencies[] listando outros ids macro dos quais esta camada depende.
- As dependências devem refletir fluxo realista de chamada/dados (ex.: ui -> bll, bll -> model/dal, dal -> database).

Regras do grafo micro:
- Para cada id macro, preencha graph.micro[esseId] com componentes representativos inferidos a partir de nomes de arquivos e trechos.
- Cada item micro: { id, label, description, dependencies, sourcePath? } onde dependencies lista outros ids micro (ou apenas ids macro se absolutamente necessário). sourcePath DEVE ser um caminho exato relativo ao repositório a partir de FILE_PATH_LIST quando o nó mapeia para um arquivo principal.
- Prefira ids estáveis como "frm_login" ou "svc_auth"; mantenha ids únicos em todo o grafo micro.
- Se uma camada não tiver arquivos claros, retorne array vazio para essa chave.

Métricas (campo metrics):
- totalLinesOfCode: total aproximado de linhas nos arquivos de texto analisados; alinhe com a dica CLIENT_TOTAL_LOC quando razoável.
- complexityScore: exatamente um destes valores (inglês, para o parser): "Low", "Medium" ou "High" — use Low para baixa complexidade, Medium para média, High para alta, com base em aninhamento, ramificações e acoplamento visível nos trechos.
- totalTablesAccessed: estimativa de tabelas/views distintas tocadas a partir de trechos SQL/DAL.
- totalBusinessRules: quantidade de validações/fluxos distintos inferidos em arquivos de BLL.
- totalEntities: quantidade de classes modelo/DTO/entidade distintas inferidas.

Documentação (campo documentation) — strings Markdown estilo GitHub (sem JSON dentro do markdown):
- techOverview: linguagens, frameworks, layout, dicas de build.
- appPurpose: resumo executivo do que a aplicação faz para o negócio.
- actors: perfis de usuário/papéis/permissões implícitos pela UI e BLL.
- intents: objetivos operacionais, fluxos de trabalho.
- databaseAccessStyle: SQL embutido vs procedures vs ORMs (Hibernate, EclipseLink, OpenJPA, MyBatis, jOOQ, TopLink, JDO, EF, FireDAC etc.), JDBC direto, EJB Entity/CMP, uso de JSP/JSF com backing beans, Oracle Forms runtime, Delphi BDE/FireDAC; cite DDL/migrações na camada database quando existirem.
- externalIntegrations: REST/SOAP/XML-RPC, clientes HTTP, WSDL, webhooks.

fileAnalysisDetails: mapa com chaves EXATAS de caminhos listados em FILE_PATH_LIST quando possível (o máximo que conseguir, priorize entrypoints e módulos grandes). Se a lista estiver parcial por limite de contexto, priorize arquivos citados nos trechos. Cada valor:
{ "purpose": string, "layer": "ui"|"bll"|"model"|"dal"|"database", "businessRules": string[] }

A saída DEVE ser um único objeto JSON (sem envolver o JSON em blocos \`\`\` Markdown, sem comentário fora do JSON) com as chaves:
projectName, detectedLanguages, summary, metrics, documentation, graph, fileAnalysisDetails`;

  const user = `ZIP: ${snapshot.zipName}
Estatísticas: entradas no zip=${snapshot.totalFiles}, arquivos de texto analisados=${snapshot.includedFiles}
CLIENT_TOTAL_LOC (do analisador): ${snapshot.totalLinesOfCode}
Histograma de extensões (top): ${topExtensions || "n/d"}

FILE_PATH_LIST (use estas strings exatas como chaves em fileAnalysisDetails quando possível):
${pathBlock.text || "(nenhum)"}${pathListNote}

Árvore de diretórios (arquivos analisados, pode estar resumida):
${treeText || "(vazio)"}

Trechos de código (amostra priorizada e limitada ao contexto do modelo):
${snippetsText || "(sem trechos)"}${snippetNote}

Instruções adicionais de stack (use ao classificar micro-nós e fileAnalysisDetails):
- Java enterprise: discrimine JSP/JSF/Facelets, Servlets, EJBs (session/entity/message), JDBC cru, Spring (MVC, Data, JDBC), ORMs (Hibernate/JPA, EclipseLink, MyBatis), configuração JPA (persistence.xml, orm.xml).
- Delphi: units .pas com UI vs DataModule vs regra; conexões FireDAC/BDE; .dfm como UI.
- Oracle Forms: .fmb/.mmb/.pll como UI ou bibliotecas de apresentação; SQL embutido em triggers de bloco → dal/bll conforme o papel.
- Scripts DDL (CREATE/ALTER, migrações) → camada database; pacotes PL/SQL com corpo de negócio → bll ou dal conforme evidência.`;

  return { system, user };
}

export function buildDocumentationRefreshPrompt(snapshot: ParsedProjectSnapshot, analysis: ArchitectureAnalysis): { system: string; user: string } {
  const treeText = fileTreeToStringBounded(snapshot.tree, DOCS_TREE_MAX_LINES);
  const allPaths = allIndexedPaths(snapshot);
  const pathBlock = buildCompactPathList(allPaths, DOCS_PATH_LIST_MAX_CHARS);
  const snippetPack = buildBudgetedSnippetsMarkdown(snapshot.snippets, {
    maxTotalChars: DOCS_SNIPPET_SECTION_MAX_CHARS,
    maxPerFileChars: DOCS_MAX_CHARS_PER_SNIPPET,
    maxFiles: DOCS_MAX_SNIPPET_FILES,
    priority: architectureSnippetPathPriority,
  });
  const snippetsText = snippetPack.text;
  const pathListNote =
    pathBlock.listedPaths < pathBlock.totalPaths
      ? `\n(Nota: ${pathBlock.listedPaths} de ${pathBlock.totalPaths} caminhos listados por limite de contexto.)`
      : "";
  const snippetNote =
    snippetPack.filesIncluded < snippetPack.filesTotal
      ? `\n(Nota: trechos de ${snippetPack.filesIncluded} de ${snippetPack.filesTotal} arquivos com amostra.)`
      : "";

  logger.debug("buildDocumentationRefreshPrompt sizes", {
    treeChars: treeText.length,
    pathListChars: pathBlock.text.length,
    snippetChars: snippetsText.length,
  });

  const system = `Você atualiza a documentação técnica de uma base já analisada. Produza um único objeto JSON com APENAS a chave "documentation" contendo seis strings em Markdown:
techOverview, appPurpose, actors, intents, databaseAccessStyle, externalIntegrations.
Use Markdown com títulos e listas. Todo o texto em português do Brasil. Não envolva o JSON em blocos \`\`\` Markdown.`;

  const user = `Resumo existente: ${analysis.summary}
Linguagens detectadas: ${analysis.detectedLanguages.join(", ")}

FILE_PATH_LIST:
${pathBlock.text || "(nenhum)"}${pathListNote}

Árvore (pode estar resumida):
${treeText}

Trechos (amostra priorizada):
${snippetsText}${snippetNote}`;

  return { system, user };
}

export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/im;
  const m = trimmed.match(fence);
  if (m?.[1]) return m[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function openAiOutputLimitFields(model: string): Record<string, number> {
  const m = model.toLowerCase();
  if (/^o[0-9]/i.test(m) || m.startsWith("gpt-5") || m.includes("o4-mini") || m.includes("o3-mini")) {
    return { max_completion_tokens: 16384 };
  }
  return { max_tokens: 16384 };
}

async function callOpenAIChatCompletions(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  system: string;
  user: string;
  strictJson: boolean;
  signal?: AbortSignal;
}): Promise<string> {
  const url = `${opts.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  logger.debug("LLM OpenAI-compatible request", { url, model: opts.model, strictJson: opts.strictJson });
  const res = await fetch(url, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "Content-Type": "application/json",
      ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: opts.temperature,
      ...openAiOutputLimitFields(opts.model),
      ...(opts.strictJson ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: `${opts.user}\n\nRetorne APENAS JSON válido.` },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    logger.error("LLM OpenAI-compatible HTTP error", { status: res.status, bodyPreview: t.slice(0, 800) });
    throw new Error(`OpenAI-compatible error ${res.status}: ${t || res.statusText}`);
  }
  const data: unknown = await res.json();
  if (!data || typeof data !== "object") throw new Error("Invalid OpenAI-compatible response JSON.");
  const d = data as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = d.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    logger.error("LLM OpenAI-compatible: empty message content", { model: opts.model });
    throw new Error("Empty model content (OpenAI-compatible).");
  }
  logger.debug("LLM OpenAI-compatible: response chars", content.length);
  return content;
}

async function callAnthropic(opts: {
  apiKey: string;
  model: string;
  temperature: number;
  system: string;
  user: string;
  baseUrl: string;
  signal?: AbortSignal;
}): Promise<string> {
  const url = `${opts.baseUrl.replace(/\/$/, "")}/v1/messages`;
  logger.debug("LLM Anthropic request", { url, model: opts.model });
  const res = await fetch(url, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 16384,
      temperature: opts.temperature,
      system: opts.system,
      messages: [{ role: "user", content: `${opts.user}\n\nRetorne APENAS JSON válido (sem markdown).` }],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    logger.error("LLM Anthropic HTTP error", { status: res.status, bodyPreview: t.slice(0, 800) });
    throw new Error(`Anthropic error ${res.status}: ${t || res.statusText}`);
  }
  const data: unknown = await res.json();
  if (!data || typeof data !== "object") throw new Error("Invalid Anthropic response JSON.");
  const d = data as { content?: Array<{ type?: string; text?: string }> };
  const content = (d.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
  if (!content.trim()) {
    logger.error("LLM Anthropic: empty text blocks", { model: opts.model });
    throw new Error("Empty model content (Anthropic).");
  }
  logger.debug("LLM Anthropic: response chars", content.length);
  return content;
}

async function callGemini(opts: {
  apiKey: string;
  model: string;
  temperature: number;
  system: string;
  user: string;
  baseUrl: string;
  signal?: AbortSignal;
}): Promise<string> {
  const modelId = opts.model.replace(/^models\//, "");
  const url = `${opts.baseUrl.replace(/\/$/, "")}/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const safeUrl = url.replace(/key=[^&]+/, "key=***");
  logger.debug("LLM Gemini request", { url: safeUrl, model: modelId });
  const res = await fetch(url, {
    method: "POST",
    signal: opts.signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [
        {
          role: "user",
          parts: [{ text: `${opts.user}\n\nRetorne APENAS JSON válido (sem blocos \`\`\` Markdown ao redor).\n` }],
        },
      ],
      generationConfig: {
        temperature: opts.temperature,
        maxOutputTokens: 65536,
        responseMimeType: "application/json",
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    logger.error("LLM Gemini HTTP error", { status: res.status, bodyPreview: t.slice(0, 800) });
    throw new Error(`Gemini error ${res.status}: ${t || res.statusText}`);
  }
  const data: unknown = await res.json();
  const d = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    error?: { message?: string; code?: number };
    promptFeedback?: { blockReason?: string };
  };
  if (d.error?.message) {
    logger.error("LLM Gemini API error field", d.error);
    throw new Error(`Gemini: ${d.error.message}`);
  }
  if (d.promptFeedback?.blockReason) {
    logger.error("LLM Gemini prompt blocked", d.promptFeedback);
    throw new Error(`Gemini blocked the prompt (${d.promptFeedback.blockReason}).`);
  }
  const text = d.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  if (!text.trim()) {
    const reason = d.candidates?.[0]?.finishReason ?? "unknown";
    logger.error("LLM Gemini: empty candidates text", { finishReason: reason, model: modelId });
    throw new Error(
      `Empty Gemini response (finishReason=${reason}). Try another model or shorten the ZIP; very large prompts can exceed context.`,
    );
  }
  logger.debug("LLM Gemini: response chars", text.length);
  return text;
}

async function dispatchLlmCall(
  cfg: LlmConfig,
  system: string,
  user: string,
  jsonStrictOpenAI: boolean,
  signal?: AbortSignal,
): Promise<string> {
  const ctx = getActiveApiContext(cfg);
  logger.debug("LLM dispatch", {
    provider: ctx.provider,
    model: ctx.model,
    baseUrl: ctx.provider === "custom" ? (ctx.baseUrl ?? "(default)") : "(cloud / proxy)",
  });
  if (ctx.provider === "anthropic") {
    return callAnthropic({
      apiKey: ctx.apiKey,
      model: ctx.model,
      temperature: cfg.temperature,
      system,
      user,
      baseUrl: anthropicApiBaseUrl(),
      signal,
    });
  }
  if (ctx.provider === "gemini") {
    return callGemini({
      apiKey: ctx.apiKey,
      model: ctx.model,
      temperature: cfg.temperature,
      system,
      user,
      baseUrl: geminiGenerativeBaseUrl(),
      signal,
    });
  }
  const baseUrl = ctx.provider === "custom" ? (ctx.baseUrl ?? "http://127.0.0.1:11434") : openAiChatBaseUrl();
  return callOpenAIChatCompletions({
    baseUrl,
    apiKey: ctx.apiKey,
    model: ctx.model,
    temperature: cfg.temperature,
    system,
    user,
    strictJson: jsonStrictOpenAI && ctx.provider === "openai",
    signal,
  });
}

export async function runArchitectureAnalysis(
  snapshot: ParsedProjectSnapshot,
  cfg: LlmConfig,
  signal?: AbortSignal,
  onProgress?: (stepIndex: number) => void,
): Promise<ArchitectureAnalysis> {
  onProgress?.(0);
  const { system, user } = buildArchitecturePrompt(snapshot);
  signal?.throwIfAborted();

  onProgress?.(1);
  const rawText = await dispatchLlmCall(cfg, system, user, true, signal);
  signal?.throwIfAborted();

  onProgress?.(2);
  const jsonText = extractJsonObject(rawText);
  logger.debug("Architecture analysis: extracted JSON chars", jsonText.length);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    logger.error("Architecture analysis: JSON.parse failed", { preview: jsonText.slice(0, 500), error: e });
    throw e;
  }

  const validated = architectureAnalysisSchema.safeParse(parsed);
  if (!validated.success) {
    logger.error("Architecture analysis: schema validation failed", validated.error.flatten(), validated.error.issues);
    throw validated.error;
  }

  logger.debug("Architecture analysis: OK", { projectName: validated.data.projectName });
  return normalizeArchitectureAnalysis(validated.data);
}

export async function runDocumentationRegeneration(
  snapshot: ParsedProjectSnapshot,
  analysis: ArchitectureAnalysis,
  cfg: LlmConfig,
  signal?: AbortSignal,
  onProgress?: (stepIndex: number) => void,
): Promise<DocumentationBundle> {
  onProgress?.(0);
  const { system, user } = buildDocumentationRefreshPrompt(snapshot, analysis);
  signal?.throwIfAborted();

  onProgress?.(1);
  const rawText = await dispatchLlmCall(cfg, system, user, true, signal);
  signal?.throwIfAborted();

  onProgress?.(2);
  const jsonText = extractJsonObject(rawText);
  logger.debug("Documentation regen: extracted JSON chars", jsonText.length);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    logger.error("Documentation regen: JSON.parse failed", { preview: jsonText.slice(0, 500), error: e });
    throw e;
  }

  const validated = documentationOnlySchema.safeParse(parsed);
  if (!validated.success) {
    logger.error("Documentation regen: schema validation failed", validated.error.flatten(), validated.error.issues);
    throw validated.error;
  }

  logger.debug("Documentation regen: OK");
  return validated.data.documentation;
}
