// top section: what the app does (one line), the domain picker (one tab per trained model), and
// the chosen domain - its summary, warning and test-set numbers, straight from its manifest.
// the background pattern changes with the domain's template (see index.css, .hero-bg)
import { Gauge, Layers, Microchip, Scale, Target, TriangleAlert } from "lucide-react";
import type { ModelCard } from "../types";
import { compact, pct } from "../lib/format";
import { iconFor } from "../lib/icons";

interface Props {
  models: ModelCard[];
  model: ModelCard;
  onSelect: (m: ModelCard) => void;
}

interface Chip {
  icon: typeof Target;
  label: string;
  value: string;
  warn?: boolean;
  hint?: string;
}

export default function Hero({ models, model, onSelect }: Props) {
  const { domain, stats } = model;
  const DomainIcon = iconFor(domain.icon);
  // the plain accuracy can hide weak classes. if the per-class average is clearly lower, show it too
  const unbalanced =
    stats.balanced_accuracy != null && stats.test_accuracy != null && stats.test_accuracy - stats.balanced_accuracy > 0.05;

  const chips = [
    stats.test_accuracy != null && { icon: Target, label: "Test accuracy", value: pct(stats.test_accuracy, 1) },
    unbalanced && {
      icon: Scale,
      label: "Average over classes",
      value: pct(stats.balanced_accuracy!, 1),
      warn: true,
      hint: "Every class counts the same here. Much lower than the test accuracy = some rare classes are often missed.",
    },
    stats.ndcg != null && { icon: Gauge, label: "Evidence score (NDCG)", value: stats.ndcg.toFixed(2) },
    stats.params != null && { icon: Layers, label: "Weights", value: compact(stats.params) },
    { icon: Microchip, label: "Runs on", value: "CPU · ONNX" },
  ].filter(Boolean) as Chip[];

  return (
    <section className="hero-bg">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Understand every prediction, one time step at a time.
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600 dark:text-slate-400">
          Pick a domain and run a real test example. A small model (SEA-Net) gives its answer, shows which moments made it
          decide, and a language model puts that into plain words.
        </p>

        {models.length > 1 && (
          <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Domain">
            {models.map((m) => {
              const Icon = iconFor(m.domain.icon);
              const on = m.id === model.id;
              return (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={on}
                  onClick={() => onSelect(m)}
                  className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    on
                      ? "border-transparent text-white shadow-sm"
                      : "border-slate-300 bg-white/80 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300"
                  }`}
                  style={on ? { background: m.domain.accent } : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {m.domain.short}
                </button>
              );
            })}
          </div>
        )}

        {/* key = model id: React rebuilds this block on every switch, so the fade plays again */}
        <div key={model.id} className="fade-up mt-6 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex max-w-3xl gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
              <DomainIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{domain.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{domain.summary}</p>
              {domain.warning && (
                <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {domain.warning}
                </p>
              )}
            </div>
          </div>

          <div className="lg:max-w-md">
            <dl className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {chips.map(({ icon: Icon, label, value, warn, hint }) => (
                <div key={label} className="card flex items-center gap-3 px-3.5 py-2" title={hint}>
                  <Icon className={`h-4 w-4 shrink-0 ${warn ? "text-amber-500" : "text-accent"}`} aria-hidden="true" />
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
                    <dd className={`num text-sm font-semibold ${warn ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}>
                      {value}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-[11px] text-slate-500">
              {model.test_check
                ? `Measured once on ${model.test_check.n.toLocaleString()} test examples - not on your data.`
                : "Measured once on the test set - not on your data."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
