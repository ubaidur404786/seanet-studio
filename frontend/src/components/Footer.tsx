import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-800">
      <p className="flex items-center justify-center gap-2 font-medium text-slate-700 dark:text-slate-300">
        <Logo className="h-5 w-5" /> SEA-Net Studio · Lightweight AI. Visible evidence. Clear explanations.
      </p>
      <p className="mt-2">
        Built by{" "}
        <a className="font-medium text-accent hover:underline" href="https://github.com/ubaidur404786" target="_blank" rel="noreferrer">
          ubaidur404786
        </a>{" "}
        · PyTorch → ONNX Runtime · FastAPI · React · free LLM
      </p>
      <p className="mt-1">A portfolio demo - not a medical device and not a production monitoring tool.</p>
    </footer>
  );
}
