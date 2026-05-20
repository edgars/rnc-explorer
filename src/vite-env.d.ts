/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_BASE?: string;
  readonly VITE_ANTHROPIC_API_BASE?: string;
  readonly VITE_GEMINI_API_BASE?: string;
}
