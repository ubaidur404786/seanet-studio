// tiny wrapper around fetch. every call goes to /api, which is the same server in production
// and is forwarded to :8000 by vite during development (see vite.config.ts)
import type { Explanation, ModelCard, PredictResult, Sample, SampleRef, StepInfo } from "./types";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    // fastapi puts the reason in "detail" - show that instead of a bare status code
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (Array.isArray(data.detail)) detail = data.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch {
      /* body was not json, keep the status text */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const exampleUrl = (modelId: string, name: string) => `/api/models/${modelId}/examples/${name}`;

export const api = {
  models: () => call<ModelCard[]>("/models"),
  samples: (modelId: string) => call<SampleRef[]>(`/models/${modelId}/samples`),
  sample: (modelId: string, id: string) => call<Sample>(`/models/${modelId}/samples/${id}`),
  exampleText: async (modelId: string, name: string) => {
    const res = await fetch(exampleUrl(modelId, name));
    if (!res.ok) throw new Error(`could not load ${name}`);
    return res.text();
  },
  predict: (modelId: string, values: number[]) => call<PredictResult>(`/models/${modelId}/predict`, { values }),
  explain: (modelId: string, values: number[], window: number) =>
    call<{ result: PredictResult; explanation: Explanation; step: StepInfo }>(`/models/${modelId}/explain`, {
      values,
      window,
    }),
};
