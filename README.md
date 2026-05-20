# ArchLens AI

Single-page React application that ingests a project `.zip` in the browser, extracts a **file tree**, **LLM-sized snippets**, and **bounded full source** with [`jszip`](https://stuk.github.io/jszip/), calls an LLM using your own API key, and visualizes a **macro → micro** dependency graph with [`@xyflow/react`](https://reactflow.dev/).

## Stack

- React + TypeScript + Vite
- Tailwind CSS + shadcn-style Radix UI primitives (Tabs, Accordion, ScrollArea, Dialog, Sheet, Card, Progress, Table, Alert, …)
- `react-markdown` + `remark-gfm` for documentation rendering
- Local persistence via `localStorage` (namespaced per **tenant id** for multi-tenant readiness)

## Features

- **Graph** — Macro layers + drill-down micro graph; click a micro node to open the file inspector when paths resolve.
- **File explorer** — Sidebar tree; click a file to open the **Sheet** inspector with `<pre>` source and AI metadata (`fileAnalysisDetails`).
- **Documentation** — Six Markdown reports (tech stack, purpose, actors, intents, DB access style, integrations); optional **Regenerate** LLM pass.
- **Metrics** — Client LoC by extension, model metrics, complexity gauge, layer distribution from `fileAnalysisDetails`.

## Getting started

```bash
npm install
npm run dev
```

## LLM providers

- **OpenAI** — `https://api.openai.com/v1/chat/completions` with JSON mode when supported. Browser calls are proxied in **`npm run dev`** (see `vite.config.ts`) because OpenAI does not send CORS headers to arbitrary web origins.
- **Anthropic** — Messages API; same dev proxy pattern as OpenAI.
- **Google Gemini** — `generativelanguage.googleapis.com` `v1beta` `generateContent` with JSON MIME type; dev proxy available. Large architecture JSON uses high `maxOutputTokens` and relaxed safety thresholds for code analysis.
- **Custom / Ollama** — OpenAI-compatible chat completions on your base URL (Ollama commonly serves `/v1/chat/completions`).

### Production / `npm run preview`

`vite preview` does not apply the dev server `proxy`. For static builds, either:

- Put a **same-origin reverse proxy** in front of the app and set `VITE_OPENAI_API_BASE`, `VITE_ANTHROPIC_API_BASE`, and/or `VITE_GEMINI_API_BASE` (see `.env.example`), or
- Call models only through **Custom** pointing at your own gateway that adds CORS.

## Security note

API keys are stored in **LocalStorage** for convenience. This is not encrypted secret storage—treat keys accordingly.

## Build

```bash
npm run build
npm run preview
```
