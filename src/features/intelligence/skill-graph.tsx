"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import { TIER_STYLE, type GraphNode } from "@/features/intelligence/api";
import { cn } from "@/lib/utils";

type SkillFlowData = {
  node: GraphNode;
  selected: boolean;
  dimmed: boolean;
};

export type SkillFlowNode = Node<SkillFlowData, "skill">;

function SkillNode({ data }: NodeProps<SkillFlowNode>) {
  const { node, selected, dimmed } = data;
  const tier = node.status === "missing" ? "missing" : node.status;
  const style = TIER_STYLE[tier];
  const missing = node.status === "missing";

  return (
    <div
      className={cn(
        "w-[200px] rounded-xl border bg-white px-3 py-2.5 shadow-[0_8px_20px_-14px_rgba(117,69,31,0.55)] transition",
        missing ? "border-dashed" : "border-[#EDE6DA]",
        selected && "ring-2 ring-[#E99A32] ring-offset-2 ring-offset-[#FFFCF6]",
        dimmed && "opacity-25",
      )}
      style={missing ? { borderColor: "#C9B99F" } : undefined}
    >
      <Handle type="target" position={Position.Top} className="!size-1.5 !border-0 !bg-[#C9B99F]" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-bold text-[#24211D]">{node.label}</span>
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: style.dot }} />
      </div>
      <p className="mt-0.5 truncate text-[9px] uppercase tracking-wide text-[#A89D8F]">{node.category}</p>
      {missing ? (
        <p className="mt-1.5 text-[9px] font-semibold" style={{ color: style.dot }}>
          {node.kind === "required_missing" ? "Role requirement" : "Prerequisite gap"}
        </p>
      ) : (
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#F3E9D8]">
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, node.proficiency)}%`, backgroundColor: style.dot }} />
          </div>
          <span className="text-[9px] font-semibold text-[#6F675C]">{Math.round(node.proficiency)}</span>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!size-1.5 !border-0 !bg-[#C9B99F]" />
    </div>
  );
}

const nodeTypes = { skill: SkillNode };

/** Category columns keep the map readable instead of a hairball. */
function layout(nodes: GraphNode[]): SkillFlowNode[] {
  const categories = Array.from(new Set(nodes.map((node) => node.category))).sort();
  const counters = new Map<string, number>();
  return nodes.map((node) => {
    const column = Math.max(0, categories.indexOf(node.category));
    const row = counters.get(node.category) ?? 0;
    counters.set(node.category, row + 1);
    return {
      id: node.id,
      type: "skill",
      position: { x: column * 248, y: row * 108 },
      data: { node, selected: false, dimmed: false },
      draggable: true,
    };
  });
}

export function SkillGraph({
  nodes,
  edges,
  selectedId,
  search,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: { source: string; target: string; kind: "prerequisite" | "related" }[];
  selectedId: string | null;
  search: string;
  onSelect: (id: string | null) => void;
}) {
  const query = search.trim().toLowerCase();
  const flowNodes = useMemo(() => {
    return layout(nodes).map((node) => ({
      ...node,
      data: {
        ...node.data,
        selected: node.id === selectedId,
        dimmed: Boolean(query) && !node.data.node.label.toLowerCase().includes(query),
      },
    }));
  }, [nodes, selectedId, query]);

  const ids = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const flowEdges = useMemo<Edge[]>(() => {
    return edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge, index) => ({
        id: `${edge.kind}-${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        animated: edge.kind === "prerequisite",
        style:
          edge.kind === "prerequisite"
            ? { stroke: "#E99A32", strokeWidth: 1.6, strokeDasharray: "5 4" }
            : { stroke: "#D8C8AE", strokeWidth: 1, opacity: 0.7 },
      }));
  }, [edges, ids]);

  if (!nodes.length) {
    return (
      <div className="grid h-[520px] place-items-center rounded-2xl border border-dashed border-[#E3D8C5] bg-[#FFFCF6] px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-[#24211D]">No skills match these filters</p>
          <p className="mt-1 text-xs text-[#6F675C]">Clear the search or tier filter to see your graph again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[560px] overflow-hidden rounded-2xl border border-[#EDE6DA] bg-[#FFFCF6]">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect(node.id === selectedId ? null : node.id)}
        onPaneClick={() => onSelect(null)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.35}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        aria-label="Skill evidence graph"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#E3D8C5" />
        <Controls showInteractive={false} className="!rounded-lg !border !border-[#EDE6DA] !bg-white !shadow-sm" />
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => {
            const status = (node.data as SkillFlowData | undefined)?.node.status ?? "claimed";
            return TIER_STYLE[status].dot;
          }}
          maskColor="rgba(255, 252, 246, 0.7)"
          className="!rounded-lg !border !border-[#EDE6DA]"
        />
      </ReactFlow>
    </div>
  );
}
