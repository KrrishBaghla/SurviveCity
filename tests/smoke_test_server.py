"""Quick smoke test of server endpoints."""
import requests

# Health
r = requests.get("http://127.0.0.1:7860/health")
print(f"Health: {r.json()}")
assert r.json() == {"status": "healthy"}, "Health check failed!"

# Reset
r = requests.post("http://127.0.0.1:7860/reset", json={"seed": 42})
obs = r.json()
print(f"Reset: step={obs['step_count']}, reward={obs['reward']:.4f}, done={obs['done']}")
assert 0.01 <= obs["reward"] <= 0.99

# Step (wait)
r = requests.post("http://127.0.0.1:7860/step", json={"agent_id": 0, "action_type": "wait"})
obs = r.json()
print(f"Step wait: reward={obs['reward']:.4f}, in_bounds={0.01 <= obs['reward'] <= 0.99}")
assert 0.01 <= obs["reward"] <= 0.99

# Step (move)
r = requests.post("http://127.0.0.1:7860/step", json={"agent_id": 1, "action_type": "move_up"})
obs = r.json()
print(f"Step move: reward={obs['reward']:.4f}")

# Step (broadcast)
r = requests.post("http://127.0.0.1:7860/step", json={"agent_id": 2, "action_type": "broadcast", "message": "zombie nearby!"})
obs = r.json()
print(f"Step broadcast: reward={obs['reward']:.4f}, step_count={obs['step_count']}")

# Run a full episode with random actions
import random
r = requests.post("http://127.0.0.1:7860/reset", json={"seed": 100})
obs = r.json()
steps = 0
actions = ["move_up", "move_down", "move_left", "move_right", "eat", "wait"]
while not obs.get("done") and steps < 350:
    agent_id = obs.get("metadata", {}).get("current_agent_id", 0)
    step_count = obs.get("step_count", 0)
    if step_count == 50:
        action = {"agent_id": agent_id, "action_type": "vote_lockout", "vote_target": random.choice([0,1,2])}
    else:
        action = {"agent_id": agent_id, "action_type": random.choice(actions)}
    r = requests.post("http://127.0.0.1:7860/step", json=action)
    obs = r.json()
    assert 0.01 <= obs["reward"] <= 0.99, f"Reward {obs['reward']} out of bounds at step {steps}"
    steps += 1

print(f"\nFull episode: {steps} actions, step_count={obs['step_count']}, done={obs['done']}")
print(f"Final reward: {obs['reward']:.4f}")
meta = obs.get("metadata", {})
print(f"Healthy alive: {meta.get('healthy_alive')}")
print(f"Postmortems: {len(meta.get('postmortems', []))}")
print("\nAll server smoke tests PASSED!")
