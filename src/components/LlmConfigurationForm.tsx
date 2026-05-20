import { KeyRound } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { LlmConfig, LlmProvider } from "@/lib/llmConfig";
import { ALL_LLM_PROVIDERS, defaultModelForProvider, providerHasKey } from "@/lib/llmConfig";
import { cn } from "@/lib/utils";

const OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4.1", "o4-mini"] as const;
const ANTHROPIC_MODELS = [
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
] as const;
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-2.5-flash-preview-05-20",
] as const;

function setKey(cfg: LlmConfig, provider: LlmProvider, key: string): LlmConfig {
  const keys = { ...cfg.keys };
  if (provider === "openai") keys.openai = key;
  else if (provider === "anthropic") keys.anthropic = key;
  else if (provider === "gemini") keys.gemini = key;
  else keys.custom = key;
  return { ...cfg, keys };
}

function setModel(cfg: LlmConfig, provider: LlmProvider, model: string): LlmConfig {
  return { ...cfg, models: { ...cfg.models, [provider]: model } };
}

export function LlmConfigurationForm(props: {
  value: LlmConfig;
  onChange: (next: LlmConfig) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { value, onChange } = props;
  const { t } = useLocale();

  const selectableProviders = useMemo(() => ALL_LLM_PROVIDERS.filter((p) => providerHasKey(value, p)), [value]);

  const statusBadge = (p: LlmProvider) => {
    const ok = providerHasKey(value, p);
    return (
      <span
        className={cn(
          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
          ok ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {ok ? t("llm.ready") : t("llm.needsKey")}
      </span>
    );
  };

  return (
    <div className="grid gap-4 py-2">
      <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <div className="flex gap-2">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>{t("llm.intro")}</div>
        </div>
      </div>

      <Card className="border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("llm.keysTitle")}</CardTitle>
          <CardDescription className="text-xs">{t("llm.keysDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-2">
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">{t("llm.colProvider")}</TableHead>
                  <TableHead>{t("llm.colKey")}</TableHead>
                  <TableHead className="min-w-[140px]">{t("llm.colModel")}</TableHead>
                  <TableHead className="w-[100px] text-right">{t("llm.colStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(["openai", "anthropic", "gemini"] as const).map((p) => {
                  const keyVal = p === "openai" ? value.keys.openai ?? "" : p === "anthropic" ? value.keys.anthropic ?? "" : value.keys.gemini ?? "";
                  const enabled = !!keyVal.trim();
                  const models = p === "openai" ? OPENAI_MODELS : p === "anthropic" ? ANTHROPIC_MODELS : GEMINI_MODELS;
                  return (
                    <TableRow key={p}>
                      <TableCell className="align-top text-sm font-medium capitalize">{p}</TableCell>
                      <TableCell className="align-top">
                        <Input
                          type="password"
                          autoComplete="off"
                          className="h-9 font-mono text-xs"
                          placeholder={p === "gemini" ? "Google AI Studio key" : p === "anthropic" ? "Anthropic key" : "sk-…"}
                          value={keyVal}
                          onChange={(e) => onChange(setKey(value, p, e.target.value))}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Select
                          disabled={!enabled}
                          value={value.models[p]}
                          onValueChange={(m) => onChange(setModel(value, p, m))}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder={enabled ? t("llm.modelPlaceholder") : t("llm.addKeyFirst")} />
                          </SelectTrigger>
                          <SelectContent>
                            {models.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="align-top text-right">{statusBadge(p)}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell className="align-top text-sm font-medium">Custom</TableCell>
                  <TableCell className="align-top">
                    <div className="grid gap-2">
                      <div className="grid gap-1">
                        <Label className="text-[10px] text-muted-foreground">{t("llm.baseUrl")}</Label>
                        <Input
                          className="h-9 font-mono text-xs"
                          placeholder="http://127.0.0.1:11434"
                          value={value.customBaseUrl ?? ""}
                          onChange={(e) => onChange({ ...value, customBaseUrl: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px] text-muted-foreground">{t("llm.apiKeyOptional")}</Label>
                        <Input
                          type="password"
                          autoComplete="off"
                          className="h-9 font-mono text-xs"
                          value={value.keys.custom ?? ""}
                          onChange={(e) => onChange(setKey(value, "custom", e.target.value))}
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <Label className="mb-1 block text-[10px] text-muted-foreground">{t("llm.modelPlaceholder")}</Label>
                    <Input
                      className="h-9 font-mono text-xs"
                      disabled={!providerHasKey(value, "custom")}
                      value={value.models.custom}
                      onChange={(e) => onChange(setModel(value, "custom", e.target.value))}
                      placeholder="llama3.1"
                    />
                  </TableCell>
                  <TableCell className="align-top text-right">{statusBadge("custom")}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-2">
        <Label>{t("llm.activeProvider")}</Label>
        {selectableProviders.length ? (
          <Select
            value={selectableProviders.includes(value.provider) ? value.provider : selectableProviders[0]!}
            onValueChange={(v) => {
              const p = v as LlmProvider;
              onChange({
                ...value,
                provider: p,
                models: { ...value.models, [p]: value.models[p] || defaultModelForProvider(p) },
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("llm.configurePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {selectableProviders.map((p) => (
                <SelectItem key={p} value={p} className="capitalize">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">{t("llm.noProviderHint")}</p>
        )}
        {!selectableProviders.length ? <p className="text-xs text-destructive">{t("llm.noProviderYet")}</p> : null}
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <Label>{t("llm.temperature")}</Label>
          <div className="text-xs text-muted-foreground">{value.temperature.toFixed(1)}</div>
        </div>
        <Slider
          value={[value.temperature]}
          min={0}
          max={1}
          step={0.1}
          onValueChange={(v) => onChange({ ...value, temperature: v[0] ?? 0 })}
        />
      </div>

      <DialogFooter>
        <Button variant="secondary" type="button" onClick={props.onCancel}>
          {t("llm.cancel")}
        </Button>
        <Button type="button" onClick={props.onSave}>
          {t("llm.save")}
        </Button>
      </DialogFooter>
    </div>
  );
}
