// the answer: predicted class, how sure, and the chance of every class.
// one card, four looks - the domain's template picks one (see lib/templates.ts):
//   tiles   - four small stat tiles, like a monitoring dashboard        (web traffic)
//   readout - big numbers in a narrow column, like a bedside monitor    (ECG)
//   stamp   - a wide pass / fail strip with a segment gauge             (chip factory)
//   season  - a big class icon and a split bar between the two groups   (home electricity)
// colours, words and icons come from the manifest.
import { useState } from "react";
import { Activity, CircleCheck, CircleX, Tag, TriangleAlert } from "lucide-react";
import type { ClassInfo, ModelCard, PredictResult, SeriesInput, WindowResult } from "../types";
import type { VerdictStyle } from "../lib/templates";
import { confidenceWord, itemWords, pct } from "../lib/format";
import { iconFor } from "../lib/icons";

interface Props {
  model: ModelCard;
  result: PredictResult;
  window: WindowResult;
  input: SeriesInput;
  style: VerdictStyle;
}

// no check mark for "normal": a tick would look like "this answer is right", and we cant know that
const BADGE = {
  normal: { text: "Looks normal", icon: Activity, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  anomaly: { text: "Problem found", icon: TriangleAlert, cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  category: { text: "Group", icon: Tag, cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
};

const TONE = {
  good: "text-emerald-600 dark:text-emerald-400",
  ok: "text-amber-600 dark:text-amber-400",
  low: "text-rose-600 dark:text-rose-400",
};

const tint = (color: string, amount: number) => `color-mix(in srgb, ${color} ${amount}%, transparent)`;

function KindBadge({ cls }: { cls: ClassInfo }) {
  const b = BADGE[cls.kind];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}>
      <b.icon className="h-3.5 w-3.5" aria-hidden="true" />
      {b.text}
    </span>
  );
}

// for test examples we know the truth - say plainly if the model got it right
function Truth({ model, input, cls }: { model: ModelCard; input: SeriesInput; cls: ClassInfo }) {
  if (input.trueClass == null) return null;
  const truth = model.classes[input.trueClass];
  const right = truth.id === cls.id;
  const Icon = right ? CircleCheck : CircleX;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${right ? "text-emerald-500" : "text-rose-500"}`} aria-hidden="true" />
      <span>
        True class: <span className="font-medium text-slate-700 dark:text-slate-300">{truth.label}</span> ·{" "}
        {right ? "the model got it right" : "the model got this one wrong"}
      </span>
    </p>
  );
}

function ProbList({ model, w, columns = 1, start = 4 }: { model: ModelCard; w: WindowResult; columns?: 1 | 2; start?: number }) {
  const [all, setAll] = useState(false);
  const probs = all ? w.probabilities : w.probabilities.slice(0, start);
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chance of each class</h3>
      <ul className={`mt-2 grid gap-x-6 gap-y-2 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
        {probs.map((p) => {
          const c = model.classes[p.class_id];
          return (
            <li key={p.class_id}>
              <div className="flex justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                  <span className="truncate">{c.label}</span>
                </span>
                <span className="num tabular-nums text-slate-500">{pct(p.probability, 1)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-1.5 rounded-full transition-[width] duration-500"
                  style={{ width: `${Math.max(p.probability * 100, 0.5)}%`, background: c.color }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {w.probabilities.length > start && (
        <button onClick={() => setAll((s) => !s)} className="mt-2 text-xs font-medium text-accent hover:underline">
          {all ? "Show fewer" : `Show all ${w.probabilities.length} classes`}
        </button>
      )}
    </div>
  );
}

// two classes: one bar, split where the chances meet (e.g. warm 30% | cold 70%)
function SplitBar({ model, w }: { model: ModelCard; w: WindowResult }) {
  const [a, b] = model.classes;
  const pa = w.probabilities.find((p) => p.class_id === a.id)!.probability;
  const IconA = iconFor(a.icon);
  const IconB = iconFor(b.icon);
  return (
    <div>
      <div className="flex justify-between text-sm font-medium">
        <span className="flex items-center gap-1.5">
          {a.icon && <IconA className="h-4 w-4" style={{ color: a.color }} aria-hidden="true" />}
          {a.label} <span className="num tabular-nums text-slate-500">{pct(pa)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="num tabular-nums text-slate-500">{pct(1 - pa)}</span> {b.label}
          {b.icon && <IconB className="h-4 w-4" style={{ color: b.color }} aria-hidden="true" />}
        </span>
      </div>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full" role="img" aria-label={`${a.label} ${pct(pa)}, ${b.label} ${pct(1 - pa)}`}>
        <div className="transition-[width] duration-500" style={{ width: `${pa * 100}%`, background: a.color }} />
        <div className="flex-1" style={{ background: b.color }} />
      </div>
    </div>
  );
}

function Footer({ cls, result }: { cls: ClassInfo; result: PredictResult }) {
  return (
    <>
      <p className="mt-5 border-t border-slate-200 pt-4 text-sm leading-relaxed text-slate-600 dark:border-slate-800 dark:text-slate-400">
        {cls.description}
      </p>
      {result.mode === "resampled" && (
        <p className="mt-2 text-xs text-slate-400">
          Stretched from {result.n_points.toLocaleString()} to {result.input_length.toLocaleString()} values for the model.
        </p>
      )}
    </>
  );
}

export default function PredictionCard({ model, result, window: w, input, style }: Props) {
  const cls = model.classes[w.prediction.class_id];
  const conf = confidenceWord(w.prediction.confidence);
  const runner = w.probabilities[1];
  const item = itemWords(model.domain);
  const windowLabel = result.windows.length > 1 && (
    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
      Window {w.index + 1} of {result.windows.length}
    </p>
  );

  // ---- tiles: a monitoring dashboard ---------------------------------------------------------
  if (style === "tiles") {
    const top = w.regions[0];
    const tiles = [
      { label: "Answer", body: <><KindBadge cls={cls} /><p className="mt-1.5 truncate text-lg font-semibold" style={{ color: cls.color }}>{cls.label}</p></> },
      {
        label: "Confidence",
        body: (
          <>
            <p className="num text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{pct(w.prediction.confidence)}</p>
            <p className={`text-xs font-medium ${TONE[conf.tone]}`}>{conf.word}</p>
          </>
        ),
      },
      {
        label: "Next best",
        body: (
          <>
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{runner.label}</p>
            <p className="num text-xs tabular-nums text-slate-500">{pct(runner.probability, 1)}</p>
          </>
        ),
      },
      {
        label: "Main evidence",
        body: top ? (
          <>
            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
              {top.start_label ? `from ${top.start_label}` : `points ${top.start}-${top.end}`}
            </p>
            <p className="text-xs text-slate-500">{pct(top.share)} of the evidence</p>
          </>
        ) : (
          <p className="text-sm text-slate-500">spread out</p>
        ),
      },
    ];
    return (
      <div className="card p-4 sm:p-5">
        {windowLabel}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="min-w-0 rounded-md border border-slate-200 p-3 dark:border-slate-800">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t.label}</p>
              {t.body}
            </div>
          ))}
        </div>
        <Truth model={model} input={input} cls={cls} />
        <div className="mt-4">
          <ProbList model={model} w={w} columns={2} />
        </div>
        <Footer cls={cls} result={result} />
      </div>
    );
  }

  // ---- readout: a bedside-monitor column ------------------------------------------------------
  if (style === "readout") {
    return (
      <div className="card h-full p-5">
        {windowLabel}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{item.one} type</p>
        <p className="mt-1 text-2xl font-bold leading-tight" style={{ color: cls.color }}>
          {cls.label}
        </p>
        <div className="mt-2">
          <KindBadge cls={cls} />
        </div>
        <p className="mt-4 flex items-baseline gap-1.5">
          <span className="num text-5xl font-bold tabular-nums text-slate-900 dark:text-white">
            {Math.round(w.prediction.confidence * 100)}
          </span>
          <span className="text-sm text-slate-500">% sure</span>
        </p>
        <p className={`text-sm font-medium ${TONE[conf.tone]}`}>{conf.word}</p>
        <Truth model={model} input={input} cls={cls} />
        <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
          <ProbList model={model} w={w} start={model.classes.length} />
        </div>
        <Footer cls={cls} result={result} />
      </div>
    );
  }

  // ---- stamp: a quality-check strip ------------------------------------------------------------
  if (style === "stamp") {
    const SEGMENTS = 20;
    const lit = Math.round(w.prediction.confidence * SEGMENTS);
    return (
      <div className="card overflow-hidden">
        <div className="flex flex-col md:flex-row">
          <div className="border-l-8 p-5 md:w-2/5" style={{ borderColor: cls.color, background: tint(cls.color, 8) }}>
            {windowLabel}
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Result for this {item.one}</p>
            <p className="num mt-1 text-2xl font-bold uppercase tracking-wide" style={{ color: cls.color }}>
              {cls.label}
            </p>
            <div className="mt-2">
              <KindBadge cls={cls} />
            </div>
            {/* a segment gauge: one block per 5% */}
            <div className="mt-4 flex gap-0.5" role="img" aria-label={`Confidence ${pct(w.prediction.confidence)}`}>
              {Array.from({ length: SEGMENTS }, (_, i) => (
                <span
                  key={i}
                  className="h-4 flex-1 rounded-[2px]"
                  style={{ background: i < lit ? cls.color : tint("#94a3b8", 25) }}
                />
              ))}
            </div>
            <p className="num mt-1.5 text-sm tabular-nums">
              {pct(w.prediction.confidence)} confidence · <span className={TONE[conf.tone]}>{conf.word}</span>
            </p>
            <Truth model={model} input={input} cls={cls} />
          </div>
          <div className="flex-1 p-5">
            <ProbList model={model} w={w} />
            <Footer cls={cls} result={result} />
          </div>
        </div>
      </div>
    );
  }

  // ---- season: a big class icon + a split bar --------------------------------------------------
  const ClassIcon = iconFor(cls.icon);
  return (
    <div className="card h-full p-5 sm:p-6">
      {windowLabel}
      <div className="flex items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full" style={{ background: tint(cls.color, 15), color: cls.color }}>
          <ClassIcon className="h-8 w-8" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-slate-500">This {item.one} looks like</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{cls.label}</h2>
          <p className={`text-sm font-medium ${TONE[conf.tone]}`}>
            {conf.word} · {pct(w.prediction.confidence)}
          </p>
        </div>
      </div>
      <div className="mt-5">{model.classes.length === 2 ? <SplitBar model={model} w={w} /> : <ProbList model={model} w={w} />}</div>
      <Truth model={model} input={input} cls={cls} />
      <Footer cls={cls} result={result} />
    </div>
  );
}
