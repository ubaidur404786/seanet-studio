// the whole page. it holds the state (which model, which series, the result) and passes it down.
//
// flow when the user picks a series:
//   1. /predict  -> fast. the pipeline bar then "plays" the real steps one by one,
//                   and when it reaches "Read the answer" the result cards appear
//   2. /explain  -> slower (LLM, 1-3 s). the last step moves until the text arrives
// a request counter (inside usePipeline) makes sure an old, slow answer never overwrites a newer one.
//
// the look follows the chosen domain: its manifest names a template (lib/templates.ts), we put
// data-template="..." on the page for the css part and pass the layout + chart style down.
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { api } from "./api";
import type { Explanation, ModelCard, PredictResult, SampleRef, SeriesInput } from "./types";
import { useTheme } from "./lib/useTheme";
import { usePipeline } from "./lib/usePipeline";
import { templateFor } from "./lib/templates";
import { itemWords } from "./lib/format";
import Header from "./components/Header";
import Hero from "./components/Hero";
import InputPanel from "./components/InputPanel";
import PipelineBar from "./components/PipelineBar";
import ResultLayout from "./components/ResultLayout";
import WindowStrip from "./components/WindowStrip";
import PredictionCard from "./components/PredictionCard";
import SeriesChart from "./components/SeriesChart";
import EvidenceList from "./components/EvidenceList";
import ExplanationCard from "./components/ExplanationCard";
import HowItWorks from "./components/HowItWorks";
import EmptyState from "./components/EmptyState";
import Footer from "./components/Footer";

const TRIES = 36; // 36 tries x 5 s = 3 minutes

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const pipe = usePipeline();
  const [models, setModels] = useState<ModelCard[]>([]);
  const [model, setModel] = useState<ModelCard | null>(null);
  const [samples, setSamples] = useState<SampleRef[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [waking, setWaking] = useState(false); // true after the first failed try = server is asleep

  const [input, setInput] = useState<SeriesInput | null>(null);
  const [result, setResult] = useState<PredictResult | null>(null);
  const [windowIdx, setWindowIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);

  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  // its own counter: clicking two windows fast must not show the first window's text last
  const explainSeq = useRef(0);

  // load the model list once. the free server (Hugging Face) sleeps after 2 days without
  // visitors and needs a minute or two to wake up, so we keep trying every 5 s for ~3 minutes
  // instead of showing an error straight away
  useEffect(() => {
    let alive = true;
    const load = async () => {
      for (let attempt = 1; attempt <= TRIES; attempt++) {
        try {
          const list = await api.models();
          if (!alive) return;
          setModels(list);
          setModel(list[0] ?? null);
          return;
        } catch (e) {
          if (!alive) return;
          if (attempt === TRIES) {
            setBootError((e as Error).message);
            return;
          }
          setWaking(true);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    };
    void load();
    return () => {
      alive = false;
    };
  }, []);

  // a new domain was picked. the old result is cleared in the SAME click: if it waited for the
  // effect below, the first render would draw the old result with the new model's classes
  // (web traffic has 10 classes, ecg only 5) and crash on a class that does not exist
  const selectModel = (m: ModelCard) => {
    if (m.id === model?.id) return;
    setResult(null);
    setInput(null);
    setExplanation(null);
    setExplainError(null);
    setPredictError(null);
    setBusy(false);
    setModel(m);
  };

  // every time the model changes: load its examples, reset the pipeline, set its colour
  useEffect(() => {
    if (!model) return;
    document.documentElement.style.setProperty("--accent", model.domain.accent);
    pipe.reset();
    setSamples([]);
    // "alive" goes false when the domain changes again, so a slow answer for the old domain is ignored
    let alive = true;
    api
      .samples(model.id)
      .then((s) => alive && setSamples(s))
      .catch(() => alive && setSamples([]));
    return () => {
      alive = false;
    };
  }, [model]);

  const explain = useCallback(
    async (values: number[], window: number, id: number) => {
      if (!model) return;
      const mine = ++explainSeq.current;
      const stale = () => id !== pipe.current.current || mine !== explainSeq.current;
      setExplaining(true);
      setExplainError(null);
      setExplanation(null);
      pipe.begin("explain");
      try {
        const r = await api.explain(model.id, values, window);
        if (stale()) return;
        setExplanation(r.explanation);
        pipe.finish(r.step);
      } catch (e) {
        if (stale()) return;
        setExplainError((e as Error).message);
        pipe.fail((e as Error).message, "explain");
      } finally {
        if (!stale()) setExplaining(false);
      }
    },
    [model, pipe],
  );

  const analyse = useCallback(
    async (next: SeriesInput) => {
      if (!model) return;
      const id = pipe.start();
      setInput(next);
      setBusy(true);
      setPredictError(null);
      setExplanation(null);
      setExplainError(null);
      setResult(null);
      try {
        const r = await api.predict(model.id, next.values);
        if (!(await pipe.play(r.steps, id))) return; // a newer request took over
        setResult(r);
        setWindowIdx(0);
        setBusy(false);
        void explain(next.values, 0, id); // the llm part runs on its own
      } catch (e) {
        if (id !== pipe.current.current) return;
        setPredictError((e as Error).message);
        pipe.fail((e as Error).message);
        setBusy(false);
      }
    },
    [model, explain, pipe],
  );

  // a new window was clicked: same result, but explain that window
  const selectWindow = (i: number) => {
    if (!input || i === windowIdx) return;
    setWindowIdx(i);
    void explain(input.values, i, pipe.current.current);
  };

  if (bootError) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="card max-w-md p-6 text-center">
          <p className="font-semibold">Could not reach the server</p>
          <p className="mt-2 text-sm text-slate-500">{bootError}</p>
          <p className="mt-4 text-xs text-slate-400">
            We kept trying for 3 minutes. The free server may be restarting - please refresh the page in a little while.
          </p>
        </div>
      </div>
    );
  }

  const outputs = model?.outputs ?? [];
  // safety net: only draw a result that belongs to the model on screen
  const shown = result && model && result.model_id === model.id ? result : null;
  const w = shown?.windows[windowIdx];
  const tpl = templateFor(model?.domain.template);

  return (
    <div className="min-h-screen" data-template={tpl.key}>
      <Header model={model} theme={theme} onToggleTheme={toggleTheme} />
      {model ? (
        <>
          <Hero models={models} model={model} onSelect={selectModel} />
          {/* key = model id: a new domain rebuilds the page, so the fade plays and old state is gone */}
          <main key={model.id} className="fade-up mx-auto grid max-w-7xl gap-6 px-4 pb-16 sm:px-6 lg:grid-cols-12 lg:px-8">
            <aside className="min-w-0 lg:col-span-4">
              <InputPanel model={model} samples={samples} busy={busy} onAnalyse={analyse} current={input} />
            </aside>

            <section className="min-w-0 space-y-6 lg:col-span-8" aria-live="polite">
              {/* the progress bar sits on top, above the plots, so you see each step happen */}
              <PipelineBar steps={pipe.steps} item={itemWords(model.domain).one} />

              {predictError && (
                <div role="alert" className="card border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  {predictError}
                </div>
              )}
              {!shown && !predictError && <EmptyState model={model} loading={busy} />}

              {shown && input && w && (
                <div className="space-y-6">
                  {shown.windows.length > 1 && (
                    <WindowStrip model={model} result={shown} selected={windowIdx} onSelect={selectWindow} />
                  )}
                  {/* each block only shows up if the model really gives that kind of output */}
                  <ResultLayout
                    layout={tpl.layout}
                    blocks={{
                      verdict: outputs.includes("class_probabilities") && (
                        <PredictionCard model={model} result={shown} window={w} input={input} style={tpl.verdict} />
                      ),
                      chart: (
                        <SeriesChart
                          model={model}
                          input={input}
                          result={shown}
                          window={w}
                          showAttribution={outputs.includes("timestep_attribution")}
                          chart={tpl.chart}
                        />
                      ),
                      explain: (
                        <ExplanationCard
                          explanation={explanation}
                          loading={explaining}
                          error={explainError}
                          onRetry={() => explain(input.values, windowIdx, pipe.current.current)}
                        />
                      ),
                      evidence: outputs.includes("timestep_attribution") ? <EvidenceList model={model} window={w} /> : null,
                    }}
                  />
                </div>
              )}
            </section>
          </main>
          <HowItWorks model={model} result={shown} />
        </>
      ) : (
        <div className="grid min-h-[60vh] place-items-center p-6 text-center text-sm text-slate-500" aria-live="polite">
          {waking ? (
            <div className="max-w-sm">
              <LoaderCircle className="mx-auto h-6 w-6 animate-spin text-accent" aria-hidden="true" />
              <p className="mt-3 font-medium text-slate-700 dark:text-slate-200">Waking up the free server…</p>
              <p className="mt-1">
                It goes to sleep when nobody has used it for a while, and the first visit after that can take a minute
                or two. This page keeps trying by itself.
              </p>
            </div>
          ) : (
            "Loading the model…"
          )}
        </div>
      )}
      <Footer />
    </div>
  );
}
