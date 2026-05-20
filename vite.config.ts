import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const llmDevProxy = {
  "/__archlens/openai": {
    target: "https://api.openai.com",
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/__archlens\/openai/, ""),
  },
  "/__archlens/anthropic": {
    target: "https://api.anthropic.com",
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/__archlens\/anthropic/, ""),
  },
  "/__archlens/google-generative": {
    target: "https://generativelanguage.googleapis.com",
    changeOrigin: true,
    secure: true,
    rewrite: (path: string) => path.replace(/^\/__archlens\/google-generative/, ""),
  },
} as const;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: { ...llmDevProxy },
  },
  preview: {
    proxy: { ...llmDevProxy },
  },
});