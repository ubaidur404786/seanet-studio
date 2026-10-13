import { LoaderCircle } from "lucide-react";
import type { ModelCard } from "../types";
import { itemWords } from "../lib/format";
import { iconFor } from "../lib/icons";

export default function EmptyState({ model, loading }: { model: ModelCard; loading: boolean }) {
  const item = itemWords(model.domain);
  const Icon = iconFor(model.domain.icon);
  return (
    <div className="card grid min-h-72 place-items-center p-8 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent/10 text-accent">
          {loading ? <LoaderCircle className="h-7 w-7 animate-spin" /> : <Icon className="h-7 w-7" />}
        </div>
        <h2 className="mt-4 font-semibold text-slate-900 dark:text-white">
          {loading ? "Working on it… follow the steps above" : `Pick a ${item.one} on the left`}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          The model will say which of its {model.classes.length} classes the {item.one} belongs to, shade the parts that
          made it decide, and explain it in plain words.
        </p>
      </div>
    </div>
  );
}
