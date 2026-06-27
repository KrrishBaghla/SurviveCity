"""Core game logic for SurviveCity — turn advancement, zombie AI, vote resolution.

All pure-Python, no external dependencies beyond the project's own models/layout.
"""

from __future__ import annotations

import random
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from survivecity_env.layout import (
    GRID_ROWS, GRID_COLS,
    SAFEHOUSE_CELLS, FOOD_CELLS, WALL_CELLS,
    AGENT_SPAWNS, ZOMBIE_SPAWNS,
    build_grid, render_grid,
)


# ---------------------------------------------------------------------------
# Internal episode state (not exposed to clients — only via Observation)
# ---------------------------------------------------------------------------

@dataclass
class _AgentInternal:
    """Mutable agent state tracked internally during an episode."""

    agent_id: int
    row: int
    col: int
    hp: int = 3
    hunger: int = 0
    is_alive: bool = True
    is_infected: bool = False
    infection_revealed: bool = False  # flips at step 30 for infected agent
    locked_out: bool = False

    # Per-step transient flags (reset each step)
    ate_this_step: bool = False
    damage_this_step: int = 0
    died_this_step: bool = False

    # Accumulated stats
    food_eaten: int = 0
    death_step: Optional[int] = None
    death_cause: Optional[str] = None

    def reset_step_flags(self) -> None:
        self.ate_this_step = False
        self.damage_this_step = 0
        self.died_this_step = False


@dataclass
class _ZombieInternal:
    """Mutable zombie state."""

    zombie_id: int
    row: int
    col: int


@dataclass
class EpisodeState:
    """Full mutable state of a running episode."""

    agents: list[_AgentInternal]
    zombies: list[_ZombieInternal]
    base_grid: list[list[str]]

    step_count: int = 0
    max_steps: int = 100
    infected_id: int = 0           # which agent is secretly infected
    done: bool = False

    # Turn tracking: within each step, agents act in order A0→A1→A2
    current_agent_turn: int = 0    # 0, 1, or 2
    agents_acted_this_step: int = 0

    # Vote tracking
    vote_phase_active: bool = False
    votes_cast: dict[int, Optional[int]] = field(default_factory=dict)
    vote_resolved: bool = False
    lockout_target: Optional[int] = None

    # Broadcasts this step
    broadcasts: list[str] = field(default_factory=list)
    all_broadcasts: list[str] = field(default_factory=list)

    # Post-mortems generated during this episode
    postmortems: list[str] = field(default_factory=list)

    # Random seed for reproducibility
    rng: random.Random = field(default_factory=lambda: random.Random())

    # Infection spread tracking
    infection_spread_used: bool = False  # cap: 1 infection spread per episode


def create_episode(seed: Optional[int] = None) -> EpisodeState:
    """Initialize a fresh episode with randomized infected agent."""
    rng = random.Random(seed)

    agents = [
        _AgentInternal(agent_id=i, row=r, col=c)
        for i, (r, c) in enumerate(AGENT_SPAWNS)
    ]
    zombies = [
        _ZombieInternal(zombie_id=i, row=r, col=c)
        for i, (r, c) in enumerate(ZOMBIE_SPAWNS)
    ]

    # Randomly pick one agent to be infected
    infected_id = rng.randint(0, 2)
    agents[infected_id].is_infected = True

    state = EpisodeState(
        agents=agents,
        zombies=zombies,
        base_grid=build_grid(),
        infected_id=infected_id,
        rng=rng,
    )
    return state


# ---------------------------------------------------------------------------
# Movement helpers
# ---------------------------------------------------------------------------

_DIRECTION_DELTAS = {
    "move_up": (-1, 0),
    "move_down": (1, 0),
    "move_left": (0, -1),
    "move_right": (0, 1),
}


def _is_walkable(row: int, col: int, state: EpisodeState) -> bool:
    """Check if a cell is within bounds and not a wall."""
    if row < 0 or row >= GRID_ROWS or col < 0 or col >= GRID_COLS:
        return False
    if (row, col) in WALL_CELLS:
        return False
    return True


def _is_in_safehouse(row: int, col: int) -> bool:
    return (row, col) in SAFEHOUSE_CELLS


def _is_food_cell(row: int, col: int) -> bool:
    return (row, col) in FOOD_CELLS


# ---------------------------------------------------------------------------
# Agent action execution
# ---------------------------------------------------------------------------

def apply_agent_action(state: EpisodeState, agent_id: int, action_type: str,
                       vote_target: Optional[int] = None,
                       message: Optional[str] = None) -> None:
    """Apply one agent's action to the episode state.

    This advances that agent's turn but does NOT advance the global step counter.
    The step counter advances after all 3 agents have acted + zombies move.
    """
    agent = state.agents[agent_id]
    if not agent.is_alive:
        return  # dead agents can't act

    agent.reset_step_flags()

    # Hunger always increases (+1 per action, or +1.5 for infected = +2 every other step)
    if agent.is_infected:
        # 1.5× hunger: alternate between +1 and +2
        agent.hunger += 2 if (state.step_count % 2 == 0) else 1
    else:
        agent.hunger += 1

    # Starvation damage
    if agent.hunger >= 15:
        agent.hp -= 1
        agent.damage_this_step += 1
        if agent.hp <= 0:
            _kill_agent(agent, state, "hunger")

    if not agent.is_alive:
        return

    if action_type in _DIRECTION_DELTAS:
        dr, dc = _DIRECTION_DELTAS[action_type]
        new_r, new_c = agent.row + dr, agent.col + dc

        # Locked-out agents can't enter safehouse
        if agent.locked_out and (new_r, new_c) in SAFEHOUSE_CELLS:
            pass  # move blocked — stay in place
        elif _is_walkable(new_r, new_c, state):
            agent.row = new_r
            agent.col = new_c

    elif action_type == "eat":
        if _is_food_cell(agent.row, agent.col):
            agent.hunger = 0
            agent.ate_this_step = True
            agent.food_eaten += 1

    elif action_type == "vote_lockout":
        if state.step_count >= 50 and vote_target is not None and 0 <= vote_target <= 2:
            state.votes_cast[agent_id] = vote_target

    elif action_type == "broadcast":
        if message:
            msg = f"A{agent_id}: {message[:40]}"
            state.broadcasts.append(msg)
            state.all_broadcasts.append(msg)

    elif action_type == "wait":
        pass  # do nothing

    # Infected agent post-reveal: attack adjacent healthy agents
    if agent.is_infected and agent.infection_revealed:
        _infected_attack(agent, state)

    # Safehouse healing: agents inside safehouse heal 1 HP per step
    if _is_in_safehouse(agent.row, agent.col) and not agent.locked_out:
        agent.hp = min(3, agent.hp + 1)


def _infected_attack(attacker: _AgentInternal, state: EpisodeState) -> None:
    """Infected agent attacks adjacent healthy agents (after step 30 reveal)."""
    for other in state.agents:
        if other.agent_id == attacker.agent_id or not other.is_alive:
            continue
        if abs(other.row - attacker.row) <= 1 and abs(other.col - attacker.col) <= 1:
            other.hp -= 1
            other.damage_this_step += 1
            if other.hp <= 0:
                _kill_agent(other, state, "infected_attack")

            # Infection spread (20% chance, cap 1 per episode)
            if not state.infection_spread_used and not other.is_infected:
                if state.rng.random() < 0.20:
                    # We don't actually spread infection in v1 — cap is 1 infected per episode
                    state.infection_spread_used = True


def _kill_agent(agent: _AgentInternal, state: EpisodeState, cause: str) -> None:
    """Mark an agent as dead and record death info."""
    agent.is_alive = False
    agent.hp = 0
    agent.died_this_step = True
    agent.death_step = state.step_count
    agent.death_cause = cause

    # Generate post-mortem
    from survivecity_env.postmortem import generate_postmortem
    pm = generate_postmortem(state, agent.agent_id)
    state.postmortems.append(pm)


# ---------------------------------------------------------------------------
# Zombie AI — BFS chase nearest non-safehouse agent
# ---------------------------------------------------------------------------

def advance_zombies(state: EpisodeState) -> None:
    """Move all zombies one step toward nearest reachable living agent.

    Zombies cannot enter safehouse cells.
    """
    for zombie in state.zombies:
        target = _find_nearest_agent_for_zombie(zombie, state)
        if target is not None:
            _move_zombie_toward(zombie, target, state)
        else:
            _wander_zombie(zombie, state)

        # Check collision: zombie on same cell as agent → damage
        for agent in state.agents:
            if not agent.is_alive:
                continue
            if agent.row == zombie.row and agent.col == zombie.col:
                agent.hp -= 1
                agent.damage_this_step += 1
                if agent.hp <= 0:
                    _kill_agent(agent, state, "zombie_attack")


def _find_nearest_agent_for_zombie(zombie: _ZombieInternal, state: EpisodeState) -> Optional[tuple[int, int]]:
    """Find nearest living agent not inside the safehouse (zombies can't enter)."""
    best_dist = float("inf")
    best_pos = None
    for agent in state.agents:
        if not agent.is_alive:
            continue
        if _is_in_safehouse(agent.row, agent.col):
            continue  # zombie can't reach agents inside safehouse
        dist = abs(agent.row - zombie.row) + abs(agent.col - zombie.col)
        if dist < best_dist:
            best_dist = dist
            best_pos = (agent.row, agent.col)
    return best_pos


def _move_zombie_toward(zombie: _ZombieInternal, target: tuple[int, int], state: EpisodeState) -> None:
    """BFS pathfinding: move zombie 1 step toward target, avoiding walls and safehouse."""
    start = (zombie.row, zombie.col)
    goal = target

    if start == goal:
        return

    # BFS to find shortest path
    queue: deque[tuple[tuple[int, int], list[tuple[int, int]]]] = deque()
    queue.append((start, [start]))
    visited: set[tuple[int, int]] = {start}
    max_attempts = 200  # cap to prevent infinite loops

    attempts = 0
    while queue and attempts < max_attempts:
        attempts += 1
        pos, path = queue.popleft()
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = pos[0] + dr, pos[1] + dc
            if (nr, nc) in visited:
                continue
            if nr < 0 or nr >= GRID_ROWS or nc < 0 or nc >= GRID_COLS:
                continue
            if (nr, nc) in WALL_CELLS:
                continue
            if (nr, nc) in SAFEHOUSE_CELLS:
                continue  # zombies can't enter safehouse

            visited.add((nr, nc))
            new_path = path + [(nr, nc)]

            if (nr, nc) == goal:
                # Move zombie to first step on path
                if len(new_path) > 1:
                    zombie.row, zombie.col = new_path[1]
                return

            queue.append(((nr, nc), new_path))

    # If no path found, wander
    _wander_zombie(zombie, state)


def _wander_zombie(zombie: _ZombieInternal, state: EpisodeState) -> None:
    """Random wander: move to a random adjacent non-wall, non-safehouse cell."""
    options = []
    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        nr, nc = zombie.row + dr, zombie.col + dc
        if (0 <= nr < GRID_ROWS and 0 <= nc < GRID_COLS
                and (nr, nc) not in WALL_CELLS
                and (nr, nc) not in SAFEHOUSE_CELLS):
            options.append((nr, nc))
    if options:
        nr, nc = state.rng.choice(options)
        zombie.row, zombie.col = nr, nc


# ---------------------------------------------------------------------------
# Phase transitions
# ---------------------------------------------------------------------------

def check_infection_reveal(state: EpisodeState) -> None:
    """At step 30, reveal infection to the infected agent."""
    if state.step_count >= 30:
        infected = state.agents[state.infected_id]
        if not infected.infection_revealed and infected.is_alive:
            infected.infection_revealed = True


def resolve_vote(state: EpisodeState) -> None:
    """At step 50, tally votes and apply lockout if majority exists."""
    if state.vote_resolved:
        return

    state.vote_resolved = True

    # Count votes
    tally: dict[int, int] = {}
    for voter_id, target_id in state.votes_cast.items():
        if target_id is not None:
            tally[target_id] = tally.get(target_id, 0) + 1

    if not tally:
        return

    # Find majority
    max_votes = max(tally.values())
    candidates = [tid for tid, v in tally.items() if v == max_votes]

    if len(candidates) == 1:
        # Clear majority — lock them out
        target = candidates[0]
        state.lockout_target = target
        locked = state.agents[target]
        locked.locked_out = True

        # If locked out while inside safehouse, they're ejected to nearest empty cell
        if _is_in_safehouse(locked.row, locked.col):
            _eject_from_safehouse(locked, state)
    # else: tie → no lockout


def _eject_from_safehouse(agent: _AgentInternal, state: EpisodeState) -> None:
    """Move a locked-out agent to nearest non-safehouse, non-wall cell."""
    from collections import deque as dq
    queue: deque[tuple[int, int]] = dq([(agent.row, agent.col)])
    visited: set[tuple[int, int]] = {(agent.row, agent.col)}

    while queue:
        r, c = queue.popleft()
        if (r, c) not in SAFEHOUSE_CELLS and (r, c) not in WALL_CELLS:
            agent.row, agent.col = r, c
            return
        for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < GRID_ROWS and 0 <= nc < GRID_COLS and (nr, nc) not in visited:
                visited.add((nr, nc))
                queue.append((nr, nc))


def check_terminal(state: EpisodeState) -> bool:
    """Check if episode should end."""
    if state.step_count >= state.max_steps:
        state.done = True
        return True

    # All agents dead
    alive = [a for a in state.agents if a.is_alive]
    if not alive:
        state.done = True
        return True

    # All healthy agents dead (infected wins)
    healthy_alive = [a for a in state.agents if a.is_alive and not a.is_infected]
    if not healthy_alive:
        state.done = True
        return True

    return False


def advance_step(state: EpisodeState) -> None:
    """Advance the global step counter and run per-step mechanics.

    Called after all 3 agents have acted and zombies have moved.
    """
    state.step_count += 1

    # Clear per-step broadcasts
    state.broadcasts = []

    # Check infection reveal at step 30
    check_infection_reveal(state)

    # Auto-trigger vote phase at step 50
    if state.step_count == 50:
        state.vote_phase_active = True

    # Resolve vote after step 50 actions
    if state.step_count == 51 and not state.vote_resolved:
        resolve_vote(state)

    # Check terminal conditions
    check_terminal(state)


def get_current_phase(state: EpisodeState) -> str:
    """Return the current game phase as a human-readable string."""
    if state.done:
        return "terminal"
    if state.step_count < 30:
        return "pre_reveal"
    if state.step_count < 50:
        return "post_reveal"
    if state.step_count == 50:
        return "vote"
    return "post_vote"
