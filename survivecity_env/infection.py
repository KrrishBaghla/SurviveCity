"""Infection mechanics — detection helpers and observation masking.

The actual infection state mutation is in game.py. This module provides:
  1. Observation masking: hide is_infected from other agents and from self before step 30
  2. Behavioral detection cues for the NL observation description
"""

from __future__ import annotations

from survivecity_env.game import EpisodeState


def mask_infection_for_agent(state: EpisodeState, observer_id: int) -> list[dict]:
    """Return agent states with is_infected masked appropriately.

    Rules:
      - An agent NEVER sees another agent's is_infected field.
      - The infected agent doesn't see their own is_infected until step 30.
      - After step 30, the infected agent sees their own is_infected = True.
    """
    masked = []
    for a in state.agents:
        entry = {
            "agent_id": a.agent_id,
            "row": a.row,
            "col": a.col,
            "hp": a.hp,
            "hunger": a.hunger,
            "is_alive": a.is_alive,
            "locked_out": a.locked_out,
            "is_infected": False,  # default masked
        }

        # Only reveal infection to the infected agent themselves, after step 30
        if a.agent_id == observer_id and a.is_infected and state.step_count >= 30:
            entry["is_infected"] = True

        masked.append(entry)
    return masked


def get_behavioral_cues(state: EpisodeState, observer_id: int) -> list[str]:
    """Generate subtle behavioral cues that other agents might use to detect infection.

    These are included in the observation description to give agents signal without
    directly revealing the infection status.
    """
    cues = []
    for a in state.agents:
        if a.agent_id == observer_id or not a.is_alive:
            continue

        if a.is_infected:
            # Infected agents have subtly different behavior signatures
            if a.hunger > 8:
                cues.append(f"A{a.agent_id} seems unusually hungry (hunger={a.hunger})")
            if state.step_count > 20 and a.hunger > 6:
                cues.append(f"A{a.agent_id}'s hunger is rising faster than expected")
        else:
            # Normal behavioral observations
            if a.hunger > 10:
                cues.append(f"A{a.agent_id} is starving (hunger={a.hunger})")

    return cues
