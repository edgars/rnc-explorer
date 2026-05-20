import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

export type MicroNodeData = {
  kind: "micro";
  label: string;
  description: string;
  layerId: string;
  sourcePath?: string;
};

export type MicroRfNode = Node<MicroNodeData, "micro">;

function MicroNodeInner(props: NodeProps<MicroRfNode>) {
  const { data, selected } = props;
  return (
    <div
      className={cn(
        "min-w-[240px] max-w-[320px] rounded-md border bg-secondary/40 px-3 py-2 shadow-sm",
        selected ? "border-primary ring-2 ring-primary/30" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{data.layerId}</div>
      </div>
      <div className="mt-1 text-sm font-medium leading-snug">{data.label}</div>
      <div className="mt-1 line-clamp-3 text-xs text-muted-foreground">{data.description}</div>
      <div className="mt-2 text-[10px] text-primary/80">Click node to inspect source</div>
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

export const MicroFlowNode = memo(MicroNodeInner);
