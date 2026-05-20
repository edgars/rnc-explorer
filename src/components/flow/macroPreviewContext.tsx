import { createContext, useContext } from "react";
import type { MacroLayerId } from "@/lib/architecture";

export type MacroPreviewBridge = {
  onMacroPointerEnter: (layerId: MacroLayerId, clientX: number, clientY: number) => void;
  onMacroPointerMove: (layerId: MacroLayerId, clientX: number, clientY: number) => void;
  onMacroPointerLeave: () => void;
};

export const MacroPreviewContext = createContext<MacroPreviewBridge | null>(null);

export function useMacroPreviewBridge(): MacroPreviewBridge | null {
  return useContext(MacroPreviewContext);
}
