import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { translate } from "@/lib/i18n/dictionary";

type LocaleContextValue = {
  t: (key: string, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = "pt-BR";
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => translate(key, params), []);

  const value = useMemo(() => ({ t }), [t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale deve ser usado dentro de LocaleProvider");
  return ctx;
}
