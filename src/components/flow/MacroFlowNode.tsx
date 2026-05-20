import { memo, useCallback } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { MacroLayerId } from "@/lib/architecture";
import { isMacroLayerId } from "@/lib/architecture";
import { useMacroPreviewBridge } from "@/components/flow/macroPreviewContext";

export type MacroNodeData = {
  kind: "macro";
  label: string;
  layerId: string;
  description?: string;
};

export type MacroRfNode = Node<MacroNodeData, "macro">;

function MacroNodeInner(props: NodeProps<MacroRfNode>) {
  const { data, selected, id } = props;
  const bridge = useMacroPreviewBridge();

  const layerId = id as MacroLayerId;
  const isMacro = isMacroLayerId(layerId);

  const onPointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (!bridge || !isMacro) return;
      bridge.onMacroPointerEnter(layerId, e.clientX, e.clientY);
    },
    [bridge, isMacro, layerId],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!bridge || !isMacro) return;
      bridge.onMacroPointerMove(layerId, e.clientX, e.clientY);
    },
    [bridge, isMacro, layerId],
  );

  const onPointerLeave = useCallback(() => {
    bridge?.onMacroPointerLeave();
  }, [bridge]);

  return (
    <div
      className={cn(
        "min-w-0 max-w-[min(260px,calc(100vw-3rem))] rounded-lg border bg-card px-3 py-2.5 shadow-md sm:min-w-[200px] sm:max-w-[280px] sm:px-4 sm:py-3",
        selected ? "border-primary ring-2 ring-primary/40" : "border-border",
      )}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Macro layer</div>
      <div className="mt-1 min-w-0 text-sm font-semibold leading-snug">{data.label}</div>
      <div className="mt-1 min-w-0 text-[11px] leading-snug text-muted-foreground">
        Duplo clique para micro-componentes. Pare o cursor aqui para ver arquivos da camada.
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
      <Handle type="target" position={Position.Top} className="!bg-primary" />
    </div>
  );
}

export const MacroFlowNode = memo(MacroNodeInner);
