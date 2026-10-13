// the series + the model's evidence, drawn with recharts.
//
// two charts that share the same x axis (recharts "syncId" moves the hover line in both):
//   top    - the raw signal. the model's evidence regions are shaded in the class colour,
//            and for demo samples the TRUE anomaly location is drawn as a dashed box
//   bottom - the per-step score the model gave the predicted class (scaled to -1..1).
//            above 0 = "this moment supports the answer", below 0 = "this moment speaks against it"
//
// the domain's template only changes HOW the signal is drawn (line / steps / filled area, which
// grid), never the numbers - see lib/templates.ts
import { useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ChartSpline, Eye, Target } from "lucide-react";
import type { ModelCard, PredictResult, SeriesInput, WindowResult } from "../types";
import type { Template } from "../lib/templates";
import { itemWords, niceTicks, pct, timeLabel } from "../lib/format";

interface Props {
  model: ModelCard;
  input: SeriesInput;
  result: PredictResult;
  window: WindowResult;
  showAttribution: boolean;
  chart: Template["chart"];
}

interface Point {
  i: number;
  v: number;
  pos: number; // evidence above 0
  neg: number; // evidence below 0
}

function Toggle({ on, onClick, icon: Icon, children }: { on: boolean; onClick: () => void; icon: typeof Eye; children: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
        on ? "border-accent bg-accent/10 text-accent" : "border-slate-300 text-slate-500 dark:border-slate-700"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

export default function SeriesChart({ model, input, result, window: w, showAttribution, chart }: Props) {
  const [showEvidence, setShowEvidence] = useState(true);
  const [showTruth, setShowTruth] = useState(true);
  const cls = model.classes[w.prediction.class_id];
  const item = itemWords(model.domain);
  // energy draws the curve in the domain colour, the others in a neutral ink
  const lineColor = chart.fill ? "var(--color-accent)" : "var(--signal)";
  const fillId = `fill-${model.id}`;
  // the true location is only known for a test example that was used as it is
  const hasTruth = result.mode === "exact" && (input.trueRegions?.length ?? 0) > 0;

  // the timing of the points is kept unless the series had to be stretched
  const interval = result.mode !== "resampled" ? model.domain.sampling_interval_minutes : null;

  // only the values of this window. i is the position in the FULL series
  const data: Point[] = useMemo(
    () =>
      input.values.slice(w.start, w.end + 1).map((v, k) => {
        const a = w.attribution.values[k] ?? 0;
        return { i: w.start + k, v, pos: Math.max(a, 0), neg: Math.min(a, 0) };
      }),
    [input.values, w],
  );

  // nice ticks when we know the timing: one per day for long windows, every 3 hours for short ones
  const { ticks, tickText } = useMemo(() => {
    if (!interval) return { ticks: undefined, tickText: (i: number) => String(i) };
    const spanMin = (w.end - w.start) * interval;
    const stepMin = spanMin > 2 * 1440 ? 1440 : 180;
    const step = Math.max(1, Math.round(stepMin / interval));
    const list: number[] = [];
    for (let t = Math.ceil(w.start / step) * step; t <= w.end; t += step) list.push(t);
    const text = (i: number) => {
      const label = timeLabel(i, interval); // "Day 2 14:00"
      return stepMin === 1440 ? label.split(" ").slice(0, 2).join(" ") : label.split(" ")[2];
    };
    return { ticks: list, tickText: text };
  }, [interval, w.start, w.end]);

  const xAxis = (hide: boolean) => (
    <XAxis
      dataKey="i"
      type="number"
      domain={[w.start, w.end]}
      ticks={ticks}
      tickFormatter={tickText}
      hide={hide}
      tick={{ fontSize: 11 }}
      stroke="currentColor"
      className="text-slate-400"
    />
  );

  const tooltip = (
    <Tooltip
      cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }}
      content={({ active, payload }) => {
        if (!active || !payload?.length) return null;
        const p = payload[0].payload as Point;
        const score = p.pos > 0 ? p.pos : p.neg;
        return (
          <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900/95">
            <p className="font-semibold">{timeLabel(p.i, interval)}</p>
            <p>
              {model.domain.signal_name}: <span className="tabular-nums">{p.v.toFixed(2)}</span>
            </p>
            {showAttribution && (
              <p>
                Evidence for “{cls.label}”: <span className="tabular-nums">{score.toFixed(2)}</span>
              </p>
            )}
          </div>
        );
      }}
    />
  );

  // the y axis: a filled area starts at 0, a line only needs to cover its own values
  const yTicks = useMemo(() => {
    const vals = data.map((p) => p.v);
    const lo = Math.min(...vals);
    return niceTicks(chart.fill ? Math.min(0, lo) : lo, Math.max(...vals));
  }, [data, chart.fill]);

  // the grid behind the signal: ecg paper is css (index.css .ecg-paper), the others are recharts lines
  const grid =
    chart.grid === "paper" ? null : chart.grid === "blueprint" ? (
      <CartesianGrid className="stroke-slate-200 dark:stroke-slate-800" />
    ) : chart.grid === "dashed" ? (
      <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
    ) : (
      <CartesianGrid strokeDasharray="2 6" vertical={false} className="stroke-slate-200 dark:stroke-slate-800" />
    );

  // a short text version of the chart for screen readers
  const top = w.regions[0];
  const summary =
    `Chart of ${data.length} ${model.domain.signal_name} values. ` +
    (top
      ? `The model's strongest evidence for ${cls.label} is ${top.start_label ? `${top.start_label} to ${top.end_label}` : `points ${top.start} to ${top.end}`} (${pct(top.share)} of the evidence).`
      : "The model's evidence is spread out.");

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="card-title flex items-center gap-2">
            <ChartSpline className="h-4 w-4 text-accent" aria-hidden="true" />
            The {item.one} and where the model looked
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {model.domain.signal_name} ({model.domain.unit}) · shaded = the parts that decided the answer
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showAttribution && (
            <Toggle on={showEvidence} onClick={() => setShowEvidence((s) => !s)} icon={Eye}>
              Model evidence
            </Toggle>
          )}
          {hasTruth && (
            <Toggle on={showTruth} onClick={() => setShowTruth((s) => !s)} icon={Target}>
              True location
            </Toggle>
          )}
        </div>
      </div>

      <p className="sr-only">{summary}</p>
      <div className={`mt-4 ${chart.height} ${chart.grid === "paper" ? "ecg-paper rounded-md" : ""}`} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} syncId="series" margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.35 }} />
                <stop offset="100%" style={{ stopColor: "var(--color-accent)", stopOpacity: 0.02 }} />
              </linearGradient>
            </defs>
            {grid}
            {xAxis(showAttribution)}
            {/* our own ticks (lib/format.ts): recharts gave an axis up to 8 for a peak of 4.1 on
                one chart and -3.15 / -2.1 / -1.05 on another */}
            <YAxis
              tick={{ fontSize: 11 }}
              ticks={yTicks}
              domain={[yTicks[0], yTicks[yTicks.length - 1]]}
              stroke="currentColor"
              className="text-slate-400"
              width={48}
            />
            {tooltip}
            {showAttribution && showEvidence &&
              w.regions.map((r) => (
                <ReferenceArea
                  key={`e${r.start}`}
                  x1={r.start}
                  x2={Math.max(r.end, r.start + 1)}
                  fill={cls.color}
                  fillOpacity={0.12 + 0.35 * r.share}
                  stroke="none"
                  ifOverflow="extendDomain"
                />
              ))}
            {hasTruth && showTruth &&
              input.trueRegions!.map(([s, e]) =>
                // single-point events (spikes) get a line, longer ones a dashed box
                s === e ? (
                  <ReferenceLine key={`t${s}`} x={s} stroke="#64748b" strokeDasharray="4 3" />
                ) : (
                  <ReferenceArea key={`t${s}`} x1={s} x2={e} fill="none" stroke="#64748b" strokeDasharray="5 4" strokeWidth={1.5} />
                ),
              )}
            {chart.fill ? (
              <Area type={chart.curve} dataKey="v" stroke={lineColor} strokeWidth={chart.stroke} fill={`url(#${fillId})`} isAnimationActive={false} />
            ) : (
              <Line type={chart.curve} dataKey="v" dot={false} strokeWidth={chart.stroke} stroke={lineColor} isAnimationActive={false} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {showAttribution && (
        <div className="h-24 sm:h-28" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} syncId="series" margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              {xAxis(false)}
              <YAxis domain={[-1, 1]} ticks={[-1, 0, 1]} tick={{ fontSize: 10 }} stroke="currentColor" className="text-slate-400" width={48} />
              {tooltip}
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Area type="monotone" dataKey="pos" stroke={cls.color} fill={cls.color} fillOpacity={0.45} strokeWidth={1} isAnimationActive={false} />
              <Area type="monotone" dataKey="neg" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.3} strokeWidth={1} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4" style={{ background: lineColor }} /> {model.domain.signal_name.toLowerCase()}
        </span>
        {showAttribution && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-4 rounded-sm opacity-50" style={{ background: cls.color }} /> evidence for “{cls.label}”
          </span>
        )}
        {hasTruth && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-4 rounded-sm border border-dashed border-slate-500" /> where the problem really is
          </span>
        )}
      </div>
    </div>
  );
}
