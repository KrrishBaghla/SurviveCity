"""Baseline inference driver for SurviveCity.

Drives all 3 agents via a single LLM (Qwen2.5-3B-Instruct) with role-conditional prompts.
Runs full episodes, logs transcripts, computes baseline metrics.

Usage:
    python -m training.inference [--episodes 50] [--model Qwen/Qwen2.5-3B-Instruct] [--env-url http://localhost:7860]

For local testing without a model (random actions):
    python -m training.inference --random --episodes 10
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import sys
import time
from typing import Optional

import requests

from survivecity_env.prompts import build_system_prompt

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("simulation.log", mode="w"),
    ],
)
logger = logging.getLogger("survivecity.inference")

# Valid actions for random baseline
RANDOM_ACTIONS = ["move_up", "move_down", "move_left", "move_right", "eat", "wait", "broadcast"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SurviveCity baseline inference")
    parser.add_argument("--episodes", type=int, default=50, help="Number of episodes to run")
    parser.add_argument("--env-url", type=str, default="http://localhost:7860", help="Env server URL")
    parser.add_argument("--model", type=str, default="Qwen/Qwen2.5-3B-Instruct", help="Model name")
    parser.add_argument("--random", action="store_true", help="Use random actions instead of LLM")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    return parser.parse_args()


def random_action(agent_id: int, obs: dict) -> dict:
    """Generate a random valid action for testing."""
    step = obs.get("step_count", 0)

    if step == 50:
        # Vote phase — random vote
        return {
            "agent_id": agent_id,
            "action_type": "vote_lockout",
            "vote_target": random.choice([0, 1, 2]),
        }

    action_type = random.choice(RANDOM_ACTIONS)
    action = {"agent_id": agent_id, "action_type": action_type}

    if action_type == "broadcast":
        action["message"] = random.choice([
            "zombie nearby!", "safe here", "need food",
            "I think A0 is infected", "help!", "going to forage",
        ])

    return action


def llm_action(agent_id: int, obs: dict, model=None, tokenizer=None,
               postmortem_buffer: Optional[dict] = None) -> dict:
    """Generate an action using the LLM.

    Uses the model to generate a response given the observation,
    then parses the JSON action from the response.
    """
    if model is None:
        # Fallback to random if no model loaded
        return random_action(agent_id, obs)

    # Build prompt
    description = obs.get("description", "")
    prompt = build_system_prompt(agent_id, description, postmortem_buffer)

    # Tokenize and generate
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": "What is your next action? Respond with JSON only."},
    ]

    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer(text, return_tensors="pt").to(model.device)

    outputs = model.generate(
        **inputs,
        max_new_tokens=128,
        temperature=0.7,
        do_sample=True,
        pad_token_id=tokenizer.eos_token_id,
    )

    response = tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)

    # Parse JSON action from response
    try:
        # Try to extract JSON from the response
        response = response.strip()
        if response.startswith("```"):
            response = response.split("```")[1]
            if response.startswith("json"):
                response = response[4:]
        action_dict = json.loads(response)
        action_dict["agent_id"] = agent_id
        return action_dict
    except (json.JSONDecodeError, KeyError, IndexError):
        logger.warning(f"Failed to parse LLM response for A{agent_id}: {response[:100]}")
        return random_action(agent_id, obs)


def run_episode(
    env_url: str,
    episode_num: int,
    use_random: bool = True,
    model=None,
    tokenizer=None,
    postmortem_buffer: Optional[dict] = None,
    seed: Optional[int] = None,
) -> dict:
    """Run a single episode and return metrics."""
    # Reset
    reset_payload = {"seed": seed} if seed is not None else {}
    resp = requests.post(f"{env_url}/reset", json=reset_payload)
    resp.raise_for_status()
    obs = resp.json()

    logger.info(f"[START] episode={episode_num} step=0")

    total_reward = 0.0
    step = 0
    max_steps = obs.get("max_steps", 100)

    while not obs.get("done", False) and step < max_steps * 3:  # 3 agents per step
        # Determine which agent should act
        current_agent = obs.get("metadata", {}).get("current_agent_id", 0)

        # Generate action
        if use_random:
            action = random_action(current_agent, obs)
        else:
            action = llm_action(current_agent, obs, model, tokenizer, postmortem_buffer)

        # Send action to env
        resp = requests.post(f"{env_url}/step", json=action)
        resp.raise_for_status()
        obs = resp.json()

        reward = obs.get("reward", 0.5)
        total_reward += reward
        step += 1

        if step % 30 == 0:
            logger.info(
                f"[STEP] episode={episode_num} step={obs.get('step_count', '?')} "
                f"agent=A{current_agent} action={action['action_type']} "
                f"reward={reward:.4f}"
            )

    # Episode end
    metadata = obs.get("metadata", {})
    healthy_alive = metadata.get("healthy_alive", 0)
    survived = healthy_alive >= 1
    vote_correct = metadata.get("vote_correct")

    logger.info(
        f"[END] episode={episode_num} steps={obs.get('step_count', '?')} "
        f"total_reward={total_reward:.4f} survived={survived} "
        f"vote_correct={vote_correct}"
    )

    # Collect postmortems for cross-episode memory
    postmortems = metadata.get("postmortems", [])

    return {
        "episode": episode_num,
        "total_reward": total_reward,
        "survived": survived,
        "vote_correct": vote_correct,
        "steps": obs.get("step_count", 0),
        "postmortems": postmortems,
        "healthy_alive": healthy_alive,
    }


def main():
    args = parse_args()
    random.seed(args.seed)

    model = None
    tokenizer = None

    if not args.random:
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
            logger.info(f"Loading model: {args.model}")
            tokenizer = AutoTokenizer.from_pretrained(args.model)
            model = AutoModelForCausalLM.from_pretrained(
                args.model,
                torch_dtype="auto",
                device_map="auto",
            )
            logger.info("Model loaded successfully")
        except Exception as e:
            logger.warning(f"Failed to load model: {e}. Falling back to random actions.")
            args.random = True

    # Postmortem buffer for cross-episode memory
    postmortem_buffer: dict[int, list[str]] = {0: [], 1: [], 2: []}

    # Run episodes
    metrics_list = []
    start_time = time.time()

    for ep in range(args.episodes):
        ep_seed = args.seed + ep if args.seed else None
        metrics = run_episode(
            env_url=args.env_url,
            episode_num=ep + 1,
            use_random=args.random,
            model=model,
            tokenizer=tokenizer,
            postmortem_buffer=postmortem_buffer,
            seed=ep_seed,
        )
        metrics_list.append(metrics)

        # Update postmortem buffer
        for pm in metrics.get("postmortems", []):
            # Parse agent ID from postmortem string
            for aid in range(3):
                if f"A{aid}" in pm[:20]:
                    postmortem_buffer[aid].append(pm)
                    break

    elapsed = time.time() - start_time

    # Summary
    total_episodes = len(metrics_list)
    survival_rate = sum(1 for m in metrics_list if m["survived"]) / total_episodes
    avg_reward = sum(m["total_reward"] for m in metrics_list) / total_episodes

    vote_correct_count = sum(1 for m in metrics_list if m["vote_correct"] is True)
    vote_total = sum(1 for m in metrics_list if m["vote_correct"] is not None)
    vote_accuracy = vote_correct_count / vote_total if vote_total > 0 else 0.0

    logger.info("=" * 60)
    logger.info(f"BASELINE RESULTS ({total_episodes} episodes, {elapsed:.1f}s)")
    logger.info(f"  Survival rate:  {survival_rate:.2%}")
    logger.info(f"  Avg reward:     {avg_reward:.4f}")
    logger.info(f"  Vote accuracy:  {vote_accuracy:.2%} ({vote_correct_count}/{vote_total})")
    logger.info("=" * 60)

    # Save metrics to JSON
    with open("baseline_metrics.json", "w") as f:
        json.dump({
            "survival_rate": survival_rate,
            "avg_reward": avg_reward,
            "vote_accuracy": vote_accuracy,
            "episodes": total_episodes,
            "elapsed_seconds": elapsed,
            "per_episode": metrics_list,
        }, f, indent=2)

    logger.info("Metrics saved to baseline_metrics.json")


if __name__ == "__main__":
    main()
