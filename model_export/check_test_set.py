"""
model_export/check_test_set.py - run the WHOLE test split through the exported model.onnx, the
same way the app does, and save the result (overall + per class) into export_info.json.

Why:
    1. It proves the app is right: the backend's own z_normalise + model.onnx must give the same
       test accuracy as the training run did. If they differ, the preprocessing in the app is wrong.
    2. One accuracy number can hide a lot. ECG5000 for example is ~94% accurate overall, but most
       beats are "normal", so the rare classes can be bad and the number still looks great.
       The per-class numbers are shown in the app so people can see where the model is weak.

Run it (from the seanet-studio folder), after export_onnx.py:
    python model_export/check_test_set.py ucr --dataset ECG5000 --data-dir ../SEA_NET/data/UCR/ECG5000 \
        --model-dir backend/models/ecg5000-seanet
    python model_export/check_test_set.py webtraffic --data-dir ../SEA_NET/data/WebTraffic \
        --model-dir backend/models/webtraffic-seanet
"""
import argparse
import json
import os
import sys

import numpy as np
import onnxruntime as ort

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)                                      # for make_samples (the data loaders)
sys.path.insert(0, os.path.join(HERE, "..", "backend"))       # for the app's own preprocessing
from make_samples import load_ucr, load_webtraffic           # noqa: E402
from app.inference import z_normalise                         # noqa: E402


def parse_args():
    p = argparse.ArgumentParser(description="Check model.onnx on the full test split.")
    p.add_argument("kind", choices=["webtraffic", "ucr"])
    p.add_argument("--data-dir", required=True)
    p.add_argument("--model-dir", required=True, help="the folder with model.onnx + export_info.json")
    p.add_argument("--dataset", help="UCR dataset name (only for kind=ucr)")
    p.add_argument("--batch", type=int, default=256)
    return p.parse_args()


def main():
    args = parse_args()
    if args.kind == "webtraffic":
        X, y, _, _ = load_webtraffic(args.data_dir)
    else:
        X, y, _, _ = load_ucr(args.data_dir, args.dataset)

    sess = ort.InferenceSession(os.path.join(args.model_dir, "model.onnx"), providers=["CPUExecutionProvider"])
    T = int(sess.get_inputs()[0].shape[2])
    if X.shape[1] != T:
        raise SystemExit(f"test series have {X.shape[1]} points but the model wants {T}")

    # same preprocessing as the app: every series scaled on its own
    Xn = np.stack([z_normalise(row) for row in X]).astype(np.float32)[:, None, :]
    pred = []
    for i in range(0, len(Xn), args.batch):
        logits, _ = sess.run(None, {"series": Xn[i:i + args.batch]})
        pred.append(logits.argmax(1))
    pred = np.concatenate(pred)

    n_classes = int(sess.get_outputs()[0].shape[1])
    per_class = []
    for c in range(n_classes):
        mask = y == c
        n = int(mask.sum())
        right = int((pred[mask] == c).sum())
        per_class.append({"class_id": c, "n": n, "right": right, "accuracy": round(right / n, 4) if n else None})
    acc = float((pred == y).mean())
    # balanced accuracy = the plain average of the per-class accuracies (every class counts the same)
    bal = float(np.mean([p["accuracy"] for p in per_class if p["accuracy"] is not None]))

    info_path = os.path.join(args.model_dir, "export_info.json")
    with open(info_path, encoding="utf-8") as f:
        info = json.load(f)
    trained_acc = info.get("metrics", {}).get("test_acc")
    info["test_check"] = {
        "what": "full test split run through model.onnx with the app's own preprocessing",
        "n": int(len(y)),
        "accuracy": round(acc, 4),
        "balanced_accuracy": round(bal, 4),
        "per_class": per_class,
        "matches_training": trained_acc is not None and abs(acc - trained_acc) < 0.002,
    }
    with open(info_path, "w", encoding="utf-8") as f:
        json.dump(info, f, indent=2)

    print(f"{len(y)} test series  accuracy={acc:.4f}  (training run said {trained_acc})  balanced={bal:.4f}")
    for p in per_class:
        print(f"  class {p['class_id']}: {p['right']:>5} / {p['n']:<5} right  ({p['accuracy']})")
    print(f"saved test_check into {info_path}")


if __name__ == "__main__":
    main()
