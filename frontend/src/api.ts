// tiny wrapper around fetch. every call goes to <API_URL>/api
//   - local dev and Docker: API_URL is empty, so it is the same server ("/api"). during
//     `npm run dev` vite forwards /api to :8000 (see vite.config.ts)
//   - GitHub Pages: the page and the api live on different hosts, so the build is made with
//     VITE_API_URL=https://<hf-user>-seanet-studio.hf.space (see .github/workflows/deploy.yml)
import type { Explanation, ModelCard, PredictResult, Sample, SampleRef, StepInfo } from "./types";

// vite puts VITE_* variables into the code at build time. remove a "/" at the end so we never get "//api"
const API_URL: string = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export const apiDocsUrl = `${API_URL}/api/docs`;

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
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

export const exampleUrl = (modelId: string, name: string) => `${API_URL}/api/models/${modelId}/examples/${name}`;

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
