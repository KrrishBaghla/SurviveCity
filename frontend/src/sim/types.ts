export type ActionType =
  | "move_up" | "move_down" | "move_left" | "move_right"
  | "eat" | "wait" | "vote_lockout" | "broadcast";

export interface Agent {
  id: number;
  row: number;
  col: number;
  hp: number;
  hunger: number;
  alive: boolean;
  infected: boolean;
  infectionRevealed: boolean;
  lockedOut: boolean;
  ate: boolean;
  damage: number;
  died: boolean;
  deathStep?: number;
  deathCause?: string;
}

export interface Zombie {
  id: number;
  row: number;
  col: number;
}

export interface Action {
  agentId: number;
  type: ActionType;
  voteTarget?: number;
  message?: string;
}

export interface Broadcast {
  step: number;
  agentId: number;
  text: string;
}

export type Phase = "pre_reveal" | "post_reveal" | "vote" | "post_vote" | "terminal";

export interface EpisodeState {
  step: number;
  maxSteps: number;
  agents: Agent[];
  zombies: Zombie[];
  infectedId: number;
  done: boolean;
  phase: Phase;
  votes: Record<number, number | undefined>;
  voteResolved: boolean;
  lockoutTarget?: number;
  broadcasts: Broadcast[];
  rngSeed: number;
  postmortems: string[];
  // Per-step pulses for animation triggers
  pulses: { kind: "attack" | "eat" | "death" | "vote"; row: number; col: number; step: number; agentId?: number }[];
}
