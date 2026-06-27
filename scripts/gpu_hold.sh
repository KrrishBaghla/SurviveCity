#!/usr/bin/env bash
# gpu_hold.sh — reserve VRAM on a single DGX GPU using the existing
# survivecity-train docker image (so we don't need torch installed on the host).
#
# Usage:
#   ./scripts/gpu_hold.sh 3              # hold ~30 GB on GPU 3
#   GB=25 ./scripts/gpu_hold.sh 3        # custom size
#   IMAGE=my-img ./scripts/gpu_hold.sh 3 # custom image (default: survivecity-train)
#
# Stop:
#   docker rm -f gpu-hold-3
#
# Lists all running holders:
#   docker ps --filter name=^gpu-hold-
#
# Don't squat more than one GPU on a shared cluster.

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "usage: $0 <gpu_index>   (e.g. $0 3)" >&2
    exit 1
fi

GPU="$1"
GB="${GB:-30}"
IMAGE="${IMAGE:-survivecity-train}"
NAME="gpu-hold-${GPU}"

if ! command -v docker >/dev/null 2>&1; then
    echo "FATAL: docker not on PATH." >&2
    exit 1
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "FATAL: docker image '$IMAGE' not found. Build it first:" >&2
    echo "       docker build -f Dockerfile.dgx -t $IMAGE ." >&2
    exit 1
fi

if docker ps --filter "name=^${NAME}$" --format '{{.Names}}' | grep -qx "$NAME"; then
    echo "Already running: $NAME" >&2
    docker ps --filter "name=^${NAME}$"
    exit 0
fi

echo "[gpu_hold] launching $NAME on GPU $GPU (holding ${GB} GB) using image $IMAGE"

# -d detached so it survives SSH disconnect
# --rm so it cleans up on stop (no state worth keeping)
# -e GPU_HOLD_GB so the python script knows how much to grab
# Mount the script in case the image's copy is stale; falls back to /app/scripts
# if the host path doesn't exist (running from a different cwd).
SCRIPT_HOST="$(cd "$(dirname "$0")" && pwd)/gpu_hold.py"
if [[ -f "$SCRIPT_HOST" ]]; then
    MOUNT_ARGS=(-v "${SCRIPT_HOST}:/tmp/gpu_hold.py:ro")
    SCRIPT_PATH="/tmp/gpu_hold.py"
else
    MOUNT_ARGS=()
    SCRIPT_PATH="/app/scripts/gpu_hold.py"
fi

docker run -d --rm \
    --name "$NAME" \
    --gpus "\"device=${GPU}\"" \
    -e GPU_HOLD_GB="$GB" \
    "${MOUNT_ARGS[@]}" \
    "$IMAGE" \
    python "$SCRIPT_PATH" >/dev/null

sleep 4
echo
docker logs "$NAME" 2>&1 | tail -5
echo
echo "[gpu_hold] running. Stop with: docker rm -f $NAME"
