// left panel: three ways to give the model a series
//   Examples - real test series, drawn small so you can see what each class looks like
//   Files    - real example csv files to download or load, or your own file
//   Paste    - numbers typed or pasted into a box
import { useRef, useState } from "react";
import { ClipboardPaste, Database, Download, FileUp, LoaderCircle, Play, Scissors, Shuffle } from "lucide-react";
import { api, exampleUrl } from "../api";
import { parseSeries } from "../lib/parseSeries";
import { itemWords } from "../lib/format";
import type { ModelCard, SampleRef, SeriesInput } from "../types";
import Sparkline from "./Sparkline";

type Tab = "examples" | "files" | "paste";

interface Props {
  model: ModelCard;
  samples: SampleRef[];
  busy: boolean;
  current: SeriesInput | null;
  onAnalyse: (input: SeriesInput) => void;
}

export default function InputPanel({ model, samples, busy, current, onAnalyse }: Props) {
  const [tab, setTab] = useState<Tab>("examples");
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // remembers which sample of each class we showed last, so clicking again shows the next one
  const nextIndex = useRef<Record<number, number>>({});
  const T = model.input_length;
  const item = itemWords(model.domain);

  // counts the clicks: if two clicks come fast, the LAST CLICKED series must win,
  // not the one whose download happened to finish last
  const clickSeq = useRef(0);

  const run = async (job: () => Promise<SeriesInput>) => {
    const mine = ++clickSeq.current;
    setError(null);
    try {
      const next = await job();
      if (mine === clickSeq.current) onAnalyse(next);
    } catch (e) {
      if (mine === clickSeq.current) setError((e as Error).message);
    }
  };

  const loadSample = (ref: SampleRef) =>
    run(async () => {
      const s = await api.sample(model.id, ref.id);
      return {
        values: s.values,
        origin: "sample",
        name: `Test example ${s.id}`,
        trueClass: s.true_class,
        trueRegions: s.true_regions,
      };
    });

  const pickClass = (classId: number) => {
    const ofClass = samples.filter((s) => s.true_class === classId);
    if (ofClass.length === 0) return;
    const i = nextIndex.current[classId] ?? 0;
    nextIndex.current[classId] = (i + 1) % ofClass.length;
    void loadSample(ofClass[i]);
  };

  const readFile = (file: File) =>
    run(async () => {
      if (file.size > 2_000_000) throw new Error("That file is over 2 MB - please use a smaller one.");
      return { values: parseSeries(await file.text()), origin: "upload", name: file.name };
    });

  const loadExample = (name: string) =>
    run(async () => ({ values: parseSeries(await api.exampleText(model.id, name)), origin: "upload", name }));

  const tabs: { id: Tab; label: string; icon: typeof Database }[] = [
    { id: "examples", label: "Examples", icon: Database },
    { id: "files", label: "Files", icon: FileUp },
    { id: "paste", label: "Paste", icon: ClipboardPaste },
  ];

  // the first sample of each class, for the picture on its button
  const previewOf = (classId: number) => samples.find((s) => s.true_class === classId)?.preview ?? [];

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-4 dark:border-slate-800">
        <h2 className="card-title">1 · Pick a {item.one}</h2>
        {/* how the length is handled - said once, plainly */}
        <p className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-slate-500">
          <Scissors className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            The model reads <b>{T.toLocaleString()}</b> values at a time (one {item.one}). Shorter series are stretched
            to fit. Longer ones are cut into windows of {T.toLocaleString()} values, and each window gets its own answer.
          </span>
        </p>
      </div>

      <div role="tablist" className="grid grid-cols-3 gap-1 border-b border-slate-200 p-1.5 dark:border-slate-800">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setError(null);
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition ${
              tab === id ? "bg-accent/10 text-accent" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "examples" && (
          <div>
            <p className="mb-3 text-xs text-slate-500">
              Real test {item.many} the model never saw while training. Click one to run it - click again for another
              one of the same class.
              {!model.has_true_regions && " For this data we know the true class, but not where in the series the problem is."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {model.classes.map((c) => {
                const active = current?.origin === "sample" && current.trueClass === c.id;
                return (
                  <button
                    key={c.id}
                    disabled={busy}
                    onClick={() => pickClass(c.id)}
                    title={c.description}
                    className={`rounded-lg border p-2 text-left transition disabled:opacity-50 ${
                      active
                        ? "border-accent bg-accent/10"
                        : "border-slate-200 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500"
                    }`}
                  >
                    <Sparkline values={previewOf(c.id)} color={c.color} className="h-8 w-full" />
                    <span className="mt-1 flex items-center gap-1.5 text-xs font-medium">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                      <span className="truncate">{c.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => samples.length && void loadSample(samples[Math.floor(Math.random() * samples.length)])}
              disabled={busy || samples.length === 0}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
              Random example
            </button>
          </div>
        )}

        {tab === "files" && (
          <div className="space-y-4">
            {model.examples.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-slate-500">
                  Real CSV files made from the test set. Download one to see the format, or run it straight away.
                </p>
                <ul className="space-y-2">
                  {model.examples.map((e) => (
                    <li key={e.name} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <p className="text-sm font-medium">{e.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{e.note}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => void loadExample(e.name)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" /> Run it
                        </button>
                        <a
                          href={exampleUrl(model.id, e.name)}
                          download={e.name}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          <Download className="h-3 w-3" /> {e.name}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) void readFile(f);
              }}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition ${
                dragging ? "border-accent bg-accent/5" : "border-slate-300 dark:border-slate-700"
              }`}
            >
              <FileUp className="h-7 w-7 text-slate-400" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium">Or drop your own .csv / .txt</p>
              <p className="mt-1 text-xs text-slate-500">One column of values, or one row. A header is fine.</p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="mt-3 rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Browse files
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,.tsv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readFile(f);
                  e.target.value = ""; // so picking the same file again still fires
                }}
              />
            </div>
          </div>
        )}

        {tab === "paste" && (
          <div>
            <label htmlFor="paste" className="text-xs text-slate-500">
              Numbers separated by commas, spaces or new lines. More than {T.toLocaleString()} values will be cut into
              windows.
            </label>
            <textarea
              id="paste"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={7}
              placeholder="3.1, 3.4, 3.9, 4.6, 5.2, ..."
              className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-transparent p-3 font-mono text-xs focus:border-accent focus:outline-none dark:border-slate-700"
            />
            <button
              onClick={() => run(async () => ({ values: parseSeries(pasted), origin: "paste", name: "Pasted series" }))}
              disabled={busy || pasted.trim().length === 0}
              className="mt-2 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              Run
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        {current && (
          <p className="mt-4 truncate border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800">
            Now showing: <span className="font-medium text-slate-700 dark:text-slate-300">{current.name}</span> ·{" "}
            {current.values.length.toLocaleString()} values
          </p>
        )}
      </div>
    </div>
  );
}
