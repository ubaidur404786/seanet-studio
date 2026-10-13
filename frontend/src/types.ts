// the shapes of what the backend sends back. kept in one file so a change in the api
// shows up as a type error everywhere it matters.

// normal / anomaly = "is something wrong?" models. category = just groups (e.g. warm vs cold season)
export type ClassKind = "normal" | "anomaly" | "category";

export interface ClassInfo {
  id: number;
  key: string;
  label: string;
  kind: ClassKind;
  color: string;
  description: string;
  icon?: string; // optional, e.g. "sun" / "snowflake" for the seasons
}

// which look a domain uses (see lib/templates.ts). a new domain picks one in its manifest
export type TemplateKey = "monitoring" | "clinical" | "industrial" | "energy";

export interface Domain {
  key: string;
  template?: TemplateKey;
  item?: { one: string; many: string }; // what one model input is called: "beat", "day", "run"...
  short: string;
  icon: string;
  title: string;
  summary: string;
  signal_name: string;
  unit: string;
  sampling_interval_minutes: number | null;
  time_origin: string;
  accent: string;
  warning?: string; // shown big, e.g. "not a medical device"
  data_note?: string;
}

export interface ClassCheck {
  class_id: number;
  n: number;
  right: number;
  accuracy: number | null;
}

// what kinds of output a model gives. the ui shows one panel per output it knows
export type OutputType = "class_probabilities" | "timestep_attribution";

export interface ExampleFile {
  name: string;
  title: string;
  note: string;
  points: number;
}

export interface ModelCard {
  id: string;
  name: string;
  version: string;
  task: string;
  outputs: OutputType[];
  domain: Domain;
  classes: ClassInfo[];
  model_card: {
    architecture?: string;
    how_it_explains?: string;
    baseline?: string;
    limitations?: string[];
  };
  input_length: number;
  stats: {
    test_accuracy: number | null;
    balanced_accuracy: number | null;
    aopcr: number | null;
    ndcg: number | null;
    params: number | null;
    onnx_size_kb: number | null;
  };
  // the whole test split, run again through the onnx file (model_export/check_test_set.py)
  test_check: {
    n: number;
    accuracy: number;
    matches_training: boolean;
    per_class: ClassCheck[];
  } | null;
  runtime: {
    dataset: string | null;
    seed: number | null;
    exported: string | null;
    input_shape: number[];
    onnx_opset: number | null;
    onnx_vs_torch_max_diff: number | null;
    engine: string;
    threads: number;
  };
  n_samples: number;
  has_true_regions: boolean;
  examples: ExampleFile[];
}

export interface SampleRef {
  id: string;
  true_class: number;
  preview: number[];
}

export interface Sample {
  id: string;
  true_class: number;
  values: number[];
  true_regions: [number, number][];
}

export interface Region {
  start: number;
  end: number;
  share: number;
  start_label: string | null;
  end_label: string | null;
  length: number;
  level_change_pct: number | null; // only for signals that never go below 0
  level_change_sd: number | null; // the same shift in standard deviations (any signal)
  roughness_ratio: number | null;
}

// one window = one piece of the series the model looked at (the whole series when it is short)
export interface WindowResult {
  index: number;
  start: number;
  end: number;
  start_label: string | null;
  end_label: string | null;
  prediction: {
    class_id: number;
    key: string;
    label: string;
    kind: ClassKind;
    confidence: number;
    margin: number;
  };
  probabilities: { class_id: number; key: string; label: string; probability: number }[];
  attribution: { class_id: number; values: number[] };
  regions: Region[];
}

// one step of the pipeline, as the backend really did it
export interface StepInfo {
  key: string;
  title: string;
  input: string;
  output: string;
  ms: number;
}

export interface PredictResult {
  model_id: string;
  n_points: number;
  input_length: number;
  mode: "exact" | "resampled" | "windows";
  windows: WindowResult[];
  steps: StepInfo[];
  latency_ms: number;
}

export interface Explanation {
  text: string;
  source: "llm" | "template";
  llm_model: string | null;
  note: string | null;
  cached: boolean;
  facts: Record<string, unknown>; // exactly what the language model was given
}

// where the series on screen came from - a demo sample (with the true answer), a file or a paste
export interface SeriesInput {
  values: number[];
  origin: "sample" | "upload" | "paste";
  name: string;
  trueClass?: number;
  trueRegions?: [number, number][];
}
