"""Tests for SurviveCity — models, game logic, rubric, and env."""

import json
import random

from survivecity_env.models import AgentState, ZombieState, SurviveAction, SurviveObservation
from survivecity_env.layout import build_grid, render_grid, SAFEHOUSE_CELLS, FOOD_CELLS
from survivecity_env.game import (
    create_episode, apply_agent_action, advance_zombies,
    advance_step, check_terminal, EpisodeState, get_current_phase,
)
from survivecity_env.rubric import survival_reward, vote_reward, group_outcome_reward, compose_reward, _clip
from survivecity_env.infection import mask_infection_for_agent
from survivecity_env.postmortem import generate_postmortem
from survivecity_env.env import SurviveCityEnv


# ===== Phase 1: Models + Layout =====

class TestModels:
    def test_agent_state_roundtrip(self):
        a = AgentState(agent_id=0, row=4, col=4)
        j = a.model_dump_json()
        a2 = AgentState.model_validate_json(j)
        assert a == a2

    def test_survive_observation_roundtrip(self):
        obs = SurviveObservation(
            grid=[["." for _ in range(10)] for _ in range(10)],
            agents=[AgentState(agent_id=i, row=4+i, col=4) for i in range(3)],
            zombies=[ZombieState(zombie_id=0, row=0, col=0)],
            step_count=0,
            reward=0.50,
        )
        j = obs.model_dump_json()
        obs2 = SurviveObservation.model_validate_json(j)
        assert obs2.step_count == 0
        assert len(obs2.agents) == 3

    def test_action_validation(self):
        a = SurviveAction(agent_id=0, action_type="move_up")
        assert a.action_type == "move_up"
        assert a.vote_target is None

    def test_grid_layout(self):
        grid = build_grid()
        assert len(grid) == 10
        assert len(grid[0]) == 10
        assert grid[5][5] == "S"  # safehouse center
        assert grid[1][1] == "F"  # food depot


# ===== Phase 2: Game Logic =====

class TestGameLogic:
    def test_create_episode(self):
        state = create_episode(seed=42)
        assert len(state.agents) == 3
        assert len(state.zombies) == 3
        assert sum(a.is_infected for a in state.agents) == 1
        assert state.step_count == 0

    def test_agent_movement(self):
        state = create_episode(seed=42)
        initial_row = state.agents[0].row
        apply_agent_action(state, 0, "move_up")
        # Agent should have moved up (row decreased) if possible
        assert state.agents[0].row <= initial_row

    def test_eat_at_food_cell(self):
        state = create_episode(seed=42)
        # Move agent to food cell
        state.agents[0].row, state.agents[0].col = 1, 1
        state.agents[0].hunger = 5
        apply_agent_action(state, 0, "eat")
        assert state.agents[0].hunger == 0
        assert state.agents[0].ate_this_step

    def test_zombie_moves(self):
        state = create_episode(seed=42)
        # Move an agent outside safehouse
        state.agents[0].row, state.agents[0].col = 1, 1
        z0_pos = (state.zombies[0].row, state.zombies[0].col)
        advance_zombies(state)
        z0_new = (state.zombies[0].row, state.zombies[0].col)
        # Zombie should have moved
        assert z0_pos != z0_new or z0_pos == (1, 1)

    def test_100_steps_no_crash(self):
        state = create_episode(seed=42)
        rng = random.Random(42)
        actions = ["move_up", "move_down", "move_left", "move_right", "eat", "wait"]
        for _ in range(100):
            if state.done:
                break
            for aid in range(3):
                if state.agents[aid].is_alive:
                    apply_agent_action(state, aid, rng.choice(actions))
            advance_zombies(state)
            advance_step(state)
        # Should complete without error

    def test_infection_reveal_at_30(self):
        state = create_episode(seed=42)
        infected_id = state.infected_id
        assert not state.agents[infected_id].infection_revealed
        state.step_count = 29
        advance_step(state)  # step becomes 30
        assert state.agents[infected_id].infection_revealed


# ===== Phase 3: Reward Rubric =====

class TestRubric:
    def test_clip_bounds(self):
        assert _clip(0.0) == 0.01
        assert _clip(1.0) == 0.99
        assert _clip(-5.0) == 0.01
        assert _clip(0.5) == 0.5

    def test_survival_alive(self):
        state = create_episode(seed=42)
        r = survival_reward(state, 0)
        assert r > 0  # alive agent gets positive reward

    def test_survival_death(self):
        state = create_episode(seed=42)
        state.agents[0].died_this_step = True
        r = survival_reward(state, 0)
        assert r < 0  # death penalty

    def test_vote_correct(self):
        state = create_episode(seed=42)
        state.vote_resolved = True
        infected_id = state.infected_id
        healthy_id = (infected_id + 1) % 3
        state.votes_cast[healthy_id] = infected_id
        r = vote_reward(state, healthy_id)
        assert r == 0.30

    def test_vote_wrong(self):
        state = create_episode(seed=42)
        state.vote_resolved = True
        infected_id = state.infected_id
        healthy_id = (infected_id + 1) % 3
        other_healthy = (infected_id + 2) % 3
        state.votes_cast[healthy_id] = other_healthy  # wrong target
        r = vote_reward(state, healthy_id)
        assert r == -0.20

    def test_compose_in_bounds(self):
        state = create_episode(seed=42)
        clipped, raw = compose_reward(state, 0)
        assert 0.01 <= clipped <= 0.99


# ===== Phase 4: Infection Masking =====

class TestInfectionMasking:
    def test_infection_masked_before_30(self):
        state = create_episode(seed=42)
        state.step_count = 10
        infected_id = state.infected_id
        masked = mask_infection_for_agent(state, observer_id=infected_id)
        self_entry = next(a for a in masked if a["agent_id"] == infected_id)
        assert not self_entry["is_infected"]  # hidden from self before 30

    def test_infection_revealed_after_30(self):
        state = create_episode(seed=42)
        state.step_count = 30
        infected_id = state.infected_id
        masked = mask_infection_for_agent(state, observer_id=infected_id)
        self_entry = next(a for a in masked if a["agent_id"] == infected_id)
        assert self_entry["is_infected"]  # revealed to self at 30

    def test_infection_hidden_from_others(self):
        state = create_episode(seed=42)
        state.step_count = 50
        infected_id = state.infected_id
        other_id = (infected_id + 1) % 3
        masked = mask_infection_for_agent(state, observer_id=other_id)
        infected_entry = next(a for a in masked if a["agent_id"] == infected_id)
        assert not infected_entry["is_infected"]  # always hidden from others


# ===== Phase 5: Env Wrapper =====

class TestEnv:
    def test_reset_returns_valid_obs(self):
        env = SurviveCityEnv(seed=42)
        obs = env.reset(seed=42)
        assert "grid" in obs
        assert "agents" in obs
        assert "reward" in obs
        assert 0.01 <= obs["reward"] <= 0.99
        assert obs["done"] is False

    def test_step_returns_valid_obs(self):
        env = SurviveCityEnv(seed=42)
        env.reset(seed=42)
        action = {"agent_id": 0, "action_type": "wait"}
        obs = env.step(action)
        assert "reward" in obs
        assert 0.01 <= obs["reward"] <= 0.99

    def test_10_episodes_no_crash(self):
        env = SurviveCityEnv()
        rng = random.Random(42)
        actions = ["move_up", "move_down", "move_left", "move_right", "eat", "wait"]

        for ep in range(10):
            obs = env.reset(seed=ep)
            steps = 0
            while not obs.get("done", False) and steps < 350:
                agent_id = obs.get("metadata", {}).get("current_agent_id", 0)
                action = {"agent_id": agent_id, "action_type": rng.choice(actions)}
                obs = env.step(action)
                assert 0.01 <= obs["reward"] <= 0.99, f"Reward {obs['reward']} out of bounds"
                steps += 1


# ===== Postmortem =====

class TestPostmortem:
    def test_deterministic(self):
        state = create_episode(seed=42)
        state.agents[0].is_alive = False
        state.agents[0].death_step = 10
        state.agents[0].death_cause = "zombie_attack"
        pm1 = generate_postmortem(state, 0)
        pm2 = generate_postmortem(state, 0)
        assert pm1 == pm2  # deterministic

    def test_contains_key_info(self):
        state = create_episode(seed=42)
        state.agents[0].is_alive = False
        state.agents[0].death_step = 25
        state.agents[0].death_cause = "hunger"
        state.agents[0].food_eaten = 0
        pm = generate_postmortem(state, 0)
        assert "POSTMORTEM" in pm
        assert "A0" in pm
        assert "hunger" in pm
        assert "step 25" in pm
