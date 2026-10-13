import { Moon, Sun } from "lucide-react";
import { apiDocsUrl } from "../api";
import type { ModelCard } from "../types";
import type { Theme } from "../lib/useTheme";
import { iconFor } from "../lib/icons";
import Logo from "./Logo";

const REPO_URL = "https://github.com/ubaidur404786/seanet-studio";

interface Props {
  model: ModelCard | null;
  theme: Theme;
  onToggleTheme: () => void;
}

export default function Header({ model, theme, onToggleTheme }: Props) {
  const DomainIcon = iconFor(model?.domain.icon);
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur dark:border-slate-800/70 dark:bg-navy/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* BASE_URL is "/" normally and "/seanet-studio/" on GitHub Pages */}
        <a href={import.meta.env.BASE_URL} className="flex shrink-0 items-center gap-2.5">
          <Logo />
          <span className="leading-tight">
            <span className="block font-semibold tracking-tight text-slate-900 dark:text-white">
              SEA-Net <span className="text-brand-ink dark:text-brand">Studio</span>
            </span>
            <span className="hidden text-[11px] text-slate-500 lg:block">
              Lightweight AI · Visible evidence · Clear explanations
            </span>
          </span>
        </a>

        {/* which model is loaded. the domain picker itself is in the Hero section */}
        {model && (
          <span className="ml-2 hidden min-w-0 items-center gap-1.5 truncate rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 md:ml-4 md:inline-flex dark:border-slate-700 dark:text-slate-300">
            <DomainIcon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate">
              {model.name} · v{model.version}
            </span>
          </span>
        )}

        <nav className="ml-auto flex items-center gap-1 text-sm">
          <a className="hidden rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 md:block dark:text-slate-300 dark:hover:bg-slate-800" href="#under-the-hood">
            How it works
          </a>
          <a className="hidden rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100 md:block dark:text-slate-300 dark:hover:bg-slate-800" href={apiDocsUrl} target="_blank" rel="noreferrer">
            API
          </a>
          <a className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Source code on GitHub">
            {/* lucide dropped brand icons, so the github mark is drawn inline */}
            <svg viewBox="0 0 16 16" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <button
            onClick={onToggleTheme}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </nav>
      </div>
    </header>
  );
}
