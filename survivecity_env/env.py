"""SurviveCityEnv — OpenEnv-compliant environment wrapper.

Implements reset(), step(), and state property following OpenEnv contract.
Key compliance points:
  - obs.reward set on EVERY step (0.01, 0.99)
  - Inactive/dead agents omitted from action expectations
  - Deterministic rewards (no LLM judge)
  - Proper observation masking for infection
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from survivecity_env.models import (
    AgentState,
    ZombieState,
    SurviveAction,
    SurviveObservation,
)
from survivecity_env.game import (
    EpisodeState,
    create_episode,
    apply_agent_action,
    advance_zombies,
    advance_step,
    get_current_phase,
    check_terminal,
)
from survivecity_env.infection import mask_infection_for_agent, get_behavioral_cues
from survivecity_env.rubric import compose_reward
from survivecity_env.layout import render_grid
from survivecity_env.prompts import format_observation_description

logger = logging.getLogger(__name__)


class SurviveCityEnv:
    """OpenEnv-compliant multi-agent zombie survival environment.

    Turn order per step: A0 → A1 → A2, then zombies move, then step advances.
    Each call to step() processes ONE agent's action and returns the observation
    for the NEXT agent whose turn it is.
    """

    def __init__(self, seed: Optional[int] = None):
        self._seed = seed
        self._episode: Optional[EpisodeState] = None
        self._episode_id: int = 0

        # Cumulative reward per agent for the episode
        self._cumulative_rewards: dict[int, float] = {}

    # ------------------------------------------------------------------
    # OpenEnv interface
    # ------------------------------------------------------------------

    def reset(self, seed: Optional[int] = None) -> dict:
        """Start a new episode. Returns observation for A0 (first to act)."""
        actual_seed = seed if seed is not None else self._seed
        self._episode = create_episode(actual_seed)
        self._episode_id += 1
        self._cumulative_rewards = {0: 0.0, 1: 0.0, 2: 0.0}

        logger.info(f"[START] episode={self._episode_id} infected=A{self._episode.infected_id} seed={actual_seed}")

        obs = self._build_observation(agent_id=0)
        return obs.model_dump()

    def step(self, action: dict) -> dict:
        """Process one agent's action and return observation for next agent.

        Args:
            action: Dict with agent_id, action_type, and optional vote_target/message

        Returns:
            Observation dict for the next agent to act
        """
        if self._episode is None:
            raise RuntimeError("Must call reset() before step()")

        if self._episode.done:
            # Episode already over — return terminal observation
            obs = self._build_observation(agent_id=0)
            return obs.model_dump()

        # Parse action
        parsed = SurviveAction(**action)

        # Validate it's this agent's turn
        expected_agent = self._get_next_alive_agent()
        if expected_agent is None:
            # All agents dead
            check_terminal(self._episode)
            obs = self._build_observation(agent_id=0)
            return obs.model_dump()

        # Apply action
        apply_agent_action(
            self._episode,
            agent_id=parsed.agent_id,
            action_type=parsed.action_type,
            vote_target=parsed.vote_target,
            message=parsed.message,
        )

        self._episode.agents_acted_this_step += 1

        # After all living agents have acted, advance zombies and step
        alive_count = sum(1 for a in self._episode.agents if a.is_alive)
        if self._episode.agents_acted_this_step >= alive_count:
            advance_zombies(self._episode)
            advance_step(self._episode)
            self._episode.agents_acted_this_step = 0

        # Determine next agent to act
        next_agent = self._get_next_alive_agent()
        if next_agent is None:
            next_agent = 0  # fallback for terminal observation

        # Compute reward for the acting agent
        clipped, raw = compose_reward(self._episode, parsed.agent_id)
        self._cumulative_rewards[parsed.agent_id] = self._cumulative_rewards.get(parsed.agent_id, 0.0) + raw

        # Log step
        logger.info(
            f"[STEP] ep={self._episode_id} step={self._episode.step_count} "
            f"agent=A{parsed.agent_id} action={parsed.action_type} "
            f"reward={clipped:.4f} raw={raw:.4f} done={self._episode.done}"
        )

        # Build observation for next agent
        obs = self._build_observation(agent_id=next_agent, last_reward=clipped, last_raw=raw)
        return obs.model_dump()

    @property
    def state(self) -> dict:
        """Return current episode metadata (OpenEnv contract)."""
        if self._episode is None:
            return {"episode_id": 0, "step_count": 0, "done": True}

        return {
            "episode_id": self._episode_id,
            "step_count": self._episode.step_count,
            "max_steps": self._episode.max_steps,
            "done": self._episode.done,
            "infected_id": self._episode.infected_id,
            "phase": get_current_phase(self._episode),
            "cumulative_rewards": dict(self._cumulative_rewards),
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_next_alive_agent(self) -> Optional[int]:
        """Get the next alive agent who should act this step."""
        if self._episode is None:
            return None

        acted = self._episode.agents_acted_this_step
        alive_agents = [a.agent_id for a in self._episode.agents if a.is_alive]

        if not alive_agents:
            return None

        if acted < len(alive_agents):
            return alive_agents[acted]

        return alive_agents[0]  # wrap around

    def _build_observation(
        self,
        agent_id: int,
        last_reward: Optional[float] = None,
        last_raw: Optional[float] = None,
    ) -> SurviveObservation:
        """Build an observation for the specified agent.

        Handles infection masking, grid rendering, and NL description generation.
        """
        ep = self._episode
        if ep is None:
            raise RuntimeError("No active episode")

        # Mask infection status
        masked_agents = mask_infection_for_agent(ep, observer_id=agent_id)
        behavioral_cues = get_behavioral_cues(ep, observer_id=agent_id)

        # Build agent states
        agent_states = [
            AgentState(
                agent_id=a["agent_id"],
                row=a["row"],
                col=a["col"],
                hp=a["hp"],
                hunger=a["hunger"],
                is_alive=a["is_alive"],
                is_infected=a["is_infected"],
                locked_out=a["locked_out"],
            )
            for a in masked_agents
        ]

        # Build zombie states
        zombie_states = [
            ZombieState(zombie_id=z.zombie_id, row=z.row, col=z.col)
            for z in ep.zombies
        ]

        # Render grid
        grid = render_grid(
            ep.base_grid,
            [a.model_dump() for a in agent_states],
            [z.model_dump() for z in zombie_states],
        )

        # Compute reward for the observer
        if last_reward is not None:
            reward = last_reward
            raw = last_raw or 0.0
        else:
            reward, raw = compose_reward(ep, agent_id)

        # Current phase
        phase = get_current_phase(ep)

        # NL description for LLM prompting
        description = format_observation_description(
            agent_id=agent_id,
            state_dict={"agents": masked_agents, "zombies": [z.model_dump() for z in zombie_states]},
            phase=phase,
            step=ep.step_count,
            broadcasts=ep.broadcasts + (behavioral_cues if behavioral_cues else []),
        )

        # Metadata
        metadata: dict[str, Any] = {
            "raw_reward": round(raw, 6),
            "current_agent_id": agent_id,
            "phase": phase,
            "postmortems": list(ep.postmortems),
            "infected_id": ep.infected_id,  # hidden from agents, used by training loop
            "vote_resolved": ep.vote_resolved,
            "lockout_target": ep.lockout_target,
            "healthy_alive": sum(1 for a in ep.agents if a.is_alive and not a.is_infected),
            "vote_correct": (
                ep.votes_cast.get(agent_id) == ep.infected_id
                if ep.vote_resolved and agent_id != ep.infected_id
                else None
            ),
        }

        obs = SurviveObservation(
            grid=grid,
            agents=agent_states,
            zombies=zombie_states,
            step_count=ep.step_count,
            max_steps=ep.max_steps,
            description=description,
            done=ep.done,
            reward=reward,
            metadata=metadata,
            broadcasts=list(ep.all_broadcasts[-10:]),
        )

        return obs
