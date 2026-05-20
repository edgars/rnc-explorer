import { ChevronRight, Folder } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import type { FileTreeNode } from "@/lib/architecture";
import { fileKindIcon } from "@/lib/fileKindIcon";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

function TreeRow(props: { node: FileTreeNode; depth: number; onPickFile: (path: string) => void }) {
  const [open, setOpen] = useState(props.depth < 2);

  if (props.node.type === "file" && props.node.path) {
    const FileIcon = fileKindIcon(props.node.path);
    return (
      <div className="min-w-0 max-w-full" style={{ paddingLeft: props.depth * 10 }}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-full min-w-0 max-w-full justify-start gap-1.5 px-1.5 font-normal transition-colors duration-150 active:bg-accent/80"
          onClick={() => props.onPickFile(props.node.path!)}
        >
          <FileIcon className="h-3 w-3 shrink-0 opacity-80" />
          <span className="min-w-0 truncate text-left text-[10px] leading-tight">{props.node.name}</span>
        </Button>
      </div>
    );
  }

  if (!props.node.children?.length) return null;

  return (
    <div className="min-w-0 max-w-full" style={{ paddingLeft: props.depth * 6 }}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-full min-w-0 max-w-full justify-start gap-1 px-1.5 font-normal transition-colors duration-150 active:bg-accent/80"
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform duration-200 ease-out", open && "rotate-90")}
        />
        <Folder className="h-3 w-3 shrink-0 text-primary/80" />
        <span className="min-w-0 truncate text-left text-[10px] font-medium leading-tight">{props.node.name}</span>
      </Button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="subtree"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden border-l border-border/60 pl-1"
          >
            {props.node.children.map((c) => (
              <TreeRow key={c.path || c.name} node={c} depth={props.depth + 1} onPickFile={props.onPickFile} />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function FileExplorer(props: {
  tree: FileTreeNode;
  onPickFile: (path: string) => void;
  className?: string;
  scrollClassName?: string;
}) {
  const { t } = useLocale();
  return (
    <div className={cn("flex w-full min-h-0 min-w-0 max-w-full flex-col gap-1.5", props.className)}>
      <div className="min-w-0 truncate text-[10px] font-medium text-muted-foreground">{t("app.filesLabel")}</div>
      <div
        className={cn(
          "min-h-0 w-full max-w-full flex-1 overflow-auto overscroll-contain rounded-md border border-border bg-card/30",
          props.scrollClassName,
        )}
      >
        <div className="inline-block min-w-full w-max max-w-none p-1.5 pr-2">
          {props.tree.children?.length ? (
            props.tree.children.map((c) => <TreeRow key={c.path || c.name} node={c} depth={0} onPickFile={props.onPickFile} />)
          ) : (
            <div className="p-3 text-[10px] text-muted-foreground">{t("fileExplorer.noFiles")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
