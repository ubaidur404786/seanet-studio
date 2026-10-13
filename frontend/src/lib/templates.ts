// the look of each domain. a manifest only says "template": "clinical" - this file decides what
// that means: how the results are laid out, how the answer is shown and how the chart is drawn.
//
// the css part (card corners, title style, the hero background) is in index.css, keyed on the
// data-template="..." attribute that App puts on the page. so switching domain = switching one
// attribute + one object from this file, nothing else.
import type { TemplateKey } from "../types";

// where the blocks go in the results column (see components/ResultLayout.tsx)
//   dashboard  - stat tiles on top, then a wide chart (like a monitoring dashboard)
//   monitor    - chart and a readout column side by side (like a bedside monitor)
//   inspection - a big pass / fail strip first, then the chart (like a quality-check station)
//   daily      - the day's curve first, then the answer next to the evidence
export type LayoutKey = "dashboard" | "monitor" | "inspection" | "daily";

// how the answer card looks (see components/PredictionCard.tsx)
export type VerdictStyle = "tiles" | "readout" | "stamp" | "season";

export interface Template {
  key: TemplateKey;
  layout: LayoutKey;
  verdict: VerdictStyle;
  chart: {
    curve: "monotone" | "linear" | "stepAfter"; // how points are joined
    fill: boolean; // area under the line or not
    grid: "dashed" | "paper" | "blueprint" | "soft"; // paper = ecg paper drawn behind the chart
    stroke: number; // line width
    height: string; // tailwind height classes for the main chart
  };
}

export const TEMPLATES: Record<TemplateKey, Template> = {
  monitoring: {
    key: "monitoring",
    layout: "dashboard",
    verdict: "tiles",
    chart: { curve: "monotone", fill: false, grid: "dashed", stroke: 1.3, height: "h-64 sm:h-80" },
  },
  clinical: {
    key: "clinical",
    layout: "monitor",
    verdict: "readout",
    // ecg is drawn with straight lines on "paper", like a printed strip
    chart: { curve: "linear", fill: false, grid: "paper", stroke: 1.8, height: "h-64 sm:h-80" },
  },
  industrial: {
    key: "industrial",
    layout: "inspection",
    verdict: "stamp",
    // a sensor log is drawn as steps: the value holds until the next reading
    chart: { curve: "stepAfter", fill: false, grid: "blueprint", stroke: 1.5, height: "h-64 sm:h-72" },
  },
  energy: {
    key: "energy",
    layout: "daily",
    verdict: "season",
    chart: { curve: "monotone", fill: true, grid: "soft", stroke: 2, height: "h-64 sm:h-80" },
  },
};

// unknown or missing template -> the monitoring one (it fits any time series)
export const templateFor = (key?: string): Template =>
  TEMPLATES[(key ?? "") as TemplateKey] ?? TEMPLATES.monitoring;
