"""
app/registry.py - find every model folder and load it once, when the server starts.

A "model folder" is any folder inside models/ that has a manifest.json. The manifest is the
model's ID card: what domain it is for, the class names, colours, units, which outputs it gives.
The frontend reads the manifest and builds its screens from it - that is how the UI "adapts" to a
new domain without any frontend change. To add a model you add a folder, not code.

onnxruntime:
    onnxruntime is Microsoft's engine for running .onnx files. It is much smaller than PyTorch and
    is made for inference only (no training), which is exactly what a web backend needs.
    An InferenceSession loads the graph once; after that every .run() call is just maths.
"""
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import onnxruntime as ort

THREADS = 2    # free hosting = few cpu cores, dont fight over them


@dataclass
class LoadedModel:
    id: str
    folder: Path
    manifest: dict
    export_info: dict
    session: ort.InferenceSession
    input_length: int
    samples: list[dict]
    examples: list[dict]       # real example files people can download or load (examples.json)

    def class_info(self, idx: int) -> dict:
        return self.manifest["classes"][idx]

    def public_card(self) -> dict:
        """What the frontend is allowed to see about this model (no file paths, no inner design)."""
        info = self.export_info
        onnx_info = info.get("onnx", {})
        check = info.get("test_check")       # written by model_export/check_test_set.py
        return {
            "id": self.id,
            "name": self.manifest["name"],
            "version": self.manifest.get("version"),
            "task": self.manifest["task"],
            "outputs": self.manifest["outputs"],
            "domain": self.manifest["domain"],
            "classes": self.manifest["classes"],
            "model_card": self.manifest.get("model_card", {}),
            "input_length": self.input_length,
            "stats": {
                "test_accuracy": info.get("metrics", {}).get("test_acc"),
                "balanced_accuracy": check["balanced_accuracy"] if check else None,
                "aopcr": info.get("metrics", {}).get("test_aopcr"),
                "ndcg": info.get("metrics", {}).get("test_ndcg"),
                "params": info.get("params"),
                "onnx_size_kb": onnx_info.get("size_kb"),
            },
            # the full test split, run again through model.onnx (None if that check was not run)
            "test_check": None if not check else {
                "n": check["n"],
                "accuracy": check["accuracy"],
                "matches_training": check["matches_training"],
                "per_class": check["per_class"],
            },
            # facts about the file and the engine, so the ui never has to guess them
            "runtime": {
                "dataset": info.get("dataset"),
                "seed": info.get("seed"),
                "exported": info.get("exported"),
                "input_shape": [1, int(info.get("n_channels", 1)), self.input_length],
                "onnx_opset": onnx_info.get("opset"),
                "onnx_vs_torch_max_diff": onnx_info.get("max_abs_diff_logits"),
                "engine": f"onnxruntime {ort.__version__}",
                "threads": THREADS,
            },
            "n_samples": len(self.samples),
            "has_true_regions": any(s.get("true_regions") for s in self.samples),
            "examples": [{k: e[k] for k in ("name", "title", "note", "points")} for e in self.examples],
        }


def _read_json(path: Path, default=None):
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_model(folder: Path) -> LoadedModel:
    manifest = _read_json(folder / "manifest.json")
    files = manifest.get("files", {})
    onnx_path = folder / files.get("onnx", "model.onnx")
    if not onnx_path.exists():
        raise FileNotFoundError(f"{onnx_path} is missing - run model_export/export_onnx.py first")

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = THREADS
    session = ort.InferenceSession(str(onnx_path), sess_options=opts, providers=["CPUExecutionProvider"])

    # the input length is fixed inside the onnx graph (batch, channels, T) -> read T from it
    input_length = int(session.get_inputs()[0].shape[2])
    n_classes = len(manifest["classes"])

    # quick sanity check: run one dummy series and make sure the shapes match the manifest
    logits, interp = session.run(None, {"series": np.zeros((1, 1, input_length), dtype=np.float32)})
    if logits.shape != (1, n_classes) or interp.shape != (1, n_classes, input_length):
        raise ValueError(f"{folder.name}: onnx outputs {logits.shape}/{interp.shape} do not match "
                         f"the {n_classes} classes in manifest.json")

    return LoadedModel(
        id=manifest["id"],
        folder=folder,
        manifest=manifest,
        export_info=_read_json(folder / files.get("export_info", "export_info.json"), {}),
        session=session,
        input_length=input_length,
        samples=_read_json(folder / files.get("samples", "samples.json"), []),
        examples=_read_json(folder / files.get("examples", "examples.json"), []),
    )


def load_registry(models_dir: Path) -> dict[str, LoadedModel]:
    loaded = [load_model(manifest.parent) for manifest in models_dir.glob("*/manifest.json")]
    if not loaded:
        raise RuntimeError(f"no models found in {models_dir}")
    # the manifest's "order" decides which domain comes first in the ui (then the id, to be stable)
    loaded.sort(key=lambda m: (m.manifest.get("order", 99), m.id))
    return {m.id: m for m in loaded}
