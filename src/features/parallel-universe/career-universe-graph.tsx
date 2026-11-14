"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";

import type { Simulation } from "./api";

type NodeData = {
  title: string;
  subtitle: string;
  color: string;
  detail: string;
  skills: string[];
  projects: string[];
  missing: string[];
  decision?: string;
};
type FlowNode = Node<NodeData, "universe">;

function UniverseNode({ data }: NodeProps<FlowNode>) {
  return (
    <div className="min-w-[190px] max-w-[210px] rounded-2xl border bg-white px-4 py-3 shadow-lg" style={{ borderColor: `${data.color}70`, boxShadow: `0 8px 26px -18px ${data.color}` }}>
      <Handle type="target" position={Position.Left} className="!size-2 !border-0" style={{ background: data.color }} />
      <p className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: data.color }}>{data.subtitle}</p>
      <p className="mt-1 text-xs font-bold leading-4 text-[#24211D]">{data.title}</p>
      <Handle type="source" position={Position.Right} className="!size-2 !border-0" style={{ background: data.color }} />
    </div>
  );
}

const nodeTypes: NodeTypes = { universe: UniverseNode };

export function CareerUniverseGraph({ simulation, onSelect }: { simulation: Simulation; onSelect: (node: NodeData) => void }) {
  const { nodes, edges } = useMemo(() => {
    const colors = ["#8B5CF6", "#0F766E", "#E99A32"];
    const resultNodes: FlowNode[] = [{
      id: "current-self", type: "universe", position: { x: 30, y: 250 },
      data: { title: "Current Self", subtitle: "Starting evidence", color: "#75451F", detail: "This is the real profile snapshot used for this simulation. Hypothetical decisions never write to this evidence.", skills: [...simulation.profile.verified_skills, ...simulation.profile.demonstrated_skills].map((item) => item.name).slice(0, 8), projects: simulation.profile.projects.slice(0, 4), missing: simulation.profile.experience_gaps.slice(0, 4) },
    }];
    const resultEdges: Edge[] = [];
    simulation.futures.forEach((future, index) => {
      const color = colors[index % colors.length];
      const y = 24 + index * 225;
      const futureId = `path-${future.id}`;
      resultNodes.push({ id: futureId, type: "universe", position: { x: 330, y }, data: { title: future.direction, subtitle: future.archetype, color, detail: future.career_strategy, skills: future.new_skills.slice(0, 6), projects: future.suggested_projects.slice(0, 3), missing: simulation.comparison.paths.find((item) => item.future_id === future.id)?.missing_competencies ?? [] } });
      resultEdges.push({ id: `root-${future.id}`, source: "current-self", target: futureId, animated: true, style: { stroke: color, strokeWidth: 2 } });
      const horizons = [
        ["six_months", "6 MONTHS", 640],
        ["one_year", "1 YEAR", 940],
        ["three_years", "3 YEARS", 1240],
      ] as const;
      let prior = futureId;
      for (const [key, label, x] of horizons) {
        const milestone = future.milestones[key];
        const nodeId = `${future.id}-${key}`;
        const recentDecision = key === "six_months" ? simulation.scenarios?.[0] : undefined;
        const impact = recentDecision?.outcomes.find((item) => item.future_id === future.id);
        resultNodes.push({ id: nodeId, type: "universe", position: { x, y }, data: {
          title: milestone.target,
          subtitle: label,
          color,
          detail: `${milestone.action} Evidence to collect: ${milestone.evidence} Estimated effort: ${milestone.effort_hours} hours. Dependencies: ${milestone.dependencies.join(", ") || "None listed."}` + (impact ? ` Hypothetical decision update: ${impact.timeline_update}` : ""),
          skills: milestone.required_skills,
          projects: future.suggested_projects.slice(0, 2),
          missing: simulation.comparison.paths.find((item) => item.future_id === future.id)?.missing_competencies ?? [],
          decision: impact ? `${recentDecision?.decision} (${impact.stance})` : undefined,
        } });
        resultEdges.push({ id: `${prior}-${nodeId}`, source: prior, target: nodeId, animated: key === "six_months", label: label.toLowerCase(), labelStyle: { fill: "#6F675C", fontSize: 9 }, style: { stroke: color, strokeWidth: 1.6, opacity: 0.8 } });
        prior = nodeId;
      }
    });
    return { nodes: resultNodes, edges: resultEdges };
  }, [simulation]);

  return (
    <div className="h-[590px] overflow-hidden rounded-3xl border border-[#EDE6DA] bg-[#FFFCF6]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.14, minZoom: 0.35, maxZoom: 0.9 }}
        minZoom={0.25}
        maxZoom={1.2}
        onNodeClick={(_, node) => onSelect(node.data as NodeData)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#E8DDD0" gap={24} size={1} />
        <MiniMap nodeColor={(node) => (node.data as NodeData).color} maskColor="rgba(255,252,246,.72)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
