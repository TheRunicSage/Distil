"use client";

// Four-node Living Diagram. Hovering or focusing any node lights that
// node + its outgoing edge in orange and dims the rest. Local hover
// state only — no MotionRoot subscription, no RAF, no global mouse
// listener. The pulse animation on the active node is a CSS keyframe
// that auto-degrades under prefers-reduced-motion.
//
// Capped at 4 nodes per the motion budget. SVG-only; no canvas.

import { useState } from "react";

type Node = {
  id: string;
  label: string;
  caption: string;
  cx: number;
};

const NODES: Node[] = [
  { id: "cv", label: "Your CV", caption: "Master document", cx: 130 },
  { id: "role", label: "The role", caption: "Job description", cx: 380 },
  { id: "engine", label: "Distil", caption: "Tailoring + fit read", cx: 630 },
  { id: "out", label: "Two documents + a fit read", caption: "Ready to send", cx: 880 },
];

const NODE_R = 36;
const NODE_CY = 100;

export function LivingDiagram() {
  // -1 means "no hover": all nodes are at their resting state, with
  // edges showing their default dimmed orange.
  const [active, setActive] = useState<number>(-1);

  return (
    <div className="w-full">
      <svg
        viewBox="0 0 1000 220"
        preserveAspectRatio="xMidYMid meet"
        className="h-auto w-full"
        role="img"
        aria-label="How Distil works: your CV plus the role go through Distil and produce two documents and a fit read."
      >
        {/* Connectors. Drawn before nodes so the nodes sit on top. */}
        {NODES.slice(0, -1).map((node, i) => {
          const next = NODES[i + 1];
          const x1 = node.cx + NODE_R + 6;
          const x2 = next.cx - NODE_R - 6;
          const isActive = active === i;
          const isDimmed = active !== -1 && !isActive;
          return (
            <g key={`edge-${i}`}>
              <line
                x1={x1}
                y1={NODE_CY}
                x2={x2}
                y2={NODE_CY}
                stroke="var(--color-orange)"
                strokeWidth={isActive ? 2.25 : 1.25}
                opacity={isDimmed ? 0.18 : isActive ? 1 : 0.45}
                strokeLinecap="round"
                style={{ transition: "all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
              />
              <polygon
                points={`${x2 - 8},${NODE_CY - 4} ${x2},${NODE_CY} ${x2 - 8},${NODE_CY + 4}`}
                fill="var(--color-orange)"
                opacity={isDimmed ? 0.18 : isActive ? 1 : 0.55}
                style={{ transition: "opacity 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
              />
            </g>
          );
        })}

        {/* Nodes. Each is a focusable group with hover/focus state.    */}
        {NODES.map((node, i) => {
          const isActive = active === i;
          const isDimmed = active !== -1 && !isActive;
          return (
            <g
              key={node.id}
              tabIndex={0}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(-1)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(-1)}
              style={{ outline: "none", cursor: "default" }}
            >
              {isActive && (
                <circle
                  cx={node.cx}
                  cy={NODE_CY}
                  r={NODE_R}
                  fill="none"
                  stroke="var(--color-orange)"
                  strokeWidth={1.5}
                  className="diagram-pulse"
                  opacity={0.6}
                />
              )}
              <circle
                cx={node.cx}
                cy={NODE_CY}
                r={NODE_R}
                fill={isActive ? "var(--color-orange)" : "var(--color-dark2)"}
                stroke="var(--color-orange)"
                strokeWidth={isActive ? 2 : 1.25}
                opacity={isDimmed ? 0.45 : 1}
                style={{ transition: "all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
              />
              <text
                x={node.cx}
                y={NODE_CY + 4}
                textAnchor="middle"
                fontFamily="var(--font-serif)"
                fontStyle="italic"
                fontSize={i === NODES.length - 1 ? 13 : 14}
                fontWeight={300}
                fill={isActive ? "#ffffff" : "var(--color-text)"}
                opacity={isDimmed ? 0.55 : 1}
                style={{ transition: "all 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
              >
                {i === 3 ? "Output" : i === 2 ? "Distil" : i === 1 ? "Role" : "CV"}
              </text>
            </g>
          );
        })}

        {/* Labels under each node. Outside the focus group so hover on
            text doesn't trigger node hover (which would feel mushy). */}
        {NODES.map((node, i) => {
          const isActive = active === i;
          const isDimmed = active !== -1 && !isActive;
          return (
            <g key={`label-${node.id}`}>
              <text
                x={node.cx}
                y={NODE_CY + NODE_R + 30}
                textAnchor="middle"
                fontFamily="var(--font-sans)"
                fontSize={13}
                fontWeight={500}
                fill="var(--color-text)"
                opacity={isDimmed ? 0.55 : 1}
                style={{ transition: "opacity 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
              >
                {node.label}
              </text>
              <text
                x={node.cx}
                y={NODE_CY + NODE_R + 48}
                textAnchor="middle"
                fontFamily="var(--font-sans)"
                fontSize={11}
                fill="var(--color-text-muted)"
                opacity={isDimmed ? 0.4 : 0.75}
                style={{ transition: "opacity 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
              >
                {node.caption}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
