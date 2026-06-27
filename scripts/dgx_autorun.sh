#!/usr/bin/env bash
# dgx_autorun.sh — wait for a free GPU on this DGX, then launch the
# SurviveCity GRPO training container on it. Keeps watching and will spin
# up additional runs (up to MAX_JOBS) on other GPUs as they open up.
#
# Each container resumes from the same HF Hub checkpoint, so if a run dies
# (OOM, pre-empted by the cluster, machine reboot) it restarts and picks up
# where the last `checkpoint-N` left off — driven by --resume-from-checkpoint
# in training/train.py.
#
# Usage:
#   export HUGGINGFACE_TOKEN=hf_xxx
#   ./scripts/dgx_autorun.sh                     # 1 job, 10 GB min free
#   MIN_FREE_GB=8 MAX_JOBS=2 ./scripts/dgx_autorun.sh
#   DRY_RUN=1 ./scripts/dgx_autorun.sh           # print plan, don't launch
#
# Stop with Ctrl-C; a trap cleans up all containers it started.

set -euo pipefail

# ---- tunables (env-overridable) ---------------------------------------------
MIN_FREE_GB="${MIN_FREE_GB:-10}"                       # GPU needs this much free to be picked
MAX_JOBS="${MAX_JOBS:-1}"                              # cap parallel training runs
POLL_INTERVAL="${POLL_INTERVAL:-60}"                   # seconds between nvidia-smi scans
IMAGE="${IMAGE:-survivecity-train}"                    # docker image built from Dockerfile.dgx
HUB_MODEL_ID="${HUB_MODEL_ID:-noanya/zombiee}"
OUTPUT_ROOT="${OUTPUT_ROOT:-$(pwd)/lora_v1}"           # host dir for checkpoints
MAX_STEPS="${MAX_STEPS:-4000}"
SAVE_STEPS="${SAVE_STEPS:-100}"
CONTAINER_PREFIX="${CONTAINER_PREFIX:-survivecity-train}"
DRY_RUN="${DRY_RUN:-0}"
# -----------------------------------------------------------------------------

# Sanity checks ---------------------------------------------------------------
if ! command -v nvidia-smi >/dev/null 2>&1; then
    echo "FATAL: nvidia-smi not on PATH. Are you on a GPU host?" >&2
    exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
    echo "FATAL: docker not on PATH." >&2
    exit 1
fi
if [[ -z "${HUGGINGFACE_TOKEN:-}" ]]; then
    echo "FATAL: export HUGGINGFACE_TOKEN before running (needed for --push-to-hub + --resume-from-checkpoint)." >&2
    exit 1
fi
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "FATAL: docker image '$IMAGE' not found. Build it first:" >&2
    echo "       docker build -f Dockerfile.dgx -t $IMAGE ." >&2
    exit 1
fi

mkdir -p "$OUTPUT_ROOT"

# Cleanup trap: kill every container we started, regardless of exit reason.
STARTED_CONTAINERS=()
cleanup() {
    echo
    echo "[autorun] caught signal — stopping launched containers..."
    for c in "${STARTED_CONTAINERS[@]:-}"; do
        docker rm -f "$c" >/dev/null 2>&1 || true
    done
    exit 0
}
trap cleanup INT TERM

# Returns: list of "gpu_idx free_mib" pairs, sorted by free_mib desc.
list_free_gpus() {
    nvidia-smi --query-gpu=index,memory.free \
        --format=csv,noheader,nounits \
    | awk '{gsub(/,/,""); print $1, $2}' \
    | sort -k2 -n -r
}

# Is our container for GPU $1 currently running?
container_running_for_gpu() {
    local gpu="$1"
    local name="${CONTAINER_PREFIX}-gpu${gpu}"
    docker ps --filter "name=^${name}$" --format '{{.Names}}' | grep -qx "$name"
}

# How many of our containers are currently running?
active_jobs() {
    docker ps --filter "name=^${CONTAINER_PREFIX}-gpu" --format '{{.Names}}' | wc -l
}

launch_on_gpu() {
    local gpu="$1"
    local name="${CONTAINER_PREFIX}-gpu${gpu}"
    local outdir="${OUTPUT_ROOT}/gpu${gpu}"
    mkdir -p "$outdir"

    echo "[autorun] launching $name on GPU $gpu (output: $outdir)"

    if [[ "$DRY_RUN" == "1" ]]; then
        echo "         (DRY_RUN=1, not actually starting)"
        return 0
    fi

    # -d  detached so the watcher loop keeps running
    # --rm  removes the container on exit (checkpoints are already on the Hub + host volume)
    # --shm-size 8g  bnb/dataloader workers need real shared memory
    docker run -d --rm \
        --name "$name" \
        --gpus "\"device=${gpu}\"" \
        --shm-size=8g \
        -e HUGGINGFACE_TOKEN="$HUGGINGFACE_TOKEN" \
        -e HF_TOKEN="$HUGGINGFACE_TOKEN" \
        -v "${outdir}:/app/lora_v1" \
        "$IMAGE" \
        bash -c "\
            uvicorn server.app:app --host 0.0.0.0 --port 7860 & \
            sleep 3 && \
            python -m training.train \
                --env-url http://localhost:7860 \
                --resume-from-checkpoint ${HUB_MODEL_ID} \
                --push-to-hub --hub-model-id ${HUB_MODEL_ID} \
                --max-steps ${MAX_STEPS} \
                --save-steps ${SAVE_STEPS} \
                --output-dir /app/lora_v1 \
                --report-to tensorboard \
        " >/dev/null

    STARTED_CONTAINERS+=("$name")
}

echo "[autorun] watching for GPUs with >= ${MIN_FREE_GB} GB free; max parallel jobs = ${MAX_JOBS}"
echo "[autorun] image=${IMAGE}  hub=${HUB_MODEL_ID}  output=${OUTPUT_ROOT}"
echo "[autorun] stop with Ctrl-C"

MIN_FREE_MIB=$((MIN_FREE_GB * 1024))

while true; do
    running=$(active_jobs)
    if (( running >= MAX_JOBS )); then
        echo "[autorun] $(date '+%H:%M:%S') — $running/$MAX_JOBS jobs running; sleeping ${POLL_INTERVAL}s"
        sleep "$POLL_INTERVAL"
        continue
    fi

    launched_this_round=0
    while IFS=' ' read -r gpu free_mib; do
        # cap reached mid-loop?
        running=$(active_jobs)
        if (( running >= MAX_JOBS )); then
            break
        fi
        if (( free_mib < MIN_FREE_MIB )); then
            continue                                   # below threshold, skip
        fi
        if container_running_for_gpu "$gpu"; then
            continue                                   # already have a job here
        fi
        launch_on_gpu "$gpu"
        launched_this_round=1
        sleep 5                                        # let the container grab the GPU
    done < <(list_free_gpus)

    if (( launched_this_round == 0 )); then
        top_line=$(list_free_gpus | head -1)
        echo "[autorun] $(date '+%H:%M:%S') — no GPU >= ${MIN_FREE_GB} GB free (top: $top_line MiB); sleeping ${POLL_INTERVAL}s"
    fi

    sleep "$POLL_INTERVAL"
done
