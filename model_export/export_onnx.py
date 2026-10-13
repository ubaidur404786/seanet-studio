"""
model_export/export_onnx.py - turn the trained SEA-Net bundle into an ONNX file the backend can run.

Why this file exists:
    The SEA_NET research repo saves every trained model as a "deploy bundle" (.pt = weights + the
    config that built them). To load that .pt you need PyTorch AND the whole research code base.
    For a web app that is too heavy, so we convert it ONCE to ONNX here. After that the backend only
    needs `onnxruntime` + `numpy` (no PyTorch, no research code), which makes the Docker image small
    and the start-up fast.

    This script is the only place in this repo that touches PyTorch or the SEA_NET code.
    We do NOT retrain anything - we just load the saved weights and export them.

What it writes into --out-dir:
    manifest.json       (only with --manifest) a copy of the domain card: names, colours, units
    model.onnx          the network: input "series" (batch, 1, T) -> "bag_logits" (batch, C)
                        and "interpretation" (batch, C, T)
    export_info.json    where the model came from + its test metrics + a check that ONNX gives the
                        same numbers as PyTorch

Run it (from the seanet-studio folder):
    python model_export/export_onnx.py --seanet-repo "../SEA_NET" \
        --bundle "results/top_results/SEA_NET/top_bottleneck_topk__sea_mstcn_sep_bottleneck__sea_topk_conjunctive/deploy/WebTraffic__seed0.pt" \
        --out-dir backend/models/webtraffic-seanet
"""
import argparse
import json
import os
import sys
from datetime import datetime

import numpy as np
import torch


def parse_args():
    p = argparse.ArgumentParser(description="Export a SEA-Net deploy bundle to ONNX.")
    p.add_argument("--seanet-repo", required=True, help="path to the SEA_NET research repo")
    p.add_argument("--bundle", required=True, help="the .pt bundle, relative to --seanet-repo")
    p.add_argument("--out-dir", required=True, help="where model.onnx + export_info.json go")
    p.add_argument("--manifest", help="the domain card to copy next to the model "
                                      "(e.g. model_export/manifests/ecg5000-seanet.json)")
    p.add_argument("--opset", type=int, default=17)
    return p.parse_args()


def main():
    args = parse_args()
    repo = os.path.abspath(args.seanet_repo)
    bundle_path = os.path.join(repo, args.bundle)
    out_dir = os.path.abspath(args.out_dir)
    os.makedirs(out_dir, exist_ok=True)

    # the research code is not installed as a package, so we just put the repo on the path
    sys.path.insert(0, repo)
    from seanet.deployment import load_bundle, _ExportWrapper

    # load_bundle rebuilds the net from the saved config and loads the weights with strict=True,
    # so if anything doesnt match it crashes here instead of exporting a broken model
    net, payload = load_bundle(bundle_path, device="cpu")
    T = int(payload["series_length"])
    n_in = int(payload["n_in"])
    wrapper = _ExportWrapper(net).eval()

    # everything on the cpu - the old export inside training failed because the net was on cuda
    # and the example input was on cpu
    example = torch.zeros(1, n_in, T)
    onnx_path = os.path.join(out_dir, "model.onnx")
    torch.onnx.export(
        wrapper, example, onnx_path,
        input_names=["series"], output_names=["bag_logits", "interpretation"],
        # only the batch axis can change. T is fixed because the top-k head computes
        # k = ceil(top_frac * T) in plain python, so it gets frozen into the graph
        dynamic_axes={"series": {0: "batch"}, "bag_logits": {0: "batch"}, "interpretation": {0: "batch"}},
        opset_version=args.opset,
    )
    print(f"saved {onnx_path}  ({os.path.getsize(onnx_path) / 1024:.0f} KB)")

    # ---- check: ONNX must give the same answer as PyTorch on a few random series -------------
    import onnxruntime as ort
    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(0)
    x = rng.standard_normal((4, n_in, T)).astype(np.float32)
    with torch.no_grad():
        t_logits, t_interp = wrapper(torch.from_numpy(x))
    o_logits, o_interp = sess.run(None, {"series": x})
    diff_logits = float(np.abs(t_logits.numpy() - o_logits).max())
    diff_interp = float(np.abs(t_interp.numpy() - o_interp).max())
    same_argmax = bool((t_logits.numpy().argmax(1) == o_logits.argmax(1)).all())
    print(f"max |torch - onnx|  logits={diff_logits:.2e}  interpretation={diff_interp:.2e}  same class={same_argmax}")
    if diff_logits > 1e-3 or not same_argmax:
        raise SystemExit("ONNX output does not match PyTorch - not saving export_info.json")

    # ---- export_info.json: where this model came from ---------------------------------------
    meta_path = bundle_path.replace(".pt", "_meta.json")
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)

    info = {
        "exported": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "source_bundle": args.bundle.replace("\\", "/"),
        "model_id": payload.get("model_id"),
        "dataset": payload.get("dataset"),
        "seed": payload.get("seed"),
        "encoder": meta.get("encoder") or payload.get("encoder"),
        "pooling": meta.get("pooling") or payload.get("pooling"),
        "input_length": T,
        "n_channels": n_in,
        "n_classes": int(payload["n_classes"]),
        "params": meta.get("params"),
        "metrics": meta.get("metrics", {}),
        "trained_with": meta.get("versions", {}),
        "trained_git_commit": meta.get("git_commit"),
        "onnx": {"file": "model.onnx", "opset": args.opset,
                 "size_kb": round(os.path.getsize(onnx_path) / 1024, 1),
                 "max_abs_diff_logits": diff_logits, "max_abs_diff_interpretation": diff_interp,
                 "torch_version": torch.__version__},
    }
    with open(os.path.join(out_dir, "export_info.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, indent=2)
    print(f"saved {os.path.join(out_dir, 'export_info.json')}")

    # ---- the manifest (domain card) the backend + frontend read ------------------------------
    if args.manifest:
        with open(args.manifest, encoding="utf-8") as f:
            card = json.load(f)
        if len(card["classes"]) != info["n_classes"]:
            raise SystemExit(f"{args.manifest} lists {len(card['classes'])} classes but the model has "
                             f"{info['n_classes']} - fix the manifest first")
        with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
            json.dump(card, f, indent=2, ensure_ascii=False)
        print(f"saved {os.path.join(out_dir, 'manifest.json')}")


if __name__ == "__main__":
    main()
