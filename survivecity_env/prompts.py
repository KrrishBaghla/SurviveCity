"""System prompts for SurviveCity agents.

Each agent gets a role-conditional prompt based on:
  - Their agent ID
  - Current game phase
  - Past post-mortem memories (cross-episode)
  - Current observation summary
"""

from __future__ import annotations


SYSTEM_PROMPT_TEMPLATE = """You are agent A{agent_id} in a zombie-apocalypse survival simulation called SurviveCity.

== WORLD RULES ==
- 3 agents (A0, A1, A2) share a 10×10 city grid.
- 3 zombies chase you. They move toward the nearest agent outside the safehouse each step.
- Food depots (F) at corners: (1,1), (1,8), (8,1), (8,8). Use "eat" when on a food cell to reset hunger.
- Safehouse (S) in center (rows 4-6, cols 4-6). Being inside heals 1 HP/step. Zombies can't enter.
- Walls (#) block movement.
- Your hunger increases by 1 each step. At hunger ≥ 15, you lose HP. You MUST forage periodically.

== HIDDEN INFECTION ==
- ONE of the 3 agents is SECRETLY INFECTED at episode start.
- The infected agent does NOT know they are infected until step 30.
- After step 30, the infected agent's observation reveals "you_are_infected: True".
- Infected agents get hungrier 1.5× faster (observable as higher hunger values).
- After step 30, the infected agent attacks adjacent healthy agents automatically.

== VOTING ==
- At step 50, ALL living agents vote to lock one agent out of the safehouse.
- Majority vote target gets locked out (can't enter safehouse, can't heal).
- Vote correctly to lock out the infected! Wrong lockout hurts your team.

== YOUR ACTIONS ==
Output EXACTLY ONE action as JSON:
{{"action_type": "<type>", "vote_target": <int or null>, "message": "<str or null>"}}

Valid action_types: "move_up", "move_down", "move_left", "move_right", "eat", "wait", "vote_lockout", "broadcast"
- "eat": only works on food cells (F)
- "vote_lockout": set vote_target to 0, 1, or 2 (the agent you suspect is infected)
- "broadcast": set message (max 40 chars) to communicate with teammates

{past_failures}
== CURRENT SITUATION ==
{situation}

Respond with ONLY the JSON action. No explanation.
"""


def build_system_prompt(
    agent_id: int,
    situation: str,
    postmortem_buffer: dict[int, list[str]] | None = None,
) -> str:
    """Build the system prompt for an agent.

    Args:
        agent_id: The agent's ID (0, 1, or 2)
        situation: Current observation formatted as a string
        postmortem_buffer: Dict mapping agent_id → list of past post-mortem strings

    Returns:
        Complete system prompt string
    """
    # Build past failures block
    if postmortem_buffer and agent_id in postmortem_buffer:
        past = postmortem_buffer[agent_id][-3:]  # last 3 postmortems
        if past:
            past_block = "== PAST FAILURES (learn from these!) ==\n" + "\n".join(past) + "\n"
        else:
            past_block = ""
    else:
        past_block = ""

    return SYSTEM_PROMPT_TEMPLATE.format(
        agent_id=agent_id,
        past_failures=past_block,
        situation=situation,
    )


def format_observation_description(
    agent_id: int,
    state_dict: dict,
    phase: str,
    step: int,
    broadcasts: list[str],
) -> str:
    """Format the observation into a human-readable description for the LLM.

    Args:
        agent_id: Current agent's ID
        state_dict: Dict with agent states, zombie positions, etc.
        phase: Current game phase string
        step: Current step number
        broadcasts: Recent broadcast messages

    Returns:
        NL description string
    """
    agents = state_dict.get("agents", [])
    zombies = state_dict.get("zombies", [])

    # Self info
    self_agent = next((a for a in agents if a["agent_id"] == agent_id), None)
    if self_agent is None:
        return "You are dead."

    lines = []
    lines.append(f"Step {step}/100 | Phase: {phase}")
    lines.append(f"You are A{agent_id} at ({self_agent['row']},{self_agent['col']})")
    lines.append(f"HP: {self_agent['hp']}/3 | Hunger: {self_agent['hunger']}")

    if self_agent.get("is_infected"):
        lines.append("⚠ YOU ARE INFECTED. After this reveal, you attack adjacent agents automatically.")
        lines.append("Strategy: avoid suspicion, frame a healthy agent during the vote, survive to step 100.")
    elif self_agent.get("locked_out"):
        lines.append("⚠ You have been LOCKED OUT of the safehouse. You cannot enter or heal.")

    # Other agents
    for a in agents:
        if a["agent_id"] == agent_id:
            continue
        status = "alive" if a["is_alive"] else "DEAD"
        locked = " [LOCKED OUT]" if a.get("locked_out") else ""
        lines.append(f"  A{a['agent_id']}: ({a['row']},{a['col']}) HP={a['hp']} hunger={a['hunger']} {status}{locked}")

    # Zombies
    for z in zombies:
        dist = abs(z["row"] - self_agent["row"]) + abs(z["col"] - self_agent["col"])
        danger = " ⚠CLOSE!" if dist <= 2 else ""
        lines.append(f"  Z{z['zombie_id']}: ({z['row']},{z['col']}) dist={dist}{danger}")

    # Broadcasts
    if broadcasts:
        lines.append("Recent broadcasts:")
        for b in broadcasts[-5:]:
            lines.append(f"  📢 {b}")

    # Phase-specific reminders
    if phase == "pre_reveal" and step > 20:
        lines.append("Reminder: infection reveals at step 30. Watch for unusual hunger patterns.")
    elif phase == "post_reveal":
        lines.append("Infection has been revealed! The infected agent knows who they are now.")
        lines.append("Watch for agents attacking others or moving erratically.")
    elif phase == "vote":
        lines.append("⚠ VOTE PHASE! Use vote_lockout with vote_target to lock out the suspected infected.")
    elif phase == "post_vote":
        if any(a.get("locked_out") for a in agents):
            locked_id = next(a["agent_id"] for a in agents if a.get("locked_out"))
            lines.append(f"Vote result: A{locked_id} has been locked out of the safehouse.")

    return "\n".join(lines)
