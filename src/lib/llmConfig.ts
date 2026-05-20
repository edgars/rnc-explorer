export type LlmProvider = "openai" | "anthropic" | "gemini" | "custom";

export const ALL_LLM_PROVIDERS: LlmProvider[] = ["openai", "anthropic", "gemini", "custom"];

/** API keys per provider (stored in LocalStorage). */
export type LlmProviderKeys = {
  openai?: string;
  anthropic?: string;
  gemini?: string;
  /** Optional for local OpenAI-compatible servers. */
  custom?: string;
};

/** Preferred model id per provider. */
export type LlmProviderModels = {
  openai: string;
  anthropic: string;
  gemini: string;
  custom: string;
};

export type LlmConfig = {
  /** Provider used for analysis / doc regeneration. */
  provider: LlmProvider;
  keys: LlmProviderKeys;
  models: LlmProviderModels;
  temperature: number;
  customBaseUrl?: string;
};

export function defaultLlmConfig(): LlmConfig {
  return {
    provider: "openai",
    keys: {},
    models: {
      openai: "gpt-4o",
      anthropic: "claude-3-5-sonnet-20241022",
      gemini: "gemini-2.0-flash",
      custom: "llama3.1",
    },
    temperature: 0,
    customBaseUrl: "http://127.0.0.1:11434",
  };
}

export function defaultModelForProvider(provider: LlmProvider): string {
  switch (provider) {
    case "openai":
      return "gpt-4o";
    case "anthropic":
      return "claude-3-5-sonnet-20241022";
    case "gemini":
      return "gemini-2.0-flash";
    case "custom":
      return "llama3.1";
  }
}

/** Legacy flat shape before per-provider keys. */
type LegacyLlmConfig = {
  provider?: LlmProvider;
  apiKey?: string;
  model?: string;
  temperature?: number;
  customBaseUrl?: string;
};

export function normalizeLlmConfig(raw: unknown): LlmConfig {
  const base = defaultLlmConfig();
  if (!raw || typeof raw !== "object") return base;

  const o = raw as Record<string, unknown>;

  if (o.keys && typeof o.keys === "object") {
    const c = raw as Partial<LlmConfig>;
    const mergedModels = {
      ...base.models,
      ...(typeof c.models === "object" && c.models !== null ? (c.models as LlmProviderModels) : {}),
    };
    return {
      ...base,
      ...c,
      provider: (c.provider ?? base.provider) as LlmProvider,
      keys: { ...base.keys, ...(c.keys as LlmProviderKeys) },
      models: mergedModels,
      temperature: typeof c.temperature === "number" ? c.temperature : base.temperature,
      customBaseUrl: c.customBaseUrl ?? base.customBaseUrl,
    };
  }

  const l = raw as LegacyLlmConfig;
  const provider = (l.provider ?? "openai") as LlmProvider;
  const keys: LlmProviderKeys = { ...base.keys };
  const k = typeof l.apiKey === "string" ? l.apiKey : "";
  if (k.trim()) {
    if (provider === "openai") keys.openai = k;
    else if (provider === "anthropic") keys.anthropic = k;
    else if (provider === "gemini") keys.gemini = k;
    else keys.custom = k;
  }
  const models = { ...base.models };
  if (typeof l.model === "string" && l.model.trim()) {
    if (provider === "openai") models.openai = l.model;
    else if (provider === "anthropic") models.anthropic = l.model;
    else if (provider === "gemini") models.gemini = l.model;
    else models.custom = l.model;
  }
  return {
    provider,
    keys,
    models,
    temperature: typeof l.temperature === "number" ? l.temperature : base.temperature,
    customBaseUrl: l.customBaseUrl ?? base.customBaseUrl,
  };
}

export function providerHasKey(cfg: LlmConfig, p: LlmProvider): boolean {
  switch (p) {
    case "openai":
      return !!cfg.keys.openai?.trim();
    case "anthropic":
      return !!cfg.keys.anthropic?.trim();
    case "gemini":
      return !!cfg.keys.gemini?.trim();
    case "custom":
      return !!cfg.customBaseUrl?.trim();
  }
}

export function isActiveProviderReady(cfg: LlmConfig): boolean {
  return providerHasKey(cfg, cfg.provider);
}

/** Resolved credentials for the active provider run. */
export function coerceLlmConfig(cfg: LlmConfig): LlmConfig {
  const ready = ALL_LLM_PROVIDERS.filter((p) => providerHasKey(cfg, p));
  if (!ready.length) return cfg;
  if (!ready.includes(cfg.provider)) {
    const p = ready[0]!;
    return {
      ...cfg,
      provider: p,
      models: { ...cfg.models, [p]: cfg.models[p] || defaultModelForProvider(p) },
    };
  }
  return cfg;
}

export function getActiveApiContext(cfg: LlmConfig): {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
} {
  const model = cfg.models[cfg.provider];
  switch (cfg.provider) {
    case "openai":
      return { provider: "openai", apiKey: cfg.keys.openai?.trim() ?? "", model };
    case "anthropic":
      return { provider: "anthropic", apiKey: cfg.keys.anthropic?.trim() ?? "", model };
    case "gemini":
      return { provider: "gemini", apiKey: cfg.keys.gemini?.trim() ?? "", model };
    case "custom":
      return {
        provider: "custom",
        apiKey: cfg.keys.custom?.trim() ?? "",
        model,
        baseUrl: cfg.customBaseUrl?.trim() || "http://127.0.0.1:11434",
      };
  }
}
