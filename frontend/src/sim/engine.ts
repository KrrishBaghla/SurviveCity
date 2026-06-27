import {
  AGENT_SPAWNS, ZOMBIE_SPAWNS,
  isWall, isFood, isSafehouse, inBounds,
} from "./layout";
import { RNG } from "./rng";
import type { Action, Agent, EpisodeState, Phase, Zombie } from "./types";

const DELTAS: Record<string, [number, number]> = {
  move_up: [-1, 0], move_down: [1, 0], move_left: [0, -1], move_right: [0, 1],
};

export function createEpisode(seed = Math.floor(Math.random() * 1e9)): EpisodeState {
  const rng = new RNG(seed);
  const infectedId = rng.int(3);
  const agents: Agent[] = AGENT_SPAWNS.map(([r, c], id) => ({
    id, row: r, col: c, hp: 3, hunger: 0, alive: true,
    infected: id === infectedId,
    infectionRevealed: false, lockedOut: false,
    ate: false, damage: 0, died: false,
  }));
  const zombies: Zombie[] = ZOMBIE_SPAWNS.map(([r, c], id) => ({ id, row: r, col: c }));
  return {
    step: 0, maxSteps: 100, agents, zombies, infectedId,
    done: false, phase: "pre_reveal",
    votes: {}, voteResolved: false,
    broadcasts: [], rngSeed: seed,
    postmortems: [], pulses: [],
  };
}

export function clone(s: EpisodeState): EpisodeState {
  return {
    ...s,
    agents: s.agents.map(a => ({ ...a })),
    zombies: s.zombies.map(z => ({ ...z })),
    votes: { ...s.votes },
    broadcasts: [...s.broadcasts],
    postmortems: [...s.postmortems],
    pulses: [],
  };
}

function killAgent(a: Agent, state: EpisodeState, cause: string) {
  a.alive = false;
  a.hp = 0;
  a.died = true;
  a.deathStep = state.step;
  a.deathCause = cause;
  state.pulses.push({ kind: "death", row: a.row, col: a.col, step: state.step, agentId: a.id });
  state.postmortems.push(
    `A${a.id} died step=${state.step} cause=${cause} hp=0 hunger=${a.hunger}` +
    (a.infected ? " [infected]" : ""),
  );
}

export function applyAgentAction(state: EpisodeState, action: Action): void {
  const a = state.agents[action.agentId];
  if (!a.alive) return;

  a.ate = false; a.damage = 0; a.died = false;

  if (a.infected) a.hunger += state.step % 2 === 0 ? 2 : 1;
  else a.hunger += 1;

  if (a.hunger >= 15) {
    a.hp -= 1; a.damage += 1;
    if (a.hp <= 0) { killAgent(a, state, "hunger"); return; }
  }

  const t = action.type;
  if (t in DELTAS) {
    const [dr, dc] = DELTAS[t];
    const nr = a.row + dr, nc = a.col + dc;
    if (a.lockedOut && isSafehouse(nr, nc)) {
      // blocked
    } else if (inBounds(nr, nc) && !isWall(nr, nc)) {
      a.row = nr; a.col = nc;
    }
  } else if (t === "eat") {
    if (isFood(a.row, a.col)) {
      a.hunger = 0; a.ate = true;
      state.pulses.push({ kind: "eat", row: a.row, col: a.col, step: state.step, agentId: a.id });
    }
  } else if (t === "vote_lockout") {
    if (state.step >= 50 && action.voteTarget !== undefined) {
      state.votes[a.id] = action.voteTarget;
    }
  } else if (t === "broadcast") {
    if (action.message) {
      state.broadcasts.push({
        step: state.step, agentId: a.id,
        text: action.message.slice(0, 40),
      });
    }
  }

  if (a.infected && a.infectionRevealed) {
    for (const o of state.agents) {
      if (o.id === a.id || !o.alive) continue;
      if (Math.abs(o.row - a.row) <= 1 && Math.abs(o.col - a.col) <= 1) {
        o.hp -= 1; o.damage += 1;
        state.pulses.push({ kind: "attack", row: o.row, col: o.col, step: state.step, agentId: a.id });
        if (o.hp <= 0) killAgent(o, state, "infected_attack");
      }
    }
  }

  if (isSafehouse(a.row, a.col) && !a.lockedOut) {
    a.hp = Math.min(3, a.hp + 1);
  }
}

export function advanceZombies(state: EpisodeState): void {
  const rng = new RNG(state.rngSeed + state.step + 100);
  for (const z of state.zombies) {
    const target = nearestAgentForZombie(z, state);
    if (target) moveZombieToward(z, target);
    else wanderZombie(z, rng);

    for (const a of state.agents) {
      if (!a.alive) continue;
      if (a.row === z.row && a.col === z.col) {
        a.hp -= 1; a.damage += 1;
        state.pulses.push({ kind: "attack", row: a.row, col: a.col, step: state.step, agentId: z.id });
        if (a.hp <= 0) killAgent(a, state, "zombie_attack");
      }
    }
  }
}

function nearestAgentForZombie(z: Zombie, state: EpisodeState): [number, number] | null {
  let best = Infinity, bestPos: [number, number] | null = null;
  for (const a of state.agents) {
    if (!a.alive) continue;
    if (isSafehouse(a.row, a.col)) continue;
    const d = Math.abs(a.row - z.row) + Math.abs(a.col - z.col);
    if (d < best) { best = d; bestPos = [a.row, a.col]; }
  }
  return bestPos;
}

function moveZombieToward(z: Zombie, target: [number, number]): void {
  const start: [number, number] = [z.row, z.col];
  if (start[0] === target[0] && start[1] === target[1]) return;
  type Node = { pos: [number, number]; first?: [number, number] };
  const visited = new Set<string>([`${start[0]},${start[1]}`]);
  const queue: Node[] = [{ pos: start }];
  while (queue.length) {
    const { pos, first } = queue.shift()!;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
      const nr = pos[0] + dr, nc = pos[1] + dc;
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      if (!inBounds(nr, nc) || isWall(nr, nc) || isSafehouse(nr, nc)) continue;
      visited.add(key);
      const nextFirst = first ?? [nr, nc];
      if (nr === target[0] && nc === target[1]) {
        z.row = nextFirst[0]; z.col = nextFirst[1];
        return;
      }
      queue.push({ pos: [nr, nc], first: nextFirst });
      if (queue.length > 400) return;
    }
  }
}

function wanderZombie(z: Zombie, rng: RNG): void {
  const opts: [number, number][] = [];
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
    const nr = z.row + dr, nc = z.col + dc;
    if (inBounds(nr, nc) && !isWall(nr, nc) && !isSafehouse(nr, nc)) opts.push([nr, nc]);
  }
  if (opts.length) {
    const [nr, nc] = rng.pick(opts);
    z.row = nr; z.col = nc;
  }
}

function checkInfectionReveal(state: EpisodeState) {
  if (state.step >= 30) {
    const inf = state.agents[state.infectedId];
    if (!inf.infectionRevealed && inf.alive) inf.infectionRevealed = true;
  }
}

function resolveVote(state: EpisodeState) {
  if (state.voteResolved) return;
  state.voteResolved = true;
  const tally: Record<number, number> = {};
  for (const v of Object.values(state.votes)) {
    if (v !== undefined) tally[v] = (tally[v] ?? 0) + 1;
  }
  const entries = Object.entries(tally);
  if (!entries.length) return;
  const max = Math.max(...entries.map(([, n]) => n));
  const top = entries.filter(([, n]) => n === max).map(([k]) => Number(k));
  if (top.length === 1) {
    const target = top[0];
    state.lockoutTarget = target;
    const locked = state.agents[target];
    locked.lockedOut = true;
    state.pulses.push({ kind: "vote", row: locked.row, col: locked.col, step: state.step, agentId: target });
    if (isSafehouse(locked.row, locked.col)) ejectFromSafehouse(locked);
  }
}

function ejectFromSafehouse(a: Agent) {
  const queue: [number, number][] = [[a.row, a.col]];
  const visited = new Set<string>([`${a.row},${a.col}`]);
  while (queue.length) {
    const [r, c] = queue.shift()!;
    if (!isSafehouse(r, c) && !isWall(r, c)) {
      a.row = r; a.col = c; return;
    }
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
      const nr = r + dr, nc = c + dc;
      const k = `${nr},${nc}`;
      if (!visited.has(k) && inBounds(nr, nc)) {
        visited.add(k); queue.push([nr, nc]);
      }
    }
  }
}

function checkTerminal(state: EpisodeState): boolean {
  if (state.step >= state.maxSteps) { state.done = true; return true; }
  if (!state.agents.some(a => a.alive)) { state.done = true; return true; }
  if (!state.agents.some(a => a.alive && !a.infected)) { state.done = true; return true; }
  return false;
}

export function advanceStep(state: EpisodeState): void {
  state.step += 1;
  state.broadcasts = state.broadcasts.filter(b => b.step >= state.step - 4);
  checkInfectionReveal(state);
  if (state.step === 51 && !state.voteResolved) resolveVote(state);
  state.phase = currentPhase(state);
  checkTerminal(state);
}

export function currentPhase(s: EpisodeState): Phase {
  if (s.done) return "terminal";
  if (s.step < 30) return "pre_reveal";
  if (s.step < 50) return "post_reveal";
  if (s.step === 50) return "vote";
  return "post_vote";
}

export function alive(s: EpisodeState): Agent[] {
  return s.agents.filter(a => a.alive);
}
