import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/elms-sans/index.css";
import App from "@/App";
import "@/index.css";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { Toaster } from "@/components/ui/toaster";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <App />
      <Toaster />
    </LocaleProvider>
  </StrictMode>,
);
