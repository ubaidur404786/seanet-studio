// the evidence regions as a readable list: when, how much of the evidence, what the signal does there
import { Clock, ScanSearch } from "lucide-react";
import type { ModelCard, Region, WindowResult } from "../types";
import { pct } from "../lib/format";

// put the backend's numbers into a short human sentence
function whatHappens(r: Region): string {
  const parts: string[] = [];
  if (r.level_change_pct != null) {
    // signals that never go below 0 (visits, kW): a percent is easy to read
    if (Math.abs(r.level_change_pct) >= 10) {
      parts.push(`${Math.abs(r.level_change_pct).toFixed(0)}% ${r.level_change_pct > 0 ? "above" : "below"} average`);
    }
  } else if (r.level_change_sd != null && Math.abs(r.level_change_sd) >= 0.5) {
    // centred signals (ECG, sensor): a percent of ~0 makes no sense, so say it in words
    const much = Math.abs(r.level_change_sd) >= 1.5 ? "much " : "";
    parts.push(`${much}${r.level_change_sd > 0 ? "higher" : "lower"} than the rest`);
  }
  if (r.roughness_ratio != null) {
    if (r.roughness_ratio >= 1.5) parts.push(`${r.roughness_ratio.toFixed(1)}× noisier than usual`);
    else if (r.roughness_ratio <= 0.6) parts.push("smoother than usual");
  }
  return parts.length ? parts.join(", ") : "shape differs from the usual pattern";
}

export default function EvidenceList({ model, window: w }: { model: ModelCard; window: WindowResult }) {
  const cls = model.classes[w.prediction.class_id];
  return (
    <div className="card h-full p-5 sm:p-6">
      <h3 className="card-title flex items-center gap-2">
        <ScanSearch className="h-4 w-4 text-accent" aria-hidden="true" /> Where the evidence is
      </h3>
      <p className="mt-0.5 text-xs text-slate-500">
        The parts the model leaned on most. This is the model's own evidence, not a proven cause.
      </p>

      {w.regions.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No single part stands out. The evidence is spread out.</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {w.regions.map((r, n) => (
            <li key={r.start} className="flex gap-3">
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                style={{ background: cls.color }}
              >
                {n + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {r.start_label ? `${r.start_label} → ${r.end_label}` : `points ${r.start} → ${r.end}`}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{whatHappens(r)}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-1.5 rounded-full" style={{ width: pct(r.share), background: cls.color }} />
                  </div>
                  <span className="w-20 text-right text-xs tabular-nums text-slate-500">{pct(r.share)} of evidence</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
