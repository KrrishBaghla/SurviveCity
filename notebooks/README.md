# Training & Evaluation Notebooks

Free GPU sessions disconnect frequently. These notebooks run the GRPO
training and LLM-driven evaluation, and use the **Hugging Face Hub** as a
checkpoint bridge so a run can hop between machines without losing progress.

## Files

| Notebook | Target | Purpose | Pushes to |
|---|---|---|---|
| `train_colab.ipynb` | Colab T4 | v1 training: 12 GRPO steps, save every step. Source of the report's headline run (3 h 53 min wallclock). | `noanya/zombiee` |
| `eval_colab.ipynb` | Colab T4 | v1 evaluation: $n_b{=}30$ random vs. $n_t{=}10$ trained against `checkpoint-12`. Produces `eval_step_0012.json`, bars, history chart. | `noanya/zombiee/eval_results/` |
| `train_v1_kaggle_extend.ipynb` | Kaggle T4 / P100 / L4 | Extended training: 4000 GRPO steps on the same env, separate Hub repo to avoid clobbering v1. | `noanya/zombiee-v1-extended` |
| `eval_v1_kaggle_extend.ipynb` | Kaggle T4 | Extended evaluation: per-step infected-detection trajectory, survival/vote-accuracy across checkpoints. Produces the report's Figure 4 and the README's headline plot. | `noanya/zombiee-v1-extended/eval_results/` |

Defaults for the v1 Colab training notebook: `MAX_STEPS=12`, `SAVE_STEPS=1`,
`NUM_GENERATIONS=4`, `gradient_accumulation_steps=16`. On a T4 each GRPO step
takes ~15-20 min, so a checkpoint lands every ~20 minutes and the full run
finishes in ~3-4 h.

The extended Kaggle notebook uses `MAX_STEPS=4000` with sparser saves
(`SAVE_STEPS=1000`) and pushes to a **separate** Hub repo
(`noanya/zombiee-v1-extended`) so the v1 artefacts on `noanya/zombiee` are
never touched by the long run.

## Resume mechanism

```
              ┌─────────── Hugging Face Hub ───────────┐
              │   noanya/zombiee  (v1)                  │
              │   noanya/zombiee-v1-extended  (long run)│
              │   ├── checkpoint-N/                     │
              │   ├── trainer_state.json                │
              │   └── adapter_model.safetensors         │
              └──────────────┬──────────────────────────┘
                  push_to_hub │             │ resume_from_checkpoint
                              ▼             ▼
                   ┌─────────────────┐ ┌─────────────────┐
                   │ Colab notebook  │ │ Kaggle notebook │
                   │  (T4)           │ │  (T4 / P100)    │
                   └─────────────────┘ └─────────────────┘
```

`training/train.py` accepts:

- `--push-to-hub --hub-model-id <user/repo>` — uploads `checkpoint-N/` after each save (`hub_strategy="every_save"`) and a final model on success.
- `--resume-from-checkpoint <spec>` where `<spec>` is one of:
  - `auto` — pick the newest `checkpoint-*` under `--output-dir`
  - `<local path>` — resume from that directory
  - `<user/repo>` — `snapshot_download` from the Hub, then resume
- `--save-total-limit N` — keep only the last `N` checkpoints on disk.

## Required secrets (all notebooks)

| Secret | Scope | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT with `Contents: Read` on the repo (or classic with `repo`) | Authenticate `git clone` for the repo |
| `HF_TOKEN` | HuggingFace token, **write** | Push checkpoints to your HF Hub repo |

The clone cell embeds the GitHub token into a `git -c http.extraheader=...`
config so it never appears in `argv` or tracebacks. Errors are scrubbed before
being raised. Use a fine-grained PAT scoped to a single repo to limit blast
radius if a token leaks.

## Quick start — Colab (v1 training)

1. Push the latest code to GitHub so the notebook can clone it
2. Open `notebooks/train_colab.ipynb` on Colab (File → Open → GitHub, or upload the file)
3. Runtime → Change runtime type → T4 GPU
4. 🔑 Secrets (left sidebar) → add `GITHUB_TOKEN` and `HF_TOKEN`, toggle Notebook access ON for both
5. Edit `HUB_MODEL_ID` in the Configuration cell (defaults to `noanya/zombiee`)
6. Runtime → Run All

After the install cell finishes the first time, do **Runtime → Restart Session** then **Run All** again so the upgraded packages are picked up cleanly.

## Quick start — Kaggle (extended training)

1. Push the latest code to GitHub
2. Open `notebooks/train_v1_kaggle_extend.ipynb` on Kaggle (File → Import Notebook)
3. Settings:
   - Accelerator: `GPU T4 x1` (P100 or L4 also work)
   - Internet: On
   - Persistence: Variables and Files
4. Add-ons → Secrets → add `GITHUB_TOKEN` and `HF_TOKEN`, attach both to the notebook
5. Edit `HUB_REPO` in the Configuration cell — keep it as `noanya/zombiee-v1-extended` to keep the long run isolated from the v1 repo
6. Run All (or *Save Version → Save & Run All (Commit)* to run headless on Kaggle's infra and free up the tab)

## Quick start — evaluation

After a training run finishes (or anywhere mid-training), open the matching
eval notebook:

- `eval_colab.ipynb` → evaluates `noanya/zombiee` (v1)
- `eval_v1_kaggle_extend.ipynb` → evaluates `noanya/zombiee-v1-extended` (extended)

Both notebooks pull the LoRA from the Hub, run baseline + trained episode
batches against a fresh env server, render the metrics charts, and push the
eval artefacts back to the same repo's `eval_results/` directory.

## Resuming after a session timeout

Just re-run the notebook end-to-end. The detect-existing-checkpoints cell
sees the artefacts on the Hub and prepends `--resume-from-checkpoint <repo>`
to the launch command automatically.

## Memory-tightening knobs (if a free T4 OOMs)

In the Configuration cell of either training notebook, lower:

- `NUM_GENERATIONS` (4 → 2 → 1) — biggest activation-memory lever in GRPO
- `MAX_SEQ_LENGTH` (2048 → 1024)
- `MODEL_NAME` → `unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit` (last resort)

`training/train.py` also auto-throttles `num_generations` based on free VRAM:
< 6 GB → 2, < 12 GB → 4. So usually you don't need to touch it manually.

## Why so many short steps in v1?

Free Colab/Kaggle sessions die unpredictably (idle timeout, queue eviction,
flaky network). With `MAX_STEPS=500 / SAVE_STEPS=50` the first save fires
~3 h into training; if you get killed at 2 h you have nothing. With
`MAX_STEPS=12 / SAVE_STEPS=1` the first save fires after step 1 (~20 min) and
every step after that. Worst-case you lose 19 min of compute, not 3 h.

The extended Kaggle notebook accepts the longer-run risk because Kaggle's
Save & Run All Commit mode runs headlessly on Kaggle infrastructure rather
than relying on a held-open browser tab.

## "My Colab/Kaggle session died — did I lose anything?"

**No** — as long as `--push-to-hub` was set (it is, in all training notebooks),
every checkpoint up to the last successful save lives on the Hub at
`huggingface.co/<HUB_MODEL_ID>`. The `hub_strategy="every_save"` setting in
`training/train.py` uploads each `checkpoint-N/` immediately after it's
written to disk, before the next training step begins.

Inspect what survived:

```bash
# Just list:
python scripts/check_hub_checkpoints.py --hub-model-id noanya/zombiee

# Show training progress (step, loss, lr) from the latest checkpoint:
python scripts/check_hub_checkpoints.py --hub-model-id noanya/zombiee --info

# Pull the latest checkpoint locally:
python scripts/check_hub_checkpoints.py --hub-model-id noanya/zombiee \
    --download ./recovered
```
