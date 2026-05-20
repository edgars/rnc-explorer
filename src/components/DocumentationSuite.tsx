import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { DOCUMENTATION_REGEN_STEPS, type LongTaskProgressApi } from "@/components/ProcessingProgressModal";
import { MarkdownView } from "@/components/MarkdownView";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { ArchitectureAnalysis, ParsedProjectSnapshot } from "@/lib/architecture";
import type { LlmConfig } from "@/lib/llm";
import { runDocumentationRegeneration } from "@/lib/llm";
import { getActiveApiContext, isActiveProviderReady } from "@/lib/llmConfig";
import { logger } from "@/lib/logger";

const SECTION_KEYS = [
  "techOverview",
  "appPurpose",
  "actors",
  "intents",
  "databaseAccessStyle",
  "externalIntegrations",
] as const;

type DocKey = (typeof SECTION_KEYS)[number];

export function DocumentationSuite(props: {
  snapshot: ParsedProjectSnapshot | null;
  analysis: ArchitectureAnalysis | null;
  llm: LlmConfig;
  /** When set, long-running regeneration reports phases in the global progress modal. */
  progress?: LongTaskProgressApi;
  onDocumentationUpdated: (next: ArchitectureAnalysis) => void;
}) {
  const { t } = useLocale();
  const [regenBusy, setRegenBusy] = useState(false);

  const regen = async () => {
    if (!props.snapshot || !props.analysis) return;
    const ctx = getActiveApiContext(props.llm);
    setRegenBusy(true);
    props.progress?.start({
      taskKind: "docs",
      title: t("progress.task.docs.title"),
      description: `${ctx.provider} · ${ctx.model}`,
      steps: DOCUMENTATION_REGEN_STEPS,
    });
    let succeeded = false;
    try {
      const documentation = await runDocumentationRegeneration(
        props.snapshot,
        props.analysis,
        props.llm,
        undefined,
        props.progress ? (i) => props.progress!.atStep(i) : undefined,
      );
      props.onDocumentationUpdated({ ...props.analysis, documentation });
      props.progress?.succeed();
      succeeded = true;
      toast({ title: t("docs.toastRefreshedTitle"), description: t("docs.toastRefreshedDesc") });
    } catch (e) {
      props.progress?.fail();
      const msg = e instanceof Error ? e.message : "Unknown error";
      logger.error("Documentation regeneration failed", { error: e });
      toast({ variant: "destructive", title: t("docs.toastFailTitle"), description: msg });
    } finally {
      if (props.progress && succeeded) {
        window.setTimeout(() => setRegenBusy(false), 320);
      } else {
        setRegenBusy(false);
      }
    }
  };
  if (!props.analysis) {
    return (
      <Alert>
        <AlertTitle>{t("docs.noAnalysisTitle")}</AlertTitle>
        <AlertDescription>{t("docs.noAnalysisDesc")}</AlertDescription>
      </Alert>
    );
  }

  const doc = props.analysis.documentation;
  const hasAny = SECTION_KEYS.some((s) => doc[s]?.trim());

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">{t("docs.suiteTitle")}</CardTitle>
          <CardDescription>{t("docs.suiteDesc")}</CardDescription>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0 gap-2"
          disabled={!props.snapshot || regenBusy || !isActiveProviderReady(props.llm)}
          onClick={() => void regen()}
        >
          {regenBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("docs.regenerate")}
        </Button>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <Alert className="mb-4">
            <AlertTitle>{t("docs.emptyBlocksTitle")}</AlertTitle>
            <AlertDescription>{t("docs.emptyBlocksDesc")}</AlertDescription>
          </Alert>
        ) : null}

        <Accordion type="multiple" defaultValue={["techOverview", "appPurpose"]} className="w-full">
          {SECTION_KEYS.map((s) => (
            <AccordionItem key={s} value={s}>
              <AccordionTrigger className="text-left text-sm">{t(`docs.section.${s}`)}</AccordionTrigger>
              <AccordionContent>
                <MarkdownView markdown={doc[s as DocKey]} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
