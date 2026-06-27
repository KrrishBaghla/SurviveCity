"""Deterministic post-mortem string generator.

When an agent dies, the env generates a structured post-mortem that is
prepended to the agent's system prompt in the next episode. This is the
core Theme-4 (self-improvement) mechanism.

No randomness, no LLM — purely rule-based.
"""

from __future__ import annotations

from survivecity_env.game import EpisodeState
from survivecity_env.layout import SAFEHOUSE_CELLS, FOOD_CELLS


def generate_postmortem(state: EpisodeState, agent_id: int) -> str:
    """Generate a deterministic post-mortem string for a dead agent.

    Args:
        state: Current episode state at time of death
        agent_id: ID of the agent that died

    Returns:
        A structured post-mortem string
    """
    agent = state.agents[agent_id]

    cause = agent.death_cause or "unknown"
    step = agent.death_step if agent.death_step is not None else state.step_count

    # Find nearest threat at time of death
    nearest_threat = _find_nearest_threat(state, agent_id)

    # Determine the key mistake
    mistake = _detect_mistake(state, agent_id)

    postmortem = (
        f"POSTMORTEM for A{agent_id}: died at step {step} (cause: {cause}). "
        f"Last position: ({agent.row},{agent.col}). "
        f"{nearest_threat} "
        f"Resources consumed: {agent.food_eaten} food. Final hunger: {agent.hunger}. "
        f"Key mistake: {mistake}."
    )

    return postmortem


def _find_nearest_threat(state: EpisodeState, agent_id: int) -> str:
    """Identify the nearest threat at the time of death."""
    agent = state.agents[agent_id]

    # Check nearest zombie
    min_zombie_dist = float("inf")
    nearest_zombie = None
    for z in state.zombies:
        dist = abs(z.row - agent.row) + abs(z.col - agent.col)
        if dist < min_zombie_dist:
            min_zombie_dist = dist
            nearest_zombie = z

    # Check nearest infected agent (if revealed)
    infected = state.agents[state.infected_id]
    infected_dist = abs(infected.row - agent.row) + abs(infected.col - agent.col)

    parts = []
    if nearest_zombie is not None:
        parts.append(f"Nearest zombie at ({nearest_zombie.row},{nearest_zombie.col}), dist={min_zombie_dist}")

    if state.step_count >= 30 and infected.is_alive and agent_id != state.infected_id:
        parts.append(f"Infected A{state.infected_id} at ({infected.row},{infected.col}), dist={infected_dist}")

    if parts:
        return "Nearest threat at death: " + "; ".join(parts) + "."
    return "No immediate threats detected at death."


def _detect_mistake(state: EpisodeState, agent_id: int) -> str:
    """Rule-based mistake detection for the dying agent."""
    agent = state.agents[agent_id]
    cause = agent.death_cause or "unknown"

    # Mistake lookup table based on death cause and context
    if cause == "hunger":
        if agent.food_eaten == 0:
            return "never_ate_food"
        return "foraged_too_late_or_too_infrequently"

    if cause == "zombie_attack":
        if (agent.row, agent.col) not in SAFEHOUSE_CELLS:
            # Died outside safehouse
            nearest_food = _nearest_food_dist(agent.row, agent.col)
            if nearest_food <= 2:
                return "foraged_but_didnt_flee_zombie"
            return "foraged_too_far_from_safehouse"
        return "zombie_reached_agent_at_safehouse_edge"

    if cause == "infected_attack":
        # Check if broadcasts warned about the infected
        warned = any(f"A{state.infected_id}" in b for b in state.all_broadcasts)
        if warned:
            return "ignored_broadcast_warning_about_infected"
        if state.step_count >= 50 and not state.vote_resolved:
            return "didnt_vote_despite_evidence"
        return "failed_to_distance_from_infected_after_reveal"

    if cause == "locked_out_starvation":
        return "wrongly_locked_out_by_team_vote"

    return "unknown_cause_investigate_logs"


def _nearest_food_dist(row: int, col: int) -> int:
    """Manhattan distance to nearest food cell."""
    return min(abs(row - fr) + abs(col - fc) for fr, fc in FOOD_CELLS)
