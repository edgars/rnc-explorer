/**
 * Resolves upstream API origins for LLM calls.
 *
 * OpenAI and Anthropic do not allow browser CORS from arbitrary origins. In Vite dev we use
 * `server.proxy` paths (see `vite.config.ts`). In production, set same-origin proxy paths via env.
 */
const OPENAI_DEFAULT = "https://api.openai.com";
const ANTHROPIC_DEFAULT = "https://api.anthropic.com";
const GEMINI_DEFAULT = "https://generativelanguage.googleapis.com";

export function openAiChatBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_OPENAI_API_BASE?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) return "/__archlens/openai";
  return OPENAI_DEFAULT;
}

export function anthropicApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_ANTHROPIC_API_BASE?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) return "/__archlens/anthropic";
  return ANTHROPIC_DEFAULT;
}

export function geminiGenerativeBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_GEMINI_API_BASE?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) return "/__archlens/google-generative";
  return GEMINI_DEFAULT;
}
