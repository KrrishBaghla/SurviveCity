"""Pydantic models for SurviveCity — actions, observations, and state types.

These models form the public API surface. Clients import only from here.
"""

from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Agent state (per-agent, visible in observations with masking)
# ---------------------------------------------------------------------------

class AgentState(BaseModel):
    """Observable state of a single agent."""

    agent_id: int
    row: int
    col: int
    hp: int = Field(default=3, ge=0, le=3)
    hunger: int = Field(default=0, ge=0)
    is_alive: bool = True
    is_infected: bool = False        # MASKED from others; masked from self until step 30
    locked_out: bool = False         # Set after vote at step 50

    # Transient per-step flags (for reward computation)
    ate_this_step: bool = False
    damage_this_step: int = 0
    died_this_step: bool = False


# ---------------------------------------------------------------------------
# Zombie state
# ---------------------------------------------------------------------------

class ZombieState(BaseModel):
    """State of a single zombie (scripted NPC)."""

    zombie_id: int
    row: int
    col: int


# ---------------------------------------------------------------------------
# Action model
# ---------------------------------------------------------------------------

ACTION_TYPES = Literal[
    "move_up", "move_down", "move_left", "move_right",
    "eat", "wait", "vote_lockout", "broadcast",
]


class SurviveAction(BaseModel):
    """One agent's action for one step."""

    agent_id: int
    action_type: ACTION_TYPES
    vote_target: Optional[int] = None   # required for vote_lockout
    message: Optional[str] = Field(default=None, max_length=40)  # required for broadcast


# ---------------------------------------------------------------------------
# Observation model (returned by reset/step)
# ---------------------------------------------------------------------------

class SurviveObservation(BaseModel):
    """Observation returned to the current agent after each step.

    Fields mirror the OpenEnv Observation contract:
      - grid, agents, zombies: world state
      - step_count, max_steps: episode progress
      - task_id: environment identifier
      - description: NL summary for LLM prompts
      - done: episode over?
      - reward: clamped (0.01, 0.99) — set on EVERY step
      - metadata: raw_reward, current_agent_id, phase, postmortems, etc.
    """

    grid: list[list[str]]
    agents: list[AgentState]
    zombies: list[ZombieState]
    step_count: int
    max_steps: int = 100
    task_id: str = "survivecity_v1"
    description: str = ""
    done: bool = False
    reward: float = Field(default=0.50, gt=0.0, lt=1.0)
    metadata: dict = Field(default_factory=dict)

    # Convenience for broadcasting
    broadcasts: list[str] = Field(default_factory=list)
