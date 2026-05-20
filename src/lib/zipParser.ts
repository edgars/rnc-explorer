import JSZip from "jszip";
import type { FileTreeNode, ParsedProjectSnapshot } from "@/lib/architecture";
import { logger } from "@/lib/logger";

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "out",
  "target",
  "bin",
  "obj",
  ".idea",
  ".vs",
  "__pycache__",
  ".gradle",
  "vendor",
]);

const BINARY_OR_MEDIA_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".svg",
  ".pdf",
  ".zip",
  ".7z",
  ".rar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".jar",
  ".war",
  ".ear",
  ".class",
  ".o",
  ".a",
  ".lib",
  ".pdb",
  ".mdb",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp3",
  ".mp4",
  ".avi",
  ".mov",
]);

const LEGACY_MODERN_TEXT_EXT = new Set([
  ".pas",
  ".dfm",
  ".dpr",
  ".inc",
  ".frm",
  ".bas",
  ".cls",
  ".vb",
  ".vbs",
  ".cs",
  ".csproj",
  ".vbproj",
  ".sln",
  ".php",
  ".phtml",
  ".java",
  ".kt",
  ".xml",
  ".xaml",
  ".sql",
  ".pls",
  ".pks",
  ".pkb",
  ".jsp",
  ".jspf",
  ".tag",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".yaml",
  ".yml",
  ".md",
  ".properties",
  ".config",
  ".ini",
  ".bat",
  ".cmd",
  ".sh",
  ".ps1",
  ".rb",
  ".py",
  ".go",
  ".rs",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".swift",
  ".dart",
]);

const MAX_TEXT_BYTES = 48_000;
const MAX_SNIPPET_CHARS = 4_000;
const MAX_TOTAL_SNIPPET_BUDGET = 900_000;
const MAX_SOURCE_PER_FILE = 280_000;
const MAX_TOTAL_SOURCES_CHARS = 3_200_000;

function splitPath(p: string): string[] {
  return p.split("/").filter(Boolean);
}

function getExtension(name: string): string {
  const i = name.lastIndexOf(".");
  if (i <= 0) return "";
  return name.slice(i).toLowerCase();
}

function shouldSkipPath(segments: string[]): boolean {
  return segments.some((s) => SKIP_DIR_NAMES.has(s.toLowerCase()));
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

type FlatFile = { path: string; extension: string; size: number };

type ReadOk = { path: string; extension: string; text: string };

export async function parseProjectZip(file: File, onProgress?: (stepIndex: number) => void): Promise<ParsedProjectSnapshot> {
  logger.debug("ZIP parse start", { name: file.name, sizeBytes: file.size });
  onProgress?.(0);
  logger.debug("ZIP parse step 0: load archive");
  const zip = await JSZip.loadAsync(file);
  const flat: FlatFile[] = [];
  let totalFiles = 0;

  onProgress?.(1);
  logger.debug("ZIP parse step 1: scan entries");
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    totalFiles += 1;
    const norm = relativePath.replaceAll("\\", "/");
    const segments = splitPath(norm);
    if (shouldSkipPath(segments)) return;

    const name = segments[segments.length - 1] ?? norm;
    const ext = getExtension(name);
    if (BINARY_OR_MEDIA_EXT.has(ext)) return;

    const size = (() => {
      const e = entry as unknown as { uncompressedSize?: number; _data?: { uncompressedSize?: number } };
      if (typeof e.uncompressedSize === "number" && e.uncompressedSize >= 0) return e.uncompressedSize;
      const u = e._data?.uncompressedSize;
      return typeof u === "number" && u >= 0 ? u : 0;
    })();

    if (size > 2_000_000 && !LEGACY_MODERN_TEXT_EXT.has(ext)) {
      return;
    }

    flat.push({ path: norm, extension: ext || "(no ext)", size });
  });

  const extensionsHistogram: Record<string, number> = {};
  for (const f of flat) {
    extensionsHistogram[f.extension] = (extensionsHistogram[f.extension] ?? 0) + 1;
  }

  const tasks: Promise<ReadOk | null>[] = [];

  for (const f of flat) {
    if (!LEGACY_MODERN_TEXT_EXT.has(f.extension) && f.size > MAX_TEXT_BYTES) {
      continue;
    }

    const entry = zip.file(f.path);
    if (!entry) continue;

    tasks.push(
      (async (): Promise<ReadOk | null> => {
        try {
          const text = await entry.async("string");
          if (!text || text.includes("\u0000")) return null;
          return { path: f.path, extension: f.extension, text };
        } catch {
          return null;
        }
      })(),
    );
  }

  onProgress?.(2);
  logger.debug("ZIP parse step 2: read text files", { taskCount: tasks.length });
  const settled = await Promise.all(tasks);
  const results = settled.filter((x): x is ReadOk => x !== null).sort((a, b) => a.path.localeCompare(b.path));

  onProgress?.(3);
  logger.debug("ZIP parse step 3: build tree & metrics");
  const linesByPath: Record<string, number> = {};
  const linesByExtension: Record<string, number> = {};
  let totalLinesOfCode = 0;

  for (const r of results) {
    const lines = countLines(r.text);
    linesByPath[r.path] = lines;
    linesByExtension[r.extension] = (linesByExtension[r.extension] ?? 0) + lines;
    totalLinesOfCode += lines;
  }

  const snippets: Record<string, string> = {};
  const sources: Record<string, string> = {};
  let snippetBudget = MAX_TOTAL_SNIPPET_BUDGET;
  let sourceBudget = MAX_TOTAL_SOURCES_CHARS;

  for (const r of results) {
    const sn = r.text.slice(0, MAX_SNIPPET_CHARS);
    if (snippetBudget - sn.length >= 0) {
      snippets[r.path] = sn;
      snippetBudget -= sn.length;
    }
    const cap = r.text.slice(0, MAX_SOURCE_PER_FILE);
    if (sourceBudget - cap.length >= 0) {
      sources[r.path] = cap;
      sourceBudget -= cap.length;
    }
  }

  const tree = buildTree(results.map((r) => r.path));

  logger.debug("ZIP parse complete", {
    zipName: file.name,
    totalFiles,
    includedFiles: results.length,
    totalLinesOfCode,
  });
  return {
    zipName: file.name,
    totalFiles,
    includedFiles: results.length,
    tree,
    snippets,
    sources,
    linesByPath,
    linesByExtension,
    totalLinesOfCode,
    extensionsHistogram,
  };
}

function buildTree(paths: string[]): FileTreeNode {
  const root: FileTreeNode = { name: "/", path: "", type: "dir", children: [] };

  for (const p of paths) {
    const segments = splitPath(p);
    let cursor = root;
    let acc = "";
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i]!;
      acc = acc ? `${acc}/${seg}` : seg;
      const isFile = i === segments.length - 1;
      if (!cursor.children) cursor.children = [];

      let next = cursor.children.find((c) => c.name === seg);
      if (!next) {
        next = {
          name: seg,
          path: acc,
          type: isFile ? "file" : "dir",
          extension: isFile ? getExtension(seg) : undefined,
          children: isFile ? undefined : [],
        };
        cursor.children.push(next);
      }
      cursor = next;
    }
  }

  const sortChildren = (n: FileTreeNode) => {
    if (!n.children) return;
    n.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of n.children) sortChildren(c);
  };
  sortChildren(root);
  return root;
}

export function fileTreeToString(node: FileTreeNode, indent = ""): string {
  const lines: string[] = [];
  const label = node.type === "dir" ? `${node.name}/` : node.name;
  if (node.path) lines.push(`${indent}- ${label}`);
  if (node.children) {
    for (const c of node.children) {
      lines.push(fileTreeToString(c, `${indent}  `));
    }
  }
  return lines.join("\n");
}
