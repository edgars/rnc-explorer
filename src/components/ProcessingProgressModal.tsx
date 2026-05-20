import { Check, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export type ProgressStepDef = { id: string; label: string };

export const ZIP_PARSE_STEPS: ProgressStepDef[] = [
  { id: "load", label: "Loading ZIP archive" },
  { id: "scan", label: "Scanning & filtering entries" },
  { id: "read", label: "Reading text file contents" },
  { id: "index", label: "Building tree, snippets & metrics" },
];

export const ARCHITECTURE_ANALYSIS_STEPS: ProgressStepDef[] = [
  { id: "prompt", label: "Building architecture prompt" },
  { id: "llm", label: "Calling language model" },
  { id: "parse", label: "Parsing & validating response" },
];

export const DOCUMENTATION_REGEN_STEPS: ProgressStepDef[] = [
  { id: "prompt", label: "Building documentation prompt" },
  { id: "llm", label: "Calling language model" },
  { id: "merge", label: "Merging documentation into analysis" },
];

export type ProcessingProgressState = {
  taskKind: "zip" | "analysis" | "docs";
  title: string;
  description?: string;
  steps: readonly ProgressStepDef[];
  activeStepIndex: number;
  /** When set, bar is full (brief success beat before close). */
  finished?: boolean;
};

export type LongTaskProgressApi = {
  start: (input: {
    taskKind: "zip" | "analysis" | "docs";
    title: string;
    description?: string;
    steps: readonly ProgressStepDef[];
  }) => void;
  atStep: (index: number) => void;
  succeed: () => void;
  fail: () => void;
};

function progressValue(state: ProcessingProgressState): number {
  const n = state.steps.length;
  if (n <= 0) return 0;
  if (state.finished) return 100;
  const idx = Math.min(Math.max(0, state.activeStepIndex), n - 1);
  return Math.round(((idx + 1) / n) * 100);
}

function stepLabel(
  t: (k: string) => string,
  taskKind: ProcessingProgressState["taskKind"],
  stepId: string,
  fallback: string,
): string {
  const prefix = taskKind === "zip" ? "progress.zip" : taskKind === "analysis" ? "progress.analysis" : "progress.docs";
  const key = `${prefix}.${stepId}`;
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function ProcessingProgressModal(props: {
  open: boolean;
  state: ProcessingProgressState | null;
}) {
  const { open, state } = props;
  const { t } = useLocale();
  if (!state) return null;

  return (
    <Dialog open={open}>
      <DialogContent
        hideClose
        className="max-w-md gap-5"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <motion.div
          className="flex flex-col gap-5"
          initial={{ opacity: 0, y: 14, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        >
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 pr-8">
            {state.finished ? (
              <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            ) : (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden />
            )}
            <span>{state.title}</span>
          </DialogTitle>
          {state.description ? (
            <DialogDescription className="truncate font-mono text-xs text-muted-foreground">{state.description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">
              {state.finished
                ? t("progress.done")
                : state.steps[state.activeStepIndex]
                  ? stepLabel(t, state.taskKind, state.steps[state.activeStepIndex]!.id, state.steps[state.activeStepIndex]!.label)
                  : t("progress.working")}
            </span>
            <span className="shrink-0 font-mono tabular-nums">{progressValue(state)}%</span>
          </div>
          <Progress value={progressValue(state)} className="h-2.5" />
        </div>

        <ol className="space-y-2 border-t border-border pt-4">
          {state.steps.map((step, i) => {
            const done = state.finished || i < state.activeStepIndex;
            const active = !state.finished && i === state.activeStepIndex;
            const pending = !state.finished && i > state.activeStepIndex;
            return (
              <motion.li
                key={step.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, type: "spring", stiffness: 380, damping: 28 }}
                className={cn(
                  "flex items-start gap-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                  active && "bg-primary/10 text-foreground",
                  pending && "text-muted-foreground",
                  done && "text-muted-foreground",
                )}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {done ? (
                    <Check className="h-4 w-4 text-primary" aria-hidden />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                  ) : (
                    <span className="block h-2 w-2 rounded-full bg-muted-foreground/35" aria-hidden />
                  )}
                </span>
                <span className={cn("leading-snug", active && "font-medium")}>
                  {stepLabel(t, state.taskKind, step.id, step.label)}
                </span>
              </motion.li>
            );
          })}
        </ol>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
