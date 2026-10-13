// when a long series is cut into windows: one block per window, coloured by its answer.
// click a block to see that window's chart, evidence and explanation.
import type { ModelCard, PredictResult } from "../types";
import { pct, timeLabel } from "../lib/format";

interface Props {
  model: ModelCard;
  result: PredictResult;
  selected: number;
  onSelect: (i: number) => void;
}

export default function WindowStrip({ model, result, selected, onSelect }: Props) {
  const T = result.input_length;
  const last = result.windows[result.windows.length - 1];
  const overlap = result.windows.length > 1 && last.start % T !== 0; // the last one was moved back to fit
  const interval = model.domain.sampling_interval_minutes;

  return (
    <div className="card p-5 sm:p-6">
      <h3 className="font-semibold text-slate-900 dark:text-white">
        Your series was cut into {result.windows.length} windows
      </h3>
      <p className="mt-0.5 text-xs text-slate-500">
        {result.n_points.toLocaleString()} values → windows of {T.toLocaleString()}. Each window got its own answer.
        {overlap && " The last window was moved back so it ends at the last value, so it overlaps the one before."}{" "}
        Click a window to look at it.
      </p>

      <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(7.5rem, 1fr))` }}>
        {result.windows.map((w) => {
          const c = model.classes[w.prediction.class_id];
          const on = w.index === selected;
          return (
            <button
              key={w.index}
              onClick={() => onSelect(w.index)}
              aria-pressed={on}
              className={`rounded-lg border-2 p-2 text-left transition ${
                on ? "border-accent shadow-sm" : "border-transparent hover:border-slate-300 dark:hover:border-slate-600"
              }`}
              style={{ background: `color-mix(in srgb, ${c.color} 14%, transparent)` }}
            >
              <span className="block text-[11px] text-slate-500">
                Window {w.index + 1} · {interval ? timeLabel(w.start, interval) : `#${w.start}`}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="truncate">{c.label}</span>
              </span>
              <span className="text-xs tabular-nums text-slate-500">{pct(w.prediction.confidence)} sure</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
