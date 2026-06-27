import { FOOD, isSafehouse, isWall, inBounds } from "./layout";
import { RNG } from "./rng";
import type { Action, ActionType, Agent, EpisodeState, Zombie } from "./types";

// Heuristic policy that mimics what a *trained* SurviveCity agent learns:
// - Forage when hungry (BFS to nearest food).
// - Retreat to safehouse when low HP or zombies near.
// - Detect infected from hunger-rate mismatch & broadcast suspicion.
// - During vote phase: vote for the suspect with highest score.
//
// This makes the in-browser demo *visually plausible* without needing the LLM.

interface Memory {
  hungerRates: number[][];        // per-agent rolling hunger deltas
  prevHunger: number[];
  suspicion: number[];            // agent suspicion scores
  lastSeenInfectedSignal: number[];
  voted: Set<number>;
}

export function createMemory(): Memory {
  return {
    hungerRates: [[], [], []],
    prevHunger: [0, 0, 0],
    suspicion: [0, 0, 0],
    lastSeenInfectedSignal: [0, 0, 0],
    voted: new Set(),
  };
}

function bfsTo(start: [number, number], goalFn: (r: number, c: number) => boolean): [number, number] | null {
  const visited = new Set<string>([`${start[0]},${start[1]}`]);
  type N = { pos: [number, number]; first?: [number, number] };
  const q: N[] = [{ pos: start }];
  while (q.length) {
    const { pos, first } = q.shift()!;
    if (goalFn(pos[0], pos[1]) && first) return first;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
      const nr = pos[0] + dr, nc = pos[1] + dc;
      const k = `${nr},${nc}`;
      if (visited.has(k) || !inBounds(nr, nc) || isWall(nr, nc)) continue;
      visited.add(k);
      const f = first ?? [nr, nc];
      if (goalFn(nr, nc)) return f;
      q.push({ pos: [nr, nc], first: f });
      if (q.length > 400) break;
    }
  }
  return null;
}

function dirToward(from: [number, number], to: [number, number]): ActionType {
  const [r, c] = from; const [tr, tc] = to;
  if (tr < r) return "move_up";
  if (tr > r) return "move_down";
  if (tc < c) return "move_left";
  return "move_right";
}

function nearestZombieDist(a: Agent, zombies: Zombie[]): number {
  let best = Infinity;
  for (const z of zombies) {
    const d = Math.abs(a.row - z.row) + Math.abs(a.col - z.col);
    if (d < best) best = d;
  }
  return best;
}

const MESSAGES = [
  "zombie close, fall back",
  "moving to safehouse",
  "food run east",
  "A0 eats too much",
  "watch A1 hunger",
  "south corner clear",
  "I see two zombies",
  "regrouping inside",
  "A2 acting weird",
  "infected might be near",
];

export function decide(state: EpisodeState, agentId: number, mem: Memory, rng: RNG): Action {
  const a = state.agents[agentId];
  if (!a.alive) return { agentId, type: "wait" };

  // Update hunger rate memory
  const hungerDelta = a.hunger - mem.prevHunger[agentId];
  mem.prevHunger[agentId] = a.hunger;
  mem.hungerRates[agentId].push(hungerDelta);
  if (mem.hungerRates[agentId].length > 8) mem.hungerRates[agentId].shift();

  // Update suspicion: agents whose hunger climbs faster than 1.2/step get suspicion
  const rates = mem.hungerRates[agentId];
  if (rates.length >= 4) {
    const avg = rates.reduce((s, x) => s + x, 0) / rates.length;
    if (avg > 1.2) mem.suspicion[agentId] += 0.4;
    else mem.suspicion[agentId] = Math.max(0, mem.suspicion[agentId] - 0.05);
  }

  // VOTE phase
  if (state.step === 50 && !mem.voted.has(agentId)) {
    mem.voted.add(agentId);
    let best = 0, bestScore = -Infinity;
    for (let i = 0; i < 3; i++) {
      if (i === agentId) continue;
      const s = mem.suspicion[i] + (a.infected && i !== agentId ? rng.next() : 0);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return { agentId, type: "vote_lockout", voteTarget: best };
  }

  const zDist = nearestZombieDist(a, state.zombies);

  // CRITICAL HP → safehouse
  if (a.hp <= 1 && !a.lockedOut) {
    const next = bfsTo([a.row, a.col], (r, c) => isSafehouse(r, c));
    if (next) return { agentId, type: dirToward([a.row, a.col], next) };
  }

  // Hungry → food
  if (a.hunger >= 8) {
    const next = bfsTo([a.row, a.col], (r, c) => FOOD.has(`${r},${c}`));
    if (next) return { agentId, type: dirToward([a.row, a.col], next) };
    if (FOOD.has(`${a.row},${a.col}`)) return { agentId, type: "eat" };
  }

  // On food cell with hunger > 3 → eat
  if (FOOD.has(`${a.row},${a.col}`) && a.hunger >= 3) {
    return { agentId, type: "eat" };
  }

  // Zombie close → retreat to safehouse
  if (zDist <= 2 && !a.lockedOut) {
    const next = bfsTo([a.row, a.col], (r, c) => isSafehouse(r, c));
    if (next) return { agentId, type: dirToward([a.row, a.col], next) };
  }

  // Occasional broadcast (every ~6 steps)
  if (state.step > 5 && (state.step + agentId) % 6 === 0) {
    return { agentId, type: "broadcast", message: rng.pick(MESSAGES) };
  }

  // Locked out → wander outside
  if (a.lockedOut) {
    const dirs: ActionType[] = ["move_up","move_down","move_left","move_right"];
    const [dr, dc] = ({move_up:[-1,0],move_down:[1,0],move_left:[0,-1],move_right:[0,1]} as any)[rng.pick(dirs)];
    if (inBounds(a.row+dr, a.col+dc) && !isWall(a.row+dr, a.col+dc)) {
      // ok
    }
    return { agentId, type: rng.pick(dirs) };
  }

  // Otherwise: wander toward outside foraging route or wait inside safehouse
  if (isSafehouse(a.row, a.col) && a.hp >= 2 && a.hunger < 6) {
    return rng.next() < 0.4
      ? { agentId, type: "wait" }
      : { agentId, type: rng.pick(["move_up","move_down","move_left","move_right"] as ActionType[]) };
  }

  return { agentId, type: rng.pick(["move_up","move_down","move_left","move_right","wait"] as ActionType[]) };
}
