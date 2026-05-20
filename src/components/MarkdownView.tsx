import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "@/components/CodeBlock";
import { fenceLangToPrism } from "@/lib/prismLanguage";

type CodeProps = ComponentPropsWithoutRef<"code"> & { className?: string; children?: ReactNode };

export function MarkdownView(props: { markdown: string; className?: string }) {
  if (!props.markdown?.trim()) {
    return <p className="text-sm text-muted-foreground">Sem conteúdo ainda.</p>;
  }

  return (
    <div className={props.className ?? ""}>
      <div className="arch-md space-y-3 text-sm leading-relaxed text-foreground">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="mt-4 text-xl font-semibold tracking-tight first:mt-0">{children}</h1>,
            h2: ({ children }) => <h2 className="mt-4 text-lg font-semibold tracking-tight">{children}</h2>,
            h3: ({ children }) => <h3 className="mt-3 text-base font-semibold">{children}</h3>,
            p: ({ children }) => <p className="text-muted-foreground [&>strong]:text-foreground">{children}</p>,
            ul: ({ children }) => <ul className="ml-4 list-disc space-y-1 text-muted-foreground">{children}</ul>,
            ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1 text-muted-foreground">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            code: ({ className, children, ...rest }: CodeProps) => {
              const text = String(children).replace(/\n$/, "");
              const match = /language-(\w+)/.exec(className ?? "");
              const inline = !match && !text.includes("\n");
              if (inline) {
                return (
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground" {...rest}>
                    {children}
                  </code>
                );
              }
              const rawLang = match?.[1] ?? "";
              const language = fenceLangToPrism(rawLang || undefined);
              return <CodeBlock code={text} language={language} />;
            },
            pre: ({ children }) => <div className="my-2">{children}</div>,
            a: ({ href, children }) => (
              <a href={href} className="text-primary underline underline-offset-4 hover:text-primary/80" target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-primary/50 pl-3 text-muted-foreground">{children}</blockquote>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full border-collapse text-xs">{children}</table>
              </div>
            ),
            th: ({ children }) => <th className="border-b border-border bg-muted/50 px-2 py-2 text-left font-medium">{children}</th>,
            td: ({ children }) => <td className="border-b border-border px-2 py-2 align-top text-muted-foreground">{children}</td>,
          }}
        >
          {props.markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}
