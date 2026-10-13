// the plain-English explanation written by the LLM (or by the template when the LLM is off).
// the backend asks for three titled parts and "- " bullets, so we can render it without a
// markdown library: a known title becomes a heading, "- " becomes a list item, the rest a paragraph.
import { useState, type ReactNode } from "react";
import { Bot, Braces, ChevronDown, FileText, MessageSquareText, RefreshCw } from "lucide-react";
import type { Explanation } from "../types";

const TITLES = ["What the model found", "Why it thinks so", "How sure it is"];

function Body({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`u${blocks.length}`} className="ml-4 list-disc space-y-1">
          {bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const title = TITLES.find((t) => line.replace(/:$/, "").toLowerCase() === t.toLowerCase());
    if (title) {
      flush();
      blocks.push(
        <h4 key={`h${blocks.length}`} className="pt-2 text-xs font-semibold uppercase tracking-wide text-accent first:pt-0">
          {title}
        </h4>,
      );
    } else if (line.startsWith("- ") || line.startsWith("• ")) {
      bullets.push(line.slice(2));
    } else {
      flush();
      blocks.push(<p key={`p${blocks.length}`}>{line}</p>);
    }
  }
  flush();
  return <div className="space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{blocks}</div>;
}

interface Props {
  explanation: Explanation | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function ExplanationCard({ explanation, loading, error, onRetry }: Props) {
  const [showFacts, setShowFacts] = useState(false);
  const fromLlm = explanation?.source === "llm";
  return (
    <div className="card h-full p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="card-title flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-accent" aria-hidden="true" /> In plain words
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">SEA-Net decides. The language model only puts it into words.</p>
        </div>
        {explanation && (
          // who wrote this text - so nobody mixes up the model's output with the generated text
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
              fromLlm ? "bg-accent/10 text-accent" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {fromLlm ? <Bot className="h-3 w-3" aria-hidden="true" /> : <FileText className="h-3 w-3" aria-hidden="true" />}
            {fromLlm ? `Written by ${explanation.llm_model}` : "Written from a template"}
          </span>
        )}
      </div>

      <div className="mt-4">
        {loading && (
          <div className="animate-pulse space-y-2.5" aria-label="Writing the explanation">
            {[90, 75, 95, 60, 85, 40].map((w, i) => (
              <div key={i} className="h-3 rounded bg-slate-200 dark:bg-slate-800" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}
        {!loading && error && (
          <div className="text-sm text-slate-500">
            Could not get an explanation: {error}
            <button onClick={onRetry} className="ml-2 inline-flex items-center gap-1 font-medium text-accent hover:underline">
              <RefreshCw className="h-3.5 w-3.5" /> retry
            </button>
          </div>
        )}
        {!loading && !error && explanation && <Body text={explanation.text} />}
        {!loading && explanation?.source === "template" && explanation.note && (
          <p className="mt-4 text-[11px] text-slate-400">No language model this time - {explanation.note}.</p>
        )}

        {/* exactly what the language model got. no raw series, only these numbers */}
        {!loading && explanation && (
          <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowFacts((v) => !v)}
              aria-expanded={showFacts}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-accent"
            >
              <Braces className="h-3.5 w-3.5" aria-hidden="true" />
              {fromLlm ? "What the language model got" : "The facts this text is built from"}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFacts ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {showFacts && (
              <>
                <p className="mt-2 text-[11px] text-slate-500">
                  {fromLlm
                    ? "Only these facts were sent to the language model - not your full series."
                    : "Nothing was sent to a language model. The text above is filled in from these facts."}{" "}
                  Every number comes from the model's output or from your series.
                </p>
                <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700 dark:bg-slate-950/60 dark:text-slate-300">
                  {JSON.stringify(explanation.facts, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
