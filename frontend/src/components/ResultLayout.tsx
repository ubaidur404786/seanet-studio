// puts the result blocks in a different order / grid for each template.
// the blocks are the same everywhere (answer, chart, explanation, evidence) - only where they sit
// changes, so a domain feels like its own tool without any duplicated logic.
import type { ReactNode } from "react";
import type { LayoutKey } from "../lib/templates";

interface Blocks {
  verdict: ReactNode;
  chart: ReactNode;
  explain: ReactNode;
  evidence: ReactNode; // can be null when the model gives no per-step evidence
}

export default function ResultLayout({ layout, blocks }: { layout: LayoutKey; blocks: Blocks }) {
  const { verdict, chart, explain, evidence } = blocks;

  // explanation + evidence side by side on wide screens (used by most layouts)
  const pair = (first: ReactNode, second: ReactNode, firstWide = true) => {
    if (!first || !second) return first || second; // one of them is missing: just show the other
    return (
      <div className="grid gap-6 xl:grid-cols-5 [&>*]:min-w-0">
        <div className={firstWide ? "xl:col-span-3" : "xl:col-span-2"}>{first}</div>
        <div className={firstWide ? "xl:col-span-2" : "xl:col-span-3"}>{second}</div>
      </div>
    );
  };

  switch (layout) {
    // bedside monitor: the trace big on the left, the readout column on the right
    case "monitor":
      return (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-3 [&>*]:min-w-0">
            <div className="xl:col-span-2">{chart}</div>
            <div>{verdict}</div>
          </div>
          {pair(explain, evidence)}
        </div>
      );

    // quality check: the pass / fail strip first, then the trace, then the evidence before the text
    case "inspection":
      return (
        <div className="space-y-6">
          {verdict}
          {chart}
          {pair(evidence, explain, false)}
        </div>
      );

    // energy: the day's curve first, then the answer next to the evidence, then the text
    case "daily":
      return (
        <div className="space-y-6">
          {chart}
          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            {verdict}
            {evidence}
          </div>
          {explain}
        </div>
      );

    // dashboard: stat tiles, the wide chart, then text + evidence
    default:
      return (
        <div className="space-y-6">
          {verdict}
          {chart}
          {pair(explain, evidence)}
        </div>
      );
  }
}
