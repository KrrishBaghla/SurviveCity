// Remote engine: drives a hosted OpenEnv-compliant SurviveCity v1 server
// (Hugging Face Space) instead of the in-browser TS engine.
//
// The Space at https://noanya-zombiee.hf.space exposes /health, /reset,
// /step, /state via FastAPI. Each /step takes ONE agent's action; the env
// internally cycles current_agent_id and bumps step_count after all three
// agents have acted. We replicate the local "macro tick" (3 agents act +
// zombies + step++) by looping /step calls until step_count advances.
//
// The action source is the same heuristic decide() used by the local runner,
// so the comparison between modes isolates "where does the env run" rather
// than introducing a different policy. Swapping in real LLM decisions can
// happen later without touching this file.
//
// Logging: every /reset and /step is logged to the browser console with a
// `[hf:...]` prefix and a short request/response/latency summary. These lines
// are designed to line up 1:1 with the FastAPI access log on the Space side
// (visible in the HF "Logs" tab), so a viewer can watch both consoles and
// confirm the calls are real. Drop window.__zombiee_log into the JS console
// to dump every captured event as a JSON array.

import { createMemory, decide } from "./policy";
import { RNG } from "./rng";
import type { Broadcast, EpisodeState, Phase } from "./types";

export const HF_SPACE_URL = "https://noanya-zombiee.hf.space";

// Registry of deployed Hugging Face Space endpoints the frontend can target.
// The BackendPicker iterates over this; useEpisode passes the chosen URL into
// RemoteEpisodeRunner via the `endpoint` option. Add new Spaces here.
export const HF_SPACE_ENDPOINTS = {
  "zombiee": {
    label: "zombiee",
    url: "https://noanya-zombiee.hf.space",
    desc: "OpenEnv API · v1",
    logsUrl: "https://huggingface.co/spaces/noanya/zombiee/logs/container",
  },
  "zombiee-v1-extended": {
    label: "zombiee-v1-extended",
    url: "https://noanya-zombiee-v1-extended.hf.space",
    desc: "API + browser runner · v1",
    logsUrl: "https://huggingface.co/spaces/noanya/zombiee-v1-extended/logs/container",
  },
} as const;

export type SpaceKey = keyof typeof HF_SPACE_ENDPOINTS;

// Per-tab unique session id so the frontend log can be matched against the
// Space's request log (we send X-Zombiee-Session as a request header).
const SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// In-memory ring buffer of every captured event. Exposed via window.__zombiee_log
// for inspection / "save log" functionality from the browser console.
//
// Also exposes a pub/sub via subscribeLog() so the visible LogsPanel can render
// events in real time as they happen (instead of judges having to open DevTools).
export type LogEventKind = "health" | "reset" | "step" | "tick" | "error" | "init" | "local-tick";
export type LogEvent = {
  ts: string;
  kind: LogEventKind;
  source: "hf" | "local";
  endpoint?: string;
  method?: string;
  path?: string;
  req?: unknown;
  res?: unknown;
  latencyMs?: number;
  step?: number;
  currentAgent?: number;
  reward?: number;
  done?: boolean;
  error?: string;
  // Pretty one-line summary used by the in-page log panel.
  summary?: string;
};
const _LOG_BUFFER: LogEvent[] = [];
const _LOG_MAX = 500;
type LogListener = (ev: LogEvent) => void;
const _LISTENERS: Set<LogListener> = new Set();

export function _record(ev: LogEvent) {
  _LOG_BUFFER.push(ev);
  if (_LOG_BUFFER.length > _LOG_MAX) _LOG_BUFFER.shift();
  for (const fn of _LISTENERS) {
    try { fn(ev); } catch { /* listener crashed; ignore */ }
  }
}

export function subscribeLog(fn: LogListener): () => void {
  _LISTENERS.add(fn);
  return () => _LISTENERS.delete(fn);
}

export function getLogBuffer(): readonly LogEvent[] {
  return _LOG_BUFFER;
}

export function clearLogBuffer() {
  _LOG_BUFFER.length = 0;
  for (const fn of _LISTENERS) {
    try { fn({ ts: _hms(), kind: "init", source: "hf", summary: "log cleared" }); } catch { /* */ }
  }
}

if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__zombiee_log = _LOG_BUFFER;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__zombiee_session = SESSION_ID;
}

export { SESSION_ID };

const _CSS_REMOTE = "color:#a78bfa;font-weight:600;"; // neon-violet
const _CSS_OK     = "color:#84cc16;";                  // neon-lime
const _CSS_ERR    = "color:#fb7185;";                  // neon-rose
const _CSS_DIM    = "color:#94a3b8;";                  // ink-2

function _hms(d: Date = new Date()): string {
  return d.toISOString().slice(11, 23); // HH:MM:SS.mmm in UTC
}

export interface RemoteRunnerOptions {
  seed?: number;
  stepsPerSecond?: number;
  endpoint?: string;
  onTick?: (state: EpisodeState) => void;
  onEnd?: (state: EpisodeState) => void;
  onError?: (err: Error) => void;
}

export class RemoteEpisodeRunner {
  state: EpisodeState;
  endpoint: string;
  private mem = createMemory();
  private rng: RNG;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private opts: RemoteRunnerOptions;
  private busy = false;
  private ready = false;
  private currentAgentId = 0;

  constructor(opts: RemoteRunnerOptions = {}) {
    this.opts = { stepsPerSecond: 4, ...opts };
    this.endpoint = opts.endpoint ?? HF_SPACE_URL;
    const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
    this.rng = new RNG(seed);
    this.state = makeEmptyState(seed);
    console.log(
      `%c[hf:init]%c session=%s endpoint=%s seed=%d`,
      _CSS_REMOTE, _CSS_DIM, SESSION_ID, this.endpoint, seed,
    );
    _record({
      ts: _hms(), kind: "init", source: "hf",
      endpoint: this.endpoint,
      summary: `init session=${SESSION_ID.slice(0, 12)} seed=${seed}`,
    });
    // Kick off the initial reset; the timer in start() respects this.busy.
    void this.reset(seed);
  }

  async reset(seed?: number): Promise<void> {
    this.stop();
    const s = seed ?? Math.floor(Math.random() * 1e9);
    this.mem = createMemory();
    this.rng = new RNG(s);
    this.currentAgentId = 0;
    this.ready = false;
    this.state = makeEmptyState(s);
    this.opts.onTick?.(this.state);
    const t0 = performance.now();
    const ts = _hms();
    try {
      const res = await fetch(`${this.endpoint}/reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Zombiee-Session": SESSION_ID,
        },
        body: JSON.stringify({ seed: s }),
      });
      const latencyMs = Math.round(performance.now() - t0);
      if (!res.ok) throw new Error(`reset HTTP ${res.status}`);
      const json = await res.json();
      this.state = translate(json, []);
      this.currentAgentId = json?.metadata?.current_agent_id ?? 0;
      this.ready = true;
      this.opts.onTick?.(this.state);
      const summary = {
        step: json?.step_count,
        agents: (json?.agents ?? []).length,
        zombies: (json?.zombies ?? []).length,
        infected_id: json?.metadata?.infected_id,
        phase: json?.metadata?.phase,
        current_agent_id: json?.metadata?.current_agent_id,
      };
      console.log(
        `%c[hf:reset]%c %s POST %s/reset %c{seed:%d}%c → %o %c(%dms)`,
        _CSS_REMOTE, _CSS_DIM, ts, this.endpoint,
        _CSS_OK, s, "color:inherit;",
        summary,
        _CSS_DIM, latencyMs,
      );
      _record({
        ts, kind: "reset", source: "hf",
        endpoint: this.endpoint, method: "POST", path: "/reset",
        req: { seed: s }, res: summary, latencyMs,
        summary: `POST /reset {seed:${s}} → step=${summary.step} infected=A${summary.infected_id} (${latencyMs}ms)`,
      });
    } catch (e) {
      const latencyMs = Math.round(performance.now() - t0);
      const err = asError(e);
      console.log(
        `%c[hf:error]%c %s POST %s/reset → %s %c(%dms)`,
        _CSS_ERR, _CSS_DIM, ts, this.endpoint, err.message, _CSS_DIM, latencyMs,
      );
      _record({
        ts, kind: "error", source: "hf",
        path: "/reset", error: err.message, latencyMs,
        summary: `POST /reset FAILED: ${err.message} (${latencyMs}ms)`,
      });
      this.opts.onError?.(err);
    }
  }

  start() {
    if (this.timer) return;
    const interval = 1000 / (this.opts.stepsPerSecond ?? 4);
    const loop = async () => {
      if (this.busy) {
        if (this.timer !== null) this.timer = setTimeout(loop, interval);
        return;
      }
      this.busy = true;
      try {
        await this.tick();
      } finally {
        this.busy = false;
      }
      if (this.timer !== null) this.timer = setTimeout(loop, interval);
    };
    this.timer = setTimeout(loop, interval);
  }

  stop() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  setSpeed(stepsPerSecond: number) {
    this.opts.stepsPerSecond = stepsPerSecond;
    if (this.timer) { this.stop(); this.start(); }
  }

  async tick(): Promise<void> {
    // Skip until /reset has landed; the timer will retry on the next interval.
    if (!this.ready) return;
    if (this.state.done) {
      this.stop();
      this.opts.onEnd?.(this.state);
      return;
    }
    const startStep = this.state.step;
    const tickT0 = performance.now();
    let stepCalls = 0;
    // Loop /step until step_count advances (one macro round = ~3 /step calls).
    // Safety cap at 6 in case the env doesn't advance for some reason.
    for (let safety = 0; safety < 6; safety++) {
      const aid = this.currentAgentId % this.state.agents.length;
      const agent = this.state.agents[aid];
      if (!agent || !agent.alive) {
        this.currentAgentId = (aid + 1) % this.state.agents.length;
        if (this.state.agents.every(a => !a.alive)) break;
        continue;
      }
      const action = decide(this.state, aid, this.mem, this.rng);
      const reqBody = {
        agent_id: action.agentId,
        action_type: action.type,
        vote_target: action.voteTarget,
        message: action.message,
      };
      const t0 = performance.now();
      const ts = _hms();
      try {
        const res = await fetch(`${this.endpoint}/step`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Zombiee-Session": SESSION_ID,
          },
          body: JSON.stringify(reqBody),
        });
        const latencyMs = Math.round(performance.now() - t0);
        stepCalls++;
        if (!res.ok) throw new Error(`step HTTP ${res.status}`);
        const json = await res.json();
        this.state = translate(json, []);
        this.currentAgentId =
          json?.metadata?.current_agent_id ?? (aid + 1) % this.state.agents.length;
        // Fire onTick AFTER EACH /step (not just end-of-macro-tick) so the
        // grid animates per-agent. Without this, three /step calls stack into
        // one render after ~750ms — looks like the visual is "frozen" or
        // "hardcoded" because spring transitions stack and jump.
        this.opts.onTick?.(this.state);
        const actLabel = action.type +
          (action.voteTarget !== undefined ? `→A${action.voteTarget}` : "") +
          (action.message ? `:${action.message.slice(0, 16)}` : "");
        // Position summary: A0(r,c) A1(r,c) A2(r,c) — proves agent positions
        // returned by the Space match what the env actually moved them to.
        const posStr = (json?.agents ?? [])
          .map((a: any) => `A${a.agent_id}(${a.row},${a.col})${a.is_alive ? "" : "✗"}`)
          .join(" ");
        console.log(
          `%c[hf:step]%c %s POST /step %cA%d.%s%c → step=%d cur=A%d reward=%s done=%s | %s %c(%dms)`,
          _CSS_REMOTE, _CSS_DIM, ts,
          _CSS_OK, action.agentId, actLabel, "color:inherit;",
          json?.step_count, this.currentAgentId,
          (json?.reward ?? 0).toFixed(3), String(json?.done),
          posStr,
          _CSS_DIM, latencyMs,
        );
        _record({
          ts, kind: "step", source: "hf",
          endpoint: this.endpoint, method: "POST", path: "/step",
          req: reqBody,
          res: {
            step_count: json?.step_count,
            current_agent_id: this.currentAgentId,
            reward: json?.reward,
            done: json?.done,
            phase: json?.metadata?.phase,
            agents: (json?.agents ?? []).map((a: any) => ({
              id: a.agent_id, row: a.row, col: a.col, hp: a.hp, alive: a.is_alive,
            })),
          },
          latencyMs,
          step: json?.step_count, currentAgent: this.currentAgentId,
          reward: json?.reward, done: json?.done,
          // mirrors HF env log line: `step=N agent=AX action=Y reward=Z done=B`
          summary: `step=${json?.step_count} agent=A${action.agentId} action=${action.type} reward=${(json?.reward ?? 0).toFixed(3)} done=${json?.done} (${latencyMs}ms)`,
        });
        if (this.state.done) break;
        if (this.state.step !== startStep) break; // round complete
      } catch (e) {
        const latencyMs = Math.round(performance.now() - t0);
        const err = asError(e);
        console.log(
          `%c[hf:error]%c %s POST /step %o → %s %c(%dms)`,
          _CSS_ERR, _CSS_DIM, ts, reqBody, err.message, _CSS_DIM, latencyMs,
        );
        _record({
          ts, kind: "error", source: "hf",
          path: "/step", req: reqBody, error: err.message, latencyMs,
          summary: `POST /step A${action.agentId}.${action.type} FAILED: ${err.message} (${latencyMs}ms)`,
        });
        this.opts.onError?.(err);
        return;
      }
    }
    const tickMs = Math.round(performance.now() - tickT0);
    console.log(
      `%c[hf:tick]%c step %d → %d (%d /step calls, %dms)`,
      _CSS_REMOTE, _CSS_DIM, startStep, this.state.step, stepCalls, tickMs,
    );
    _record({
      ts: _hms(), kind: "tick", source: "hf",
      step: this.state.step, latencyMs: tickMs,
      res: { from: startStep, to: this.state.step, calls: stepCalls },
      summary: `tick step ${startStep} → ${this.state.step} (${stepCalls} /step calls, ${tickMs}ms)`,
    });
    this.opts.onTick?.(this.state);
  }
}

export async function checkSpaceHealth(
  endpoint = HF_SPACE_URL,
  timeoutMs = 4000,
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const t0 = performance.now();
  const ts = _hms();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${endpoint}/health`, {
      method: "GET", signal: ctl.signal,
      headers: { "X-Zombiee-Session": SESSION_ID },
    });
    const latencyMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      const err = `HTTP ${res.status}`;
      console.log(`%c[hf:health]%c %s GET /health → %s %c(%dms)`,
        _CSS_ERR, _CSS_DIM, ts, err, _CSS_DIM, latencyMs);
      _record({
        ts, kind: "health", source: "hf",
        path: "/health", error: err, latencyMs,
        summary: `GET /health FAILED: ${err} (${latencyMs}ms)`,
      });
      return { ok: false, latencyMs, error: err };
    }
    const json = await res.json().catch(() => ({}));
    const ok = json?.status === "healthy";
    console.log(
      `%c[hf:health]%c %s GET /health → %o %c(%dms)`,
      ok ? _CSS_REMOTE : _CSS_ERR, _CSS_DIM, ts, json, _CSS_DIM, latencyMs,
    );
    _record({
      ts, kind: "health", source: "hf",
      path: "/health", res: json, latencyMs,
      summary: `GET /health → ${json?.status ?? "?"} (${latencyMs}ms)`,
    });
    return { ok, latencyMs };
  } catch (e) {
    const latencyMs = Math.round(performance.now() - t0);
    const err = asError(e).message;
    console.log(`%c[hf:health]%c %s GET /health → %s %c(%dms)`,
      _CSS_ERR, _CSS_DIM, ts, err, _CSS_DIM, latencyMs);
    _record({
      ts, kind: "health", source: "hf",
      path: "/health", error: err, latencyMs,
      summary: `GET /health FAILED: ${err} (${latencyMs}ms)`,
    });
    return { ok: false, error: err };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// HF Space JSON -> frontend EpisodeState. Field renames are the bulk of it;
// `broadcasts` arrives as preformatted strings ("A0: text") so we split on
// the prefix to recover {agentId, text}.
// ---------------------------------------------------------------------------

const VALID_PHASES = new Set<Phase>([
  "pre_reveal", "post_reveal", "vote", "post_vote", "terminal",
]);

function translate(hf: any, prevPulses: EpisodeState["pulses"] = []): EpisodeState {
  const md = hf?.metadata ?? {};
  const phaseStr = (md.phase as string) ?? "pre_reveal";
  const phase: Phase = VALID_PHASES.has(phaseStr as Phase) ? (phaseStr as Phase) : "pre_reveal";
  const broadcastList: string[] = Array.isArray(hf?.broadcasts) ? hf.broadcasts : [];
  const broadcasts: Broadcast[] = broadcastList.map((s) => {
    const m = /^A(\d+):\s*(.*)$/.exec(s);
    return {
      step: hf?.step_count ?? 0,
      agentId: m ? Number(m[1]) : 0,
      text: m ? m[2] : s,
    };
  });
  return {
    step: hf?.step_count ?? 0,
    maxSteps: hf?.max_steps ?? 100,
    agents: (hf?.agents ?? []).map((a: any) => ({
      id: a.agent_id,
      row: a.row,
      col: a.col,
      hp: a.hp,
      hunger: a.hunger,
      alive: !!a.is_alive,
      infected: !!a.is_infected,
      // v1 env reveals infected role at step 30 (= post_reveal+).
      infectionRevealed: !!a.is_infected && phase !== "pre_reveal",
      lockedOut: !!a.locked_out,
      ate: !!a.ate_this_step,
      damage: a.damage_this_step ?? 0,
      died: !!a.died_this_step,
    })),
    zombies: (hf?.zombies ?? []).map((z: any) => ({
      id: z.zombie_id,
      row: z.row,
      col: z.col,
    })),
    infectedId: md.infected_id ?? -1,
    done: !!hf?.done,
    phase,
    votes: {},
    voteResolved: !!md.vote_resolved,
    lockoutTarget: md.lockout_target,
    broadcasts,
    rngSeed: 0,
    postmortems: Array.isArray(md.postmortems) ? md.postmortems : [],
    pulses: prevPulses,
  };
}

// Initial placeholder so the UI has something to render before /reset returns.
// Mirrors v1's deterministic starting layout (3 agents in the safehouse,
// 3 zombies at the corners) so there's no visual jump when reset lands.
function makeEmptyState(seed: number): EpisodeState {
  return {
    step: 0,
    maxSteps: 100,
    agents: [
      mkAgent(0, 4, 4),
      mkAgent(1, 4, 5),
      mkAgent(2, 5, 4),
    ],
    zombies: [
      { id: 0, row: 0, col: 0 },
      { id: 1, row: 0, col: 9 },
      { id: 2, row: 9, col: 0 },
    ],
    infectedId: -1,
    done: false,
    phase: "pre_reveal",
    votes: {},
    voteResolved: false,
    broadcasts: [],
    rngSeed: seed,
    postmortems: [],
    pulses: [],
  };
}

function mkAgent(id: number, row: number, col: number) {
  return {
    id, row, col, hp: 3, hunger: 0,
    alive: true, infected: false, infectionRevealed: false,
    lockedOut: false, ate: false, damage: 0, died: false,
  };
}

function asError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}
