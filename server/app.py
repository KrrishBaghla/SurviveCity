"""FastAPI server for SurviveCity — OpenEnv-compliant HTTP API.

Endpoints:
  GET  /health  → {"status": "healthy"}
  POST /reset   → Observation (JSON)
  POST /step    → Observation (JSON)
  GET  /state   → episode metadata (JSON)

Run with: uvicorn server.app:app --host 0.0.0.0 --port 7860
"""

from __future__ import annotations

import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from survivecity_env.env import SurviveCityEnv

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger("survivecity.server")

# ---------------------------------------------------------------------------
# App + singleton env
# ---------------------------------------------------------------------------

app = FastAPI(
    title="SurviveCity",
    description="Multi-Agent Zombie Apocalypse for LLM Failure-Replay Learning",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Singleton environment instance
_env = SurviveCityEnv()


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class ResetRequest(BaseModel):
    seed: Optional[int] = None


class StepRequest(BaseModel):
    agent_id: int
    action_type: str
    vote_target: Optional[int] = None
    message: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    """Health check — OpenEnv validator requires exactly {"status": "healthy"}."""
    return {"status": "healthy"}


@app.post("/reset")
def reset(request: ResetRequest = ResetRequest()):
    """Reset the environment and start a new episode.

    Returns the initial observation for agent A0.
    """
    try:
        obs = _env.reset(seed=request.seed)
        return obs
    except Exception as e:
        logger.error(f"Reset failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/step")
def step(request: StepRequest):
    """Execute one agent's action and return observation for the next agent.

    Args:
        request: Action with agent_id, action_type, and optional vote_target/message
    """
    try:
        obs = _env.step(request.model_dump())
        return obs
    except Exception as e:
        logger.error(f"Step failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/state")
def get_state():
    """Return current episode metadata."""
    return _env.state


# ---------------------------------------------------------------------------
# Main entry point (for docker / direct run)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.app:app", host="0.0.0.0", port=7860, reload=False)
