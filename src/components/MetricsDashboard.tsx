import { BarChart3, Code2, Database, GitBranch, Layers, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { ArchitectureAnalysis, ComplexityScore, ParsedProjectSnapshot } from "@/lib/architecture";
import { macroLayerTitle, MACRO_LAYER_IDS } from "@/lib/architecture";
import { buildDashboardModel, complexityToProgress } from "@/lib/metrics";

export function MetricsDashboard(props: { snapshot: ParsedProjectSnapshot | null; analysis: ArchitectureAnalysis | null }) {
  const { t } = useLocale();
  const model = buildDashboardModel(props.snapshot, props.analysis);

  if (!model) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("metrics.emptyTitle")}</CardTitle>
          <CardDescription>{t("metrics.emptyDesc")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { metrics, perLanguage, distribution, locDisplay, clientLoc } = model;
  const nLocale = "pt-BR";

  const complexityLabelPt = (score: ComplexityScore) => {
    switch (score) {
      case "Low":
        return t("metrics.complexityLow");
      case "Medium":
        return t("metrics.complexityMedium");
      case "High":
        return t("metrics.complexityHigh");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Code2 className="h-4 w-4" />
            {t("metrics.locTitle")}
          </CardTitle>
          <CardDescription>{t("metrics.locDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-3xl font-semibold tracking-tight">{locDisplay.toLocaleString(nLocale)}</div>
          <div className="text-xs text-muted-foreground">
            {t("metrics.clientIndexed")}: <span className="font-mono text-foreground">{clientLoc.toLocaleString(nLocale)}</span> ·{" "}
            {t("metrics.modelMetrics")}: <span className="font-mono text-foreground">{metrics.totalLinesOfCode.toLocaleString(nLocale)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4" />
            {t("metrics.complexityTitle")}
          </CardTitle>
          <CardDescription>{t("metrics.complexityDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-lg font-medium">{complexityLabelPt(metrics.complexityScore)}</div>
          <Progress value={complexityToProgress(metrics.complexityScore)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            {t("metrics.dataTitle")}
          </CardTitle>
          <CardDescription>{t("metrics.dataDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">{t("metrics.tables")}</div>
              <div className="text-xl font-semibold">{metrics.totalTablesAccessed}</div>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">{t("metrics.bllRules")}</div>
              <div className="text-xl font-semibold">{metrics.totalBusinessRules}</div>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground">{t("metrics.entities")}</div>
              <div className="text-xl font-semibold">{metrics.totalEntities}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" />
            {t("metrics.layerDistTitle")}
          </CardTitle>
          <CardDescription>{t("metrics.layerDistDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {MACRO_LAYER_IDS.map((id) => (
            <div key={id}>
              <div className="mb-1 flex justify-between text-xs">
                <span>{macroLayerTitle(id)}</span>
                <span className="text-muted-foreground">
                  {distribution[id].count} · {distribution[id].pct.toFixed(0)}%
                </span>
              </div>
              <Progress value={Math.round(distribution[id].pct)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" />
            {t("metrics.locByExtTitle")}
          </CardTitle>
          <CardDescription>{t("metrics.locByExtDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {perLanguage.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("metrics.extension")}</TableHead>
                  <TableHead className="text-right">{t("metrics.lines")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perLanguage.map(([ext, lines]) => (
                  <TableRow key={ext}>
                    <TableCell className="font-mono text-xs">{ext}</TableCell>
                    <TableCell className="text-right text-xs">{lines.toLocaleString(nLocale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              {t("metrics.noBreakdown")}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
