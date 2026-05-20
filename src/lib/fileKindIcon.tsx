import type { LucideIcon } from "lucide-react";
import {
  Braces,
  Coffee,
  Database,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileJson,
  FileKey2,
  FileText,
  FileType,
  Globe,
  Image,
  LayoutTemplate,
  ScrollText,
  Settings,
  Table2,
} from "lucide-react";

/** Extensão com ponto, ex.: ".java" */
export function fileExtension(path: string): string {
  const i = path.lastIndexOf(".");
  if (i <= 0 || i === path.length - 1) return "";
  return path.slice(i).toLowerCase();
}

export function fileKindIcon(path: string): LucideIcon {
  const ext = fileExtension(path);
  const lower = path.toLowerCase();

  if (lower.endsWith(".zip") || lower.endsWith(".jar") || lower.endsWith(".war") || lower.endsWith(".ear")) return FileArchive;
  if (ext === ".sql" || ext === ".ddl" || ext === ".dml" || ext === ".pks" || ext === ".pkb" || ext === ".pls") return Database;
  if (ext === ".java" || ext === ".kt" || ext === ".kts") return Coffee;
  if (ext === ".jsp" || ext === ".jspf" || ext === ".jspx" || ext === ".jsf" || ext === ".xhtml" || ext === ".tag") return LayoutTemplate;
  if (ext === ".xml" || ext === ".xsd" || ext === ".wsdl" || ext === ".xsl" || ext === ".xslt") return FileCode2;
  if (ext === ".properties" || ext === ".yaml" || ext === ".yml" || ext === ".toml" || ext === ".ini" || ext === ".cfg") return Settings;
  if (ext === ".pas" || ext === ".dpr" || ext === ".dpk" || ext === ".inc") return FileCode2;
  if (ext === ".dfm" || ext === ".lfm" || ext === ".fmx") return LayoutTemplate;
  if (ext === ".fmb" || ext === ".mmb" || ext === ".pll" || ext === ".olb" || ext === ".rdf" || ext === ".xml" && lower.includes("forms")) return Table2;
  if (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx" || ext === ".mjs" || ext === ".cjs") return Braces;
  if (ext === ".json") return FileJson;
  if (ext === ".md" || ext === ".mdx" || ext === ".rst") return ScrollText;
  if (ext === ".html" || ext === ".htm") return Globe;
  if (ext === ".css" || ext === ".scss" || ext === ".less") return FileType;
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".gif" || ext === ".webp" || ext === ".svg" || ext === ".ico") return Image;
  if (ext === ".pdf") return FileText;
  if (ext === ".pem" || ext === ".key" || ext === ".crt" || ext === ".p12") return FileKey2;
  if (ext === ".avif" || ext === ".bmp") return FileImage;
  return File;
}
