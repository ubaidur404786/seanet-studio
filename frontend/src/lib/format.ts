// small formatting helpers shared by the components
import type { Domain } from "../types";

// what one model input is called in this domain: "beat", "day", "run"... ("series" if not set)
export const itemWords = (d: Domain) => d.item ?? { one: "series", many: "series" };

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

export const compact = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

// point index -> "Day 3 14:20", or "#512" when we dont know the timing of the series
export function timeLabel(i: number, intervalMin: number | null): string {
  if (!intervalMin) return `#${i}`;
  const minutes = Math.round(i * intervalMin);
  const day = Math.floor(minutes / 1440) + 1;
  const rest = minutes % 1440;
  const hh = String(Math.floor(rest / 60)).padStart(2, "0");
  const mm = String(rest % 60).padStart(2, "0");
  return `Day ${day} ${hh}:${mm}`;
}

// "nice" axis ticks: the step is 1, 2, 2.5 or 5 times a power of ten, and the ticks cover min..max.
// recharts' own ticks gave things like -3.15, -2.1, -1.05 for an ecg beat
//   e.g. niceTicks(-3.08, 0.98) -> [-4, -3, -2, -1, 0, 1]
export function niceTicks(min: number, max: number, count = 6): number[] {
  if (!(max > min)) {
    min -= 1; // a flat line: give it some room
    max += 1;
  }
  const rough = (max - min) / (count - 1);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough)!;
  const ticks: number[] = [];
  // keep adding ticks until one is at or above max. toPrecision cleans float noise like 0.30000000004
  for (let t = Math.floor(min / step) * step; t < max + step; t += step) ticks.push(Number(t.toPrecision(12)));
  return ticks;
}

// how to talk about a confidence number in plain words
export function confidenceWord(p: number): { word: string; tone: "good" | "ok" | "low" } {
  if (p >= 0.8) return { word: "High confidence", tone: "good" };
  if (p >= 0.6) return { word: "Medium confidence", tone: "ok" };
  return { word: "Low confidence", tone: "low" };
}
