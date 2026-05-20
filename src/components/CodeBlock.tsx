import { PrismAsync as SyntaxHighlighter } from "react-syntax-highlighter";
import coldarkDark from "react-syntax-highlighter/dist/esm/styles/prism/coldark-dark";
import { cn } from "@/lib/utils";

type CodeBlockProps = {
  code: string;
  language: string;
  className?: string;
  /** Mostrar numeração quando há mais de uma linha */
  showLineNumbers?: boolean;
};

export function CodeBlock({ code, language, className, showLineNumbers }: CodeBlockProps) {
  const trimmed = code.replace(/\n$/, "");
  const lines = trimmed.split("\n").length;
  const lineNumbers = showLineNumbers ?? lines > 1;

  return (
    <SyntaxHighlighter
      language={language}
      style={coldarkDark}
      showLineNumbers={lineNumbers}
      wrapLines
      wrapLongLines
      PreTag="div"
      customStyle={{
        margin: 0,
        padding: "0.75rem 1rem",
        borderRadius: "0.5rem",
        fontSize: "11px",
        lineHeight: 1.55,
        background: "hsl(222 38% 9%)",
        border: "1px solid hsl(var(--border))",
      }}
      codeTagProps={{ className: cn("font-mono", className) }}
    >
      {trimmed}
    </SyntaxHighlighter>
  );
}
