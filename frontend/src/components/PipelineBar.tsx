// the pipeline as a horizontal progress bar, on top of the results.
// one segment per step: it fills when the step is done and moves while the step runs.
// under the bar, one line says what went in and what came out of the current step (click a
// finished step to see its line), and "Show all steps" opens every step at once.
// all numbers are the real ones the backend measured - see lib/usePipeline.ts
import { useEffect, useState } from "react";
import {
  BrainCircuit, ChevronDown, CircleX, FileInput, LoaderCircle, MessageSquareText, Microchip, ScanSearch,
  SlidersHorizontal, Workflow, type LucideIcon,
} from "lucide-react";
import type { PipelineStep } from "../lib/usePipeline";

const STEP_ICONS: Record<string, LucideIcon> = {
  read: FileInput,
  prepare: SlidersHorizontal,
  model: Microchip,
  run: BrainCircuit,
  results: ScanSearch,
  explain: MessageSquareText,
};

const ms = (v: number) => `${v < 1 ? "<1" : v.toFixed(v < 10 ? 1 : 0)} ms`;

function StepIcon({ step }: { step: PipelineStep }) {
  if (step.status === "running") return <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden="true" />;
  if (step.status === "error") return <CircleX className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />;
  const Icon = STEP_ICONS[step.key] ?? Workflow;
  const color = step.status === "done" ? "text-emerald-500" : "text-slate-300 dark:text-slate-600";
  return <Icon className={`h-4 w-4 shrink-0 ${color}`} aria-hidden="true" />;
}

const BAR: Record<PipelineStep["status"], string> = {
  waiting: "bg-slate-200 dark:bg-slate-800",
  running: "bar-running",
  done: "bg-accent",
  error: "bg-rose-500",
};

export default function PipelineBar({ steps, item }: { steps: PipelineStep[]; item: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const done = steps.filter((s) => s.status === "done").length;
  const started = steps.some((s) => s.status !== "waiting");
  const total = steps.reduce((sum, s) => sum + (s.status === "done" ? s.ms ?? 0 : 0), 0);

  // a new run starts with nothing done -> forget the step that was clicked last time
  useEffect(() => {
    if (done === 0) setPicked(null);
  }, [done]);

  // the step the line under the bar talks about: the clicked one, else the one working now,
  // else the last one that finished
  const focus =
    steps.find((s) => s.key === picked && s.status === "done") ??
    steps.find((s) => s.status === "running" || s.status === "error") ??
    [...steps].reverse().find((s) => s.status === "done");
  const focusIndex = focus ? steps.indexOf(focus) : -1;

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="card-title flex items-center gap-2">
          <Workflow className="h-4 w-4 text-accent" aria-hidden="true" />2 · What happens to your {item}
        </h2>
        {started && (
          <span className="num text-xs tabular-nums text-slate-500">
            {done} of {steps.length} steps · {total.toFixed(0)} ms
          </span>
        )}
      </div>

      <ol
        className="mt-4 grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-6"
        role="progressbar"
        aria-label="Pipeline progress"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
      >
        {steps.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => setPicked(s.key)}
              disabled={s.status !== "done"}
              aria-current={focus?.key === s.key ? "step" : undefined}
              title={s.title}
              className="w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default"
            >
              <span className={`block h-1.5 rounded-full transition-colors duration-300 ${BAR[s.status]}`} />
              <span
                className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${
                  s.status === "waiting" ? "text-slate-400" : "text-slate-800 dark:text-slate-200"
                } ${focus?.key === s.key ? "underline decoration-accent decoration-2 underline-offset-4" : ""}`}
              >
                <StepIcon step={s} />
                <span className="truncate">{s.short}</span>
              </span>
              <span className="num mt-0.5 block pl-5.5 text-[11px] tabular-nums text-slate-400">
                {s.status === "done" && s.ms != null ? ms(s.ms) : s.status === "running" ? "working…" : s.status === "error" ? "failed" : "—"}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {/* what went in and out of the step in focus */}
      <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed dark:bg-slate-800/50" aria-live="polite">
        {!started || !focus ? (
          <p className="text-slate-500">
            Pick a {item} on the left. Each step lights up here, with what goes in and what comes out.
          </p>
        ) : (
          <>
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              Step {focusIndex + 1} · {focus.title}
            </p>
            {focus.status === "error" ? (
              <p className="mt-0.5 text-rose-600 dark:text-rose-400">{focus.output}</p>
            ) : (
              <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                <span className="text-slate-400">in:</span> {focus.input ?? focus.hint}
                <span className="mx-1.5 text-slate-400">→</span>
                <span className="text-slate-400">out:</span>{" "}
                <span className="font-medium text-slate-700 dark:text-slate-300">{focus.output ?? "working…"}</span>
              </p>
            )}
          </>
        )}
      </div>

      {done > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? "rotate-180" : ""}`} aria-hidden="true" />
            {showAll ? "Hide the steps" : "Show all steps"}
          </button>
          {showAll && (
            <ol className="mt-2 divide-y divide-slate-200 text-xs dark:divide-slate-800">
              {steps.map((s, i) => (
                <li key={s.key} className="grid gap-x-3 gap-y-0.5 py-2 sm:grid-cols-[10rem_1fr_4rem]">
                  <span className="flex items-center gap-1.5 font-medium">
                    <StepIcon step={s} /> {i + 1}. {s.title}
                  </span>
                  <span className="text-slate-600 dark:text-slate-400">
                    {s.input && s.output ? (
                      <>
                        {s.input} <span className="text-slate-400">→</span> {s.output}
                      </>
                    ) : (
                      <span className="text-slate-400">{s.status === "error" ? s.output : s.hint}</span>
                    )}
                  </span>
                  <span className="num tabular-nums text-slate-400 sm:text-right">
                    {s.status === "done" && s.ms != null ? ms(s.ms) : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
