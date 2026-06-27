"""Composable reward rubric for SurviveCity.

Three independent rubrics compose into obs.reward. All deterministic, no LLM judge.
  - SurvivalRubric: dense, per-step
  - VoteRubric: sparse, fires once at step 50
  - GroupOutcomeRubric: terminal, fires on episode end

OpenEnv compliance: clamped to (0.01, 0.99), never exactly 0.0 or 1.0.
"""

from __future__ import annotations

from survivecity_env.game import EpisodeState


# Strict bounds for OpenEnv validator compliance
_SCORE_MIN = 0.01
_SCORE_MAX = 0.99


def _clip(score: float) -> float:
    """Clamp reward to (0.01, 0.99) — OpenEnv validator rejects 0.0 and 1.0."""
    return max(_SCORE_MIN, min(_SCORE_MAX, score))


# ---------------------------------------------------------------------------
# Rubric 1 — SurvivalRubric (dense, per-step, per-agent)
# ---------------------------------------------------------------------------

def survival_reward(state: EpisodeState, agent_id: int) -> float:
    """Per-step survival reward/penalty for one agent.

    +0.005 per step alive
    +0.05  when agent eats food (hunger reset)
    -0.10  per HP lost from zombie/infected attack
    -0.05  per step when hunger >= 10 (starving)
    -0.50  at moment of death (one-shot)
    """
    a = state.agents[agent_id]
    r = 0.0

    if a.is_alive:
        r += 0.005
        if a.ate_this_step:
            r += 0.05
        if a.hunger >= 10:
            r -= 0.05
        if a.damage_this_step > 0:
            r -= 0.10 * a.damage_this_step

    if a.died_this_step:
        r -= 0.50

    return r


# ---------------------------------------------------------------------------
# Rubric 2 — VoteRubric (sparse, fires once at step 50)
# ---------------------------------------------------------------------------

def vote_reward(state: EpisodeState, agent_id: int) -> float:
    """Score the agent's vote at step 50.

    For healthy agents:
      vote_target == true_infected_id → +0.30
      vote_target is a healthy agent  → -0.20
      null/no vote                    → -0.05

    For infected agent:
      voted for self → -0.30 (catastrophic blunder)
      voted for a healthy agent → +0.30 (successful framing)
      null vote → -0.05
    """
    if not state.vote_resolved:
        return 0.0

    vote = state.votes_cast.get(agent_id)

    if agent_id == state.infected_id:
        # Infected agent scoring
        if vote is None:
            return -0.05
        if vote == state.infected_id:
            return -0.30  # voted self — catastrophic
        return 0.30  # successfully framed a healthy agent

    # Healthy agent scoring
    if vote is None:
        return -0.05
    if vote == state.infected_id:
        return 0.30
    return -0.20


# ---------------------------------------------------------------------------
# Rubric 3 — GroupOutcomeRubric (terminal, fires on episode end)
# ---------------------------------------------------------------------------

def group_outcome_reward(state: EpisodeState, agent_id: int) -> float:
    """Terminal reward based on group outcome.

    If healthy agents survive (group win):
      +0.40 for each living healthy agent
      +0.30 for each healthy agent if infected is neutralized

    If infected wins (all healthy dead):
      +0.40 for infected agent
      -0.20 for each dead healthy agent
    """
    if not state.done:
        return 0.0

    a = state.agents[agent_id]
    r = 0.0

    healthy_alive = sum(1 for ag in state.agents if ag.is_alive and not ag.is_infected)
    infected_agent = state.agents[state.infected_id]
    infected_neutralized = not infected_agent.is_alive or infected_agent.locked_out

    if healthy_alive >= 1:
        # Group won (or partially won)
        if a.is_alive and not a.is_infected:
            r += 0.40
        if infected_neutralized and not a.is_infected:
            r += 0.30
    else:
        # Infected wins
        if a.is_infected:
            r += 0.40
        elif not a.is_alive:
            r -= 0.20

    return r


# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------

def compose_reward(state: EpisodeState, agent_id: int) -> tuple[float, float]:
    """Compose all rubrics into a single reward.

    Returns:
        (clipped_reward, raw_reward)
        clipped_reward is in (0.01, 0.99) for OpenEnv compliance
        raw_reward is the unclipped sum for debugging
    """
    raw = (
        survival_reward(state, agent_id)
        + vote_reward(state, agent_id)
        + group_outcome_reward(state, agent_id)
    )
    clipped = _clip(raw)
    return clipped, raw
