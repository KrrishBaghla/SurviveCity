import { advanceStep, advanceZombies, applyAgentAction, createEpisode } from "./engine";
import { createMemory, decide } from "./policy";
import { _record } from "./remoteEngine";
import { RNG } from "./rng";
import type { EpisodeState } from "./types";

export interface RunnerOptions {
  seed?: number;
  stepsPerSecond?: number;
  onTick?: (state: EpisodeState) => void;
  onEnd?: (state: EpisodeState) => void;
}

export class EpisodeRunner {
  state: EpisodeState;
  private mem = createMemory();
  private rng: RNG;
  private timer: ReturnType<typeof setInterval> | null = null;
  private opts: RunnerOptions;

  constructor(opts: RunnerOptions = {}) {
    this.opts = { stepsPerSecond: 4, ...opts };
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
    this.state = createEpisode(seed);
    this.rng = new RNG(seed);
  }

  reset(seed?: number) {
    this.stop();
    const s = seed ?? Math.floor(Math.random() * 1e9);
    this.state = createEpisode(s);
    this.mem = createMemory();
    this.rng = new RNG(s);
    this.opts.onTick?.(this.state);
  }

  start() {
    if (this.timer) return;
    const interval = 1000 / (this.opts.stepsPerSecond ?? 4);
    this.timer = setInterval(() => this.tick(), interval);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  setSpeed(stepsPerSecond: number) {
    this.opts.stepsPerSecond = stepsPerSecond;
    if (this.timer) { this.stop(); this.start(); }
  }

  // One full step = each living agent acts once + zombies advance + step++
  tick() {
    if (this.state.done) {
      this.stop();
      this.opts.onEnd?.(this.state);
      return;
    }

    // Clear pulses each macro tick
    this.state.pulses = [];

    const t0 = performance.now();
    const startStep = this.state.step;
    const acts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const a = this.state.agents[i];
      if (!a.alive) { acts.push(`A${i}.dead`); continue; }
      const action = decide(this.state, i, this.mem, this.rng);
      applyAgentAction(this.state, action);
      acts.push(`A${i}.${action.type}`);
    }
    advanceZombies(this.state);
    advanceStep(this.state);
    const ms = Math.round(performance.now() - t0);
    // Parallel log to the remote engine's [hf:tick] so a viewer can compare
    // local vs remote outputs side-by-side. No network calls happen here, so
    // the latency is sub-millisecond — useful as a control.
    const ts = new Date().toISOString().slice(11, 23);
    // eslint-disable-next-line no-console
    console.log(
      `%c[local:tick]%c %s step %d → %d  [%s]  (%dms)`,
      "color:#22d3ee;font-weight:600;", "color:#94a3b8;",
      ts, startStep, this.state.step, acts.join(", "), ms,
    );
    _record({
      ts, kind: "local-tick", source: "local",
      step: this.state.step, latencyMs: ms,
      res: { from: startStep, to: this.state.step, actions: acts },
      summary: `tick step ${startStep} → ${this.state.step}  [${acts.join(", ")}]  (${ms}ms)`,
    });
    this.opts.onTick?.(this.state);
  }
}
