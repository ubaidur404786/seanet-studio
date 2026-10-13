# The models

[← back to the README](../README.md)

The app holds **only the final trained models**, ready for inference. Every model is the same
SEA-Net design (`top_bottleneck_topk`, seed 0, ~41 K weights), trained in the research repo on one
dataset each. Domains were picked because they are useful in real life **and** SEA-Net does well on them.

The numbers below are the **shipped** models, measured again on the full test split through the
app's own ONNX file and preprocessing (`model_export/check_test_set.py`). All four give exactly the
same accuracy as their training run, which shows the app runs the models faithfully.

| Domain | Dataset | What it answers | Test accuracy | Average over classes | True evidence location? |
|---|---|---|---|---|---|
| Website traffic | WebTraffic | normal week or 1 of 9 problems | 94.2 % | 94.2 % | yes |
| Heartbeats (ECG) | ECG5000 | normal beat or 1 of 4 irregular beats | 94.4 % | **56.1 %** | no |
| Chip factory | Wafer | normal or abnormal production run | 99.9 % | 99.9 % | no |
| Home electricity | PowerCons | warm-season or cold-season day | 93.9 % | 93.9 % | no |

"Average over classes" counts every class the same. For ECG5000 it is much lower: most beats are
normal (99.9 % found) or R-on-T (95 %), but the model finds only 32 of 86 PVC beats, 77 of 175
upper early beats and 1 of 22 unclassified beats. The app shows this per-class table, warns in
the explanation when the answer is one of those weak classes, and says clearly that it is not a
medical device.

Only WebTraffic says WHERE the problem really is, so only there can you compare the model's
evidence with the truth. For the others the app shows the model's own evidence only.

## What is in a model folder

Each model folder in `backend/models/<id>/` has `model.onnx`, `export_info.json`, `manifest.json`
(the domain card the UI is built from), `samples.json` and `examples/` (real CSV files).
The domain cards live in `model_export/manifests/`. A domain shows up in the app as soon as its
folder exists - no code change.

## Adding a domain model

Nothing is trained in this repo. Train in the research repo (with `output.save_deploy: always`
in `configs/main.yaml`, so the deploy bundle is saved for UCR datasets too), write a manifest in
`model_export/manifests/`, then export, check and pick samples (example: ECG5000):

```bash
# in SEA_NET (GPU recommended)
python main.py single ECG5000 --model top/top_bottleneck_topk

# in seanet-studio
python model_export/export_onnx.py --seanet-repo ../SEA_NET --bundle results/top_results/SEA_NET/top_bottleneck_topk__sea_mstcn_sep_bottleneck__sea_topk_conjunctive/deploy/ECG5000__seed0.pt --manifest model_export/manifests/ecg5000-seanet.json --out-dir backend/models/ecg5000-seanet
python model_export/check_test_set.py ucr --dataset ECG5000 --data-dir ../SEA_NET/data/UCR/ECG5000 --model-dir backend/models/ecg5000-seanet
python model_export/make_samples.py ucr --dataset ECG5000 --data-dir ../SEA_NET/data/UCR/ECG5000 --out-dir backend/models/ecg5000-seanet --signal ecg --one-class 1 --long-classes 0 1 0 2 --item beat beats
```

The other shipped models used:

| Model | make_samples.py options |
|---|---|
| WebTraffic | `webtraffic --interval-min 10 --signal visits --long-classes 0 5 0 9 --item week weeks` |
| Wafer | `ucr --dataset Wafer --signal sensor --one-class 0 --long-classes 1 1 0 1 --item run runs` |
| PowerCons | `ucr --dataset PowerCons --signal power --interval-min 10 --one-class 1 --long-classes 0 0 1 1 --item day days` |

The manifest fields that shape the UI: `domain.template` (see
[domain templates](how-it-works.md#domain-templates)), `domain.item` (what one input is called:
"beat", "day"...), `domain.warning` (shown big, e.g. "not a medical device"), `domain.accent`
(colour), `order` (position of the domain tab), and per class `kind` (normal / anomaly / category),
`color` and an optional `icon`.

## Limits

- WebTraffic is a **synthetic** benchmark of 1,008-point weeks. Real traffic that looks very
  different can get confident but wrong answers.
- ECG5000 is one patient with heart failure, labelled by a program. The model is weak on the rare
  beat types (see the table above). It is a demo, **not a medical device**.
- Wafer and PowerCons each come from one production line / one household.
- Series of another length are resampled, which can blur very short events.
- Every shipped model is one training seed. Over 3 seeds the research repo reports 0.931 ± 0.040
  WebTraffic accuracy for this architecture; on the 128-dataset UCR archive MILLET is still ahead,
  and on WebTraffic MILLET does better on the deletion test (AOPCR).
- The written explanation is produced by an LLM from the model's facts. It can still word things
  badly or add its own reasons; the chart is the ground truth.
