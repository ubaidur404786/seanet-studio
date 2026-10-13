// "under the hood": how the model works, then three cards that keep three kinds of numbers apart
//   Model card   - facts about the trained file (from export_info.json)
//   Test results - measured ONCE on the whole test split (model_export/check_test_set.py)
//   This session - measured live on your last run (the steps the backend timed)
// plus the limits. every number here comes from a file or a real run - nothing is typed in by hand.
import { BrainCircuit, Database, Layers, LineChart, MessageSquareText, Timer, TriangleAlert } from "lucide-react";
import type { ModelCard, PredictResult } from "../types";
import { compact, itemWords, pct } from "../lib/format";

const WEAK = 0.7; // a class the model finds less than 70% of the time is marked as weak

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-3 divide-y divide-slate-200 text-sm dark:divide-slate-800">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-1.5">
          <dt className="shrink-0 text-slate-500">{k}</dt>
          {/* break-all: long values like the engine version must wrap on a phone */}
          <dd className="num min-w-0 break-all text-right font-mono text-xs text-slate-800 sm:text-sm dark:text-slate-200">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function HowItWorks({ model, result }: { model: ModelCard; result: PredictResult | null }) {
  const { stats, model_card: card, runtime, test_check: check } = model;
  const item = itemWords(model.domain);

  const steps = [
    {
      icon: LineChart,
      title: "1. Prepare",
      text: `The model reads ${model.input_length.toLocaleString()} values at a time (one ${item.one}). Short series are stretched, long ones are cut into windows. Each window is scaled to mean 0, the same way as in training.`,
    },
    {
      icon: Layers,
      title: "2. Run the model",
      text: "The trained SEA-Net file reads the whole window in one go, on a normal CPU, in milliseconds.",
    },
    {
      icon: BrainCircuit,
      title: "3. Decide and point",
      text: "Each time step gets a score for each class, and the answer is built from those scores. So the shaded parts are really what decided it.",
    },
    {
      icon: MessageSquareText,
      title: "4. Explain",
      text: "Only the facts (class, how sure, where the evidence is, what the signal does there) go to a free language model, which writes them in simple words.",
    },
  ];

  const modelRows: [string, string][] = [
    ["Weights", stats.params != null ? `${compact(stats.params)} (${stats.params.toLocaleString()})` : "-"],
    ["Model file", stats.onnx_size_kb != null ? `ONNX, ${(stats.onnx_size_kb / 1024).toFixed(1)} MB` : "-"],
    ["Input shape", runtime.input_shape.join(" × ")],
    ["ONNX opset", runtime.onnx_opset != null ? String(runtime.onnx_opset) : "-"],
    [
      "ONNX vs PyTorch",
      runtime.onnx_vs_torch_max_diff != null ? `max diff ${runtime.onnx_vs_torch_max_diff.toExponential(1)}` : "-",
    ],
    ["Trained on", runtime.dataset ? `${runtime.dataset}, seed ${runtime.seed}` : "-"],
  ];

  // live numbers from the last run, if there was one
  const step = (key: string) => result?.steps.find((s) => s.key === key)?.ms;
  const liveRows: [string, string][] = result
    ? [
        ["Model run", step("run") != null ? `${step("run")!.toFixed(1)} ms` : "-"],
        ["Whole request", `${result.latency_ms} ms`],
        ["Windows", String(result.windows.length)],
        ["Engine", `${runtime.engine}, CPU, ${runtime.threads} threads`],
      ]
    : [];

  return (
    <section id="under-the-hood" className="border-t border-slate-200 bg-white py-14 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">How it works</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">{card.how_it_explains}</p>

        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, text }) => (
            <li key={title} className="card p-5">
              <Icon className="h-6 w-6 text-accent" aria-hidden="true" />
              <h3 className="mt-3 font-semibold text-slate-900 dark:text-white">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
          {/* ---- the trained file ---- */}
          <div className="card p-5 sm:p-6">
            <h3 className="card-title flex items-center gap-2">
              <Layers className="h-4 w-4 text-accent" aria-hidden="true" /> Model card
            </h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{card.architecture}</p>
            <Rows rows={modelRows} />
          </div>

          {/* ---- measured once on the test split ---- */}
          <div className="card p-5 sm:p-6">
            <h3 className="card-title flex items-center gap-2">
              <Database className="h-4 w-4 text-accent" aria-hidden="true" /> Test results
            </h3>
            <p className="mt-1.5 text-xs text-slate-500">
              {check
                ? `All ${check.n.toLocaleString()} test ${item.many}, run again through the app's own ONNX file.${
                    check.matches_training ? " Same accuracy as in training." : ""
                  }`
                : "From the training run."}{" "}
              Measured once - not on your data.
            </p>
            <Rows
              rows={[
                ["Accuracy", stats.test_accuracy != null ? pct(stats.test_accuracy, 1) : "-"],
                ["Average over classes", stats.balanced_accuracy != null ? pct(stats.balanced_accuracy, 1) : "-"],
                ...(stats.ndcg != null ? ([["Evidence score (NDCG)", stats.ndcg.toFixed(3)]] as [string, string][]) : []),
              ]}
            />
            {check && (
              <>
                <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Found per class</h4>
                <ul className="mt-2 space-y-2">
                  {check.per_class.map((c) => {
                    const cls = model.classes[c.class_id];
                    const weak = c.accuracy != null && c.accuracy < WEAK;
                    return (
                      <li key={c.class_id} className="text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cls.color }} />
                            <span className="truncate">{cls.label}</span>
                            {weak && <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="weak class" />}
                          </span>
                          <span className={`num shrink-0 tabular-nums ${weak ? "font-semibold text-amber-600 dark:text-amber-400" : "text-slate-500"}`}>
                            {c.right.toLocaleString()} / {c.n.toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-1.5 rounded-full"
                            style={{ width: `${(c.accuracy ?? 0) * 100}%`, background: weak ? "#f59e0b" : cls.color }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {card.baseline ? <p className="mt-4 text-xs text-slate-500">Baseline: {card.baseline}</p> : null}
          </div>

          {/* ---- live + limits ---- */}
          <div className="space-y-6">
            <div className="card p-5 sm:p-6">
              <h3 className="card-title flex items-center gap-2">
                <Timer className="h-4 w-4 text-accent" aria-hidden="true" /> This session (live)
              </h3>
              {result ? (
                <>
                  <p className="mt-1.5 text-xs text-slate-500">Timed by the server on your last run.</p>
                  <Rows rows={liveRows} />
                </>
              ) : (
                <p className="mt-1.5 text-sm text-slate-500">Run a {item.one} to see real timings here.</p>
              )}
            </div>

            <div className="card p-5 sm:p-6">
              <h3 className="card-title flex items-center gap-2">
                <TriangleAlert className="h-4 w-4 text-amber-500" aria-hidden="true" /> Limits - read before you trust it
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-400">
                {(card.limitations ?? []).map((l) => (
                  <li key={l}>{l}</li>
                ))}
                <li>
                  The text is written by a language model. It only gets the model's facts, but it can still word things
                  badly. Trust the chart over the text.
                </li>
              </ul>
              {model.domain.data_note && <p className="mt-4 text-xs text-slate-500">{model.domain.data_note}</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
