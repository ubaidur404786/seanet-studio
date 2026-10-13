// the state of the pipeline progress panel.
//
// the backend is fast (the model itself takes ~10 ms), so if we showed the steps the moment the
// answer arrives, they would all flash at once. instead we "play" the real steps one after the
// other with a short pause, so a person can follow them. the numbers shown (input, output, ms)
// are the real ones the backend measured - only the pace of showing them is slowed down.
import { useCallback, useRef, useState } from "react";
import type { StepInfo } from "../types";

export type StepStatus = "waiting" | "running" | "done" | "error";

export interface PipelineStep {
  key: string;
  short: string; // label in the horizontal bar
  title: string;
  hint: string; // shown while waiting, so people know what the step will do
  status: StepStatus;
  input?: string;
  output?: string;
  ms?: number;
}

const STEPS: Omit<PipelineStep, "status">[] = [
  { key: "read", short: "Read", title: "Read the numbers", hint: "check that every value is a real number" },
  { key: "prepare", short: "Prepare", title: "Prepare the data", hint: "fit the length the model needs, scale it" },
  { key: "model", short: "Load model", title: "Load the model", hint: "the trained SEA-Net file (ONNX)" },
  { key: "run", short: "Run model", title: "Run the model", hint: "a score for each class and each time step" },
  { key: "results", short: "Answer", title: "Read the answer", hint: "turn scores into % and find the evidence" },
  { key: "explain", short: "Explain", title: "Write the explanation", hint: "a language model puts the facts into words" },
];

const PAUSE_MS = 320;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function usePipeline() {
  const [steps, setSteps] = useState<PipelineStep[]>(STEPS.map((s) => ({ ...s, status: "waiting" })));
  const run = useRef(0); // bumps on every new start, so an old animation stops by itself

  const patch = (key: string, change: Partial<PipelineStep>) =>
    setSteps((all) => all.map((s) => (s.key === key ? { ...s, ...change } : s)));

  const start = useCallback(() => {
    run.current += 1;
    setSteps(STEPS.map((s, i) => ({ ...s, status: i === 0 ? "running" : "waiting" })));
    return run.current;
  }, []);

  // back to "nothing happened yet" (e.g. when another domain is picked)
  const reset = useCallback(() => {
    run.current += 1;
    setSteps(STEPS.map((s) => ({ ...s, status: "waiting" })));
  }, []);

  // show the backend's real steps one by one. returns false if a newer run took over
  const play = useCallback(async (real: StepInfo[], id: number) => {
    for (const step of real) {
      if (id !== run.current) return false;
      patch(step.key, { status: "running" });
      await sleep(PAUSE_MS);
      if (id !== run.current) return false;
      patch(step.key, { status: "done", input: step.input, output: step.output, ms: step.ms });
    }
    return true;
  }, []);

  const begin = useCallback((key: string) => patch(key, { status: "running", output: undefined }), []);

  const finish = useCallback((step: StepInfo) => {
    patch(step.key, { status: "done", input: step.input, output: step.output, ms: step.ms });
  }, []);

  // mark the step that was running as failed, with the reason
  const fail = useCallback((message: string, key?: string) => {
    setSteps((all) => {
      const target = key ?? all.find((s) => s.status === "running")?.key ?? all[0].key;
      return all.map((s) => (s.key === target ? { ...s, status: "error", output: message } : s));
    });
  }, []);

  return { steps, start, reset, play, begin, finish, fail, current: run };
}
