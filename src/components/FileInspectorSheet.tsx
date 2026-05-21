import { BadgeCheck, Braces, ListTree, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/CodeBlock";
import { InspectorDependencyFlowDialog } from "@/components/InspectorDependencyFlowDialog";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { macroLayerTitle, type ArchitectureAnalysis, type MacroLayerId, type ParsedProjectSnapshot } from "@/lib/architecture";
import { buildInspectorDependencyFlow } from "@/lib/inspectorDependencyFlow";
import { resolvePathFromFileAnalysis } from "@/lib/fileResolve";
import { pathToPrismLanguage } from "@/lib/prismLanguage";
import { cn } from "@/lib/utils";
export function FileInspectorSheet(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filePath: string | null;
  snapshot: ParsedProjectSnapshot | null;
  analysis: ArchitectureAnalysis | null;
}) {
  const { t } = useLocale();
  const resolved =
    props.filePath && props.snapshot ? resolvePathFromFileAnalysis(props.filePath, props.snapshot) ?? props.filePath : null;

  const source =
    props.snapshot && resolved ? props.snapshot.sources[resolved] ?? props.snapshot.snippets[resolved] ?? null : null;

  const detail =
    props.analysis && resolved
      ? props.analysis.fileAnalysisDetails[resolved] ??
        props.analysis.fileAnalysisDetails[props.filePath ?? ""] ??
        Object.entries(props.analysis.fileAnalysisDetails).find(([k]) => k.endsWith(resolved.split("/").pop() ?? ""))?.[1]
      : null;

  const loc = props.snapshot && resolved ? props.snapshot.linesByPath[resolved] : undefined;
  const highlightLang = resolved ? pathToPrismLanguage(resolved) : "clike";

  const [flowOpen, setFlowOpen] = useState(false);

  const flowNodes = useMemo(() => {
    if (!props.snapshot || !resolved || !source) return [];
    return buildInspectorDependencyFlow(resolved, source, props.snapshot, props.analysis);
  }, [props.snapshot, props.analysis, resolved, source]);

  const canShowFlow = flowNodes.length >= 2;

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-xl lg:max-w-3xl">
        <SheetHeader className="border-b border-border pb-4 pr-8">
          <SheetTitle className="truncate font-mono text-sm">{resolved ?? props.filePath ?? t("inspector.titleFallback")}</SheetTitle>
          <SheetDescription>
            {loc != null ? (
              <span>
                {t("inspector.linesIndexed", { n: String(loc) })}
                {source && source.length >= 275_000 ? t("inspector.truncatedHint") : ""}
              </span>
            ) : (
              t("inspector.pickFile")
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden py-4">
          {!props.snapshot ? (
            <Alert>
              <AlertTitle>{t("inspector.noProjectTitle")}</AlertTitle>
              <AlertDescription>{t("inspector.noProjectDesc")}</AlertDescription>
            </Alert>
          ) : !resolved ? (
            <Alert>
              <AlertTitle>{t("inspector.notIndexedTitle")}</AlertTitle>
              <AlertDescription>{t("inspector.notIndexedDesc")}</AlertDescription>
            </Alert>
          ) : !source ? (
            <Alert variant="destructive">
              <AlertTitle>{t("inspector.noSourceTitle")}</AlertTitle>
              <AlertDescription>{t("inspector.noSourceDesc")}</AlertDescription>
            </Alert>
          ) : (
            <>
              <Card className="shrink-0 border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <BadgeCheck className="h-4 w-4 text-primary" />
                    {t("inspector.aiMetaTitle")}
                  </CardTitle>
                  <CardDescription>{t("inspector.aiMetaDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {detail ? (
                    <>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("inspector.purpose")}</div>
                        <p className="mt-1 text-muted-foreground">{detail.purpose}</p>
                      </div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("inspector.layer")}</div>
                        <div className="mt-1 inline-flex rounded-md border border-border bg-muted/30 px-2 py-1 text-xs font-medium">
                          {macroLayerTitle(detail.layer as MacroLayerId)}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          <ListTree className="h-3.5 w-3.5" />
                          {t("inspector.rules")}
                        </div>
                        {detail.businessRules?.length ? (
                          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                            {detail.businessRules.map((r) => (
                              <li key={r}>{r}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">{t("inspector.noRules")}</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t("inspector.noDetail")}</p>
                  )}
                </CardContent>
              </Card>

              {canShowFlow ? (
                <div className="shrink-0">
                  <Button type="button" variant="secondary" size="sm" className="w-full gap-2" onClick={() => setFlowOpen(true)}>
                    <Workflow className="h-4 w-4 shrink-0" />
                    {t("inspector.flowButton")}
                  </Button>
                  <InspectorDependencyFlowDialog open={flowOpen} onOpenChange={setFlowOpen} nodes={flowNodes} />
                </div>
              ) : null}

              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Braces className="h-3.5 w-3.5" />
                  {t("inspector.source")}
                </div>
                <div
                  className={cn(
                    "min-h-0 flex-1 overflow-auto rounded-md border border-border",
                    "[scrollbar-gutter:stable]",
                  )}
                >
                  <div className="w-max min-w-full p-2">
                    <CodeBlock
                      code={source}
                      language={highlightLang}
                      showLineNumbers
                      wrapLongLines={false}
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
