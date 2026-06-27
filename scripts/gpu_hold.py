#!/usr/bin/env python
"""Reserve VRAM on a single GPU so the slot stays ours between training runs.

Allocates a contiguous tensor (default ~30 GB on a 32 GB V100) and idles in a
loop, touching the buffer once a minute so the process stays listed in
`nvidia-smi` and the GPU doesn't drop to idle clocks.

Use only when you actively plan to come back to this GPU (e.g. a follow-up
training run is queued behind a checkpoint pull). On a shared cluster, do NOT hold more than
one GPU at a time, and release it (Ctrl-C / kill) the moment you're done.

Two sizing modes:

  GPU_HOLD_GB=N        hold a fixed N GB (default 30)
  GPU_KEEP_FREE_GB=N   hold (free_now - N) GB, leaving exactly N GB for a
                       co-tenant training process. Wins over GPU_HOLD_GB.
  GPU_RELEASE_AFTER=S  optional: auto-release after S seconds (useful for tests).

Co-tenant pattern — "reserve a 30 GB window, run training inside it":

    # On a V100 (~32 GB total). Leave 14 GB free for training, hold the rest:
    KEEP_FREE_GB=14 ./scripts/gpu_hold.sh 3
    # Then start training on the SAME GPU index in a separate container:
    docker run --rm --gpus '"device=3"' --shm-size=8g \
        -e HUGGINGFACE_TOKEN -v $(pwd)/lora_v1:/app/lora_v1 \
        survivecity-train python -m training.train ...
    # Holder ~16 GB + training ~14 GB = ~30 GB used. Others see GPU as full
    # and skip past. If training crashes, holder stays up → slot preserved.
    # Just docker run training again; it reclaims the 14 GB.
    # When you're done debugging: docker rm -f gpu-hold-3

Tuning rules of thumb:

  - First crash with "torch OOM on init"?  bump KEEP_FREE_GB up by 2–4 GB.
  - Want to be invisible to other users?   keep total free < 4 GB.
  - V100/32GB Qwen2.5-3B 4-bit + NUM_GENERATIONS=4 + MAX_SEQ=2048 ≈ 12-14 GB.
  - V100/32GB Qwen2.5-3B 4-bit + NUM_GENERATIONS=8 + MAX_SEQ=4096 ≈ 18-22 GB.

Usage (on host with torch installed):
    CUDA_VISIBLE_DEVICES=3 python scripts/gpu_hold.py
    GPU_HOLD_GB=25 CUDA_VISIBLE_DEVICES=3 python scripts/gpu_hold.py
    GPU_KEEP_FREE_GB=14 CUDA_VISIBLE_DEVICES=3 python scripts/gpu_hold.py

Usage (Docker, recommended on the DGX — uses the existing image):
    ./scripts/gpu_hold.sh 3                   # hold 30 GB on GPU 3
    GB=25 ./scripts/gpu_hold.sh 3             # hold 25 GB
    KEEP_FREE_GB=14 ./scripts/gpu_hold.sh 3   # leave 14 GB free for training

Stop:
    Ctrl-C if foreground, or `docker rm -f gpu-hold-N` for the docker variant.
"""

from __future__ import annotations

import datetime
import os
import sys
import time

import torch


def main():
    if not torch.cuda.is_available():
        print("ERROR: torch.cuda.is_available() is False — nothing to hold.", file=sys.stderr)
        sys.exit(1)

    name = torch.cuda.get_device_name(0)
    cap = torch.cuda.get_device_capability(0)
    free_b, total_b = torch.cuda.mem_get_info(0)
    free_gb = free_b / (1024 ** 3)

    keep_free = os.environ.get("GPU_KEEP_FREE_GB")
    if keep_free is not None and keep_free.strip() != "":
        keep_free_gb = float(keep_free)
        # Leave keep_free_gb in the pool; grab the rest. Subtract a small
        # cushion (~0.5 GB) so cudaMalloc has room to maneuver.
        gb = max(1.0, free_gb - keep_free_gb - 0.5)
        mode = "keep_free={0:.1f}GB".format(keep_free_gb)
    else:
        gb = float(os.environ.get("GPU_HOLD_GB", "30"))
        mode = "fixed"

    elements = int(gb * (1024 ** 3) / 4)
    print(
        "[{0}] device={1} cc={2}.{3} free={4:.1f}GB total={5:.1f}GB mode={6} requested={7:.1f}GB pid={8}".format(
            datetime.datetime.now().isoformat(timespec="seconds"),
            name, cap[0], cap[1],
            free_gb, total_b / (1024 ** 3), mode, gb, os.getpid(),
        )
    )
    sys.stdout.flush()

    try:
        x = torch.empty(elements, dtype=torch.float32, device="cuda:0")
    except RuntimeError as e:
        print("ERROR: allocation failed: {0}".format(e), file=sys.stderr)
        print("       try a smaller GPU_HOLD_GB (e.g. 25 or 20).", file=sys.stderr)
        sys.exit(2)
    x.fill_(0)
    torch.cuda.synchronize()

    free_after, _ = torch.cuda.mem_get_info(0)
    print(
        "[{0}] holding {1:.1f}GB; free now {2:.1f}GB. Touching every 60s.".format(
            datetime.datetime.now().isoformat(timespec="seconds"),
            x.element_size() * x.nelement() / 1e9,
            free_after / 1e9,
        )
    )
    sys.stdout.flush()

    release_after = os.environ.get("GPU_RELEASE_AFTER")
    deadline = None
    if release_after and release_after.strip():
        deadline = time.time() + float(release_after)

    # Heartbeat loop. add_(0) is a no-op math but keeps the process active
    # against idle reapers and shows up as compute usage in nvidia-smi.
    try:
        while True:
            if deadline is not None and time.time() > deadline:
                print("[{0}] GPU_RELEASE_AFTER reached, releasing.".format(
                    datetime.datetime.now().isoformat(timespec="seconds")))
                break
            x.add_(0)
            torch.cuda.synchronize()
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n[{0}] released.".format(datetime.datetime.now().isoformat(timespec="seconds")))


if __name__ == "__main__":
    main()
