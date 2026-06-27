#!/usr/bin/env python
"""Inspect / recover GRPO training checkpoints from the Hugging Face Hub.

Use this to answer "did Colab/Kaggle save anything before it died?" and to
pull the latest checkpoint locally for manual inspection or DGX resume.

Examples
--------
List what's on the Hub:
    python scripts/check_hub_checkpoints.py --hub-model-id noanya/zombiee

Show training progress (step, loss, learning rate from trainer_state.json):
    python scripts/check_hub_checkpoints.py --hub-model-id noanya/zombiee --info

Download the latest checkpoint to ./recovered/:
    python scripts/check_hub_checkpoints.py --hub-model-id noanya/zombiee \\
        --download ./recovered

Then resume training from it:
    python -m training.train \\
        --resume-from-checkpoint ./recovered \\
        --push-to-hub --hub-model-id noanya/zombiee \\
        --max-steps 4000 --output-dir ./lora_v1
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone


def parse_args():
    p = argparse.ArgumentParser(
        description="List / download GRPO training checkpoints from HF Hub.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "--hub-model-id", default=os.environ.get("HUB_MODEL_ID", "noanya/zombiee"),
        help="HF Hub repo id, e.g. 'noanya/zombiee' (default: $HUB_MODEL_ID or noanya/zombiee).",
    )
    p.add_argument(
        "--info", action="store_true",
        help="Read trainer_state.json from the latest checkpoint and print training progress.",
    )
    p.add_argument(
        "--download", metavar="DIR", default=None,
        help="Download the latest checkpoint to this directory.",
    )
    p.add_argument(
        "--checkpoint", metavar="N", type=int, default=None,
        help="Operate on checkpoint-N specifically instead of the latest.",
    )
    p.add_argument(
        "--token", default=os.environ.get("HUGGINGFACE_TOKEN") or os.environ.get("HF_TOKEN"),
        help="HF token (default: $HUGGINGFACE_TOKEN / $HF_TOKEN). Required for private repos.",
    )
    return p.parse_args()


def list_checkpoints(api, repo_id, token):
    """Return (sorted list of checkpoint step numbers, list of root files)."""
    try:
        files = api.list_repo_files(repo_id, token=token)
    except Exception as e:
        print(f"ERROR: could not list {repo_id}: {e}", file=sys.stderr)
        print(
            "       If the repo is private, set HUGGINGFACE_TOKEN. If it doesn't exist yet,\n"
            "       no training run has pushed to it.",
            file=sys.stderr,
        )
        sys.exit(1)

    steps = set()
    root_files = []
    for f in files:
        if f.startswith("checkpoint-"):
            try:
                steps.add(int(f.split("/", 1)[0].split("-", 1)[1]))
            except ValueError:
                pass
        elif "/" not in f:
            root_files.append(f)
    return sorted(steps), sorted(root_files)


def fetch_trainer_state(api, repo_id, step, token, work_dir):
    """Download trainer_state.json from checkpoint-step and return parsed dict."""
    from huggingface_hub import hf_hub_download

    path = hf_hub_download(
        repo_id=repo_id,
        filename=f"checkpoint-{step}/trainer_state.json",
        local_dir=work_dir,
        token=token,
    )
    with open(path) as f:
        return json.load(f)


def fmt_age(iso_or_dt):
    """Render 'X minutes/hours/days ago' from an HF datetime."""
    if isinstance(iso_or_dt, str):
        try:
            dt = datetime.fromisoformat(iso_or_dt.replace("Z", "+00:00"))
        except ValueError:
            return iso_or_dt
    else:
        dt = iso_or_dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - dt
    s = int(delta.total_seconds())
    if s < 60:
        return f"{s}s ago"
    if s < 3600:
        return f"{s // 60}m ago"
    if s < 86400:
        return f"{s // 3600}h {(s % 3600) // 60}m ago"
    return f"{s // 86400}d {(s % 86400) // 3600}h ago"


def cmd_list(api, repo_id, token):
    steps, root_files = list_checkpoints(api, repo_id, token)

    print(f"Repo: https://huggingface.co/{repo_id}")
    try:
        info = api.repo_info(repo_id, token=token)
        print(f"Last commit: {info.sha[:8]} ({fmt_age(info.lastModified)})")
    except Exception:
        pass

    print()
    if not steps:
        print("No checkpoint-* directories found.")
        if root_files:
            print(f"Root files present: {', '.join(root_files)}")
            print("(Looks like only a final-model push, no intermediate checkpoints.)")
        else:
            print("Repo is empty — training never reached the first save.")
        return

    print(f"Found {len(steps)} checkpoint(s): {', '.join(f'checkpoint-{s}' for s in steps)}")
    print(f"Latest: checkpoint-{steps[-1]}")
    if root_files:
        print(f"Root files: {', '.join(root_files)}")


def cmd_info(api, repo_id, token, step):
    steps, _ = list_checkpoints(api, repo_id, token)
    if not steps:
        print("No checkpoints to inspect.", file=sys.stderr)
        sys.exit(1)
    target = step if step is not None else steps[-1]
    if target not in steps:
        print(f"checkpoint-{target} not on hub. Available: {steps}", file=sys.stderr)
        sys.exit(1)

    print(f"Inspecting checkpoint-{target}...")
    state = fetch_trainer_state(api, repo_id, target, token, "/tmp/_hub_inspect")

    print()
    print(f"  global_step       : {state.get('global_step')}")
    print(f"  epoch             : {state.get('epoch'):.4f}" if state.get("epoch") is not None else "  epoch             : ?")
    print(f"  max_steps         : {state.get('max_steps')}")
    print(f"  best_metric       : {state.get('best_metric')}")
    print(f"  total_flos        : {state.get('total_flos')}")

    log_history = state.get("log_history", [])
    if log_history:
        print(f"  log entries       : {len(log_history)}")
        last = log_history[-1]
        print()
        print("  Most recent log entry:")
        for k in ("loss", "learning_rate", "grad_norm", "reward", "kl", "step"):
            if k in last:
                v = last[k]
                if isinstance(v, float):
                    print(f"    {k:18}: {v:.6f}")
                else:
                    print(f"    {k:18}: {v}")

    pct = (target / state["max_steps"] * 100) if state.get("max_steps") else None
    if pct is not None:
        print()
        print(f"Progress: {target} / {state['max_steps']} steps ({pct:.1f}% done)")


def cmd_download(api, repo_id, token, target_dir, step):
    from huggingface_hub import snapshot_download

    steps, _ = list_checkpoints(api, repo_id, token)
    if not steps:
        print("Nothing to download — no checkpoints on hub.", file=sys.stderr)
        sys.exit(1)
    chosen = step if step is not None else steps[-1]
    if chosen not in steps:
        print(f"checkpoint-{chosen} not on hub. Available: {steps}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(target_dir, exist_ok=True)
    print(f"Downloading checkpoint-{chosen} from {repo_id} -> {target_dir}/")
    local = snapshot_download(
        repo_id=repo_id,
        allow_patterns=[f"checkpoint-{chosen}/*"],
        local_dir=target_dir,
        token=token,
    )
    final = os.path.join(local, f"checkpoint-{chosen}")
    print()
    print(f"Done. Local path: {final}")
    print()
    print("To resume training from this checkpoint:")
    print(f"  python -m training.train \\")
    print(f"      --resume-from-checkpoint {final} \\")
    print(f"      --push-to-hub --hub-model-id {repo_id} \\")
    print(f"      --output-dir ./lora_v1")


def main():
    args = parse_args()
    try:
        from huggingface_hub import HfApi
    except ImportError:
        print("pip install huggingface_hub", file=sys.stderr)
        sys.exit(1)

    api = HfApi()

    if args.download:
        cmd_download(api, args.hub_model_id, args.token, args.download, args.checkpoint)
    elif args.info:
        cmd_info(api, args.hub_model_id, args.token, args.checkpoint)
    else:
        cmd_list(api, args.hub_model_id, args.token)


if __name__ == "__main__":
    main()
