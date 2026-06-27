import { useEffect, useState } from "react";
import { Grid } from "../components/Grid";
import { AgentRoster, BroadcastFeed, PhaseBar, PostmortemFeed } from "../components/Hud";
import { Icon } from "../components/Icon";
import { LogsPanel } from "../components/LogsPanel";
import { useEpisode, type EpisodeMode } from "../hooks/useEpisode";
import { HF_SPACE_ENDPOINTS, checkSpaceHealth, type SpaceKey } from "../sim/remoteEngine";

// "local" + every key in HF_SPACE_ENDPOINTS = the picker buttons.
type BackendKey = "local" | SpaceKey;

function modeFromKey(k: BackendKey): EpisodeMode {
  return k === "local" ? "local" : "remote";
}

export default function Play() {
  const [backend, setBackend] = useState<BackendKey>("local");
  const mode = modeFromKey(backend);
  const spaceKey: SpaceKey | undefined = backend === "local" ? undefined : backend;
  const ep = useEpisode({
    seed: 42, speed: 4, autoStart: true, loopOnEnd: false,
    mode,
    spaceKey,
  });
  const [fog, setFog] = useState(true);
  const [speed, setSpeed] = useState(4);
  const [seedInput, setSeedInput] = useState("42");

  // Per-Space health probe. Re-runs when the user picks a different Space.
  const [spaceHealth, setSpaceHealth] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null);
  useEffect(() => {
    if (!spaceKey) { setSpaceHealth(null); return; }
    let cancelled = false;
    const url = HF_SPACE_ENDPOINTS[spaceKey].url;
    const ping = async () => {
      const r = await checkSpaceHealth(url);
      if (!cancelled) setSpaceHealth(r);
    };
    void ping();
    const id = setInterval(ping, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [spaceKey]);

  const handleSpeed = (s: number) => { setSpeed(s); ep.setSpeed(s); };
  const handleReset = () => {
    const n = Number(seedInput);
    ep.reset(Number.isFinite(n) ? n : Math.floor(Math.random() * 1e9));
  };

  const isRemote = mode === "remote";
  const activeSpace = spaceKey ? HF_SPACE_ENDPOINTS[spaceKey] : undefined;

  return (
    <div className="max-w-[95vw] mx-auto px-5 lg:px-8 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="mono-label">/play · interactive episode</div>
          <h1 className="mt-1 text-3xl font-display tracking-tight">Run the environment</h1>
          <p className="text-ink-2 mt-1 text-sm max-w-xl">
            {isRemote ? (
              <>
                Driving the deployed Hugging Face Space. Every action is a real{" "}
                <code className="font-mono text-[12px] bg-bg-0/60 px-1.5 py-0.5 rounded">POST /step</code>{" "}
                — see the live log below to verify against the Space's container logs.
              </>
            ) : (
              <>
                The same engine that powers training — recompiled to TypeScript so you can step
                through it in your browser with no GPU. Toggle <em>fog</em> to hide the infected
                role from the audience.
              </>
            )}
          </p>
        </div>
        <BackendPicker backend={backend} onChange={setBackend} health={spaceHealth} />
      </div>
      {ep.error && isRemote && (
        <div className="panel p-3 mb-4 border border-neon-rose/40 text-xs font-mono text-neon-rose">
          remote error: {ep.error} — switch back to "Browser engine" to keep playing.
        </div>
      )}
      {isRemote && !ep.error && activeSpace && (
        <VerifyCallout space={activeSpace} />
      )}

      <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-start">
        <div className="panel p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="mono-label">grid · 10×10</div>
            <div className="chip">
              <span className={`w-1.5 h-1.5 rounded-full ${ep.playing ? "bg-neon-lime animate-pulse" : "bg-ink-3"}`} />
              {ep.playing ? "running" : "paused"}
            </div>
          </div>
          <Grid state={ep.state} cell={48} hideInfectedTag={fog} />
          <Controls
            playing={ep.playing}
            onPlay={ep.play} onPause={ep.pause} onStep={ep.step} onReset={handleReset}
            speed={speed} onSpeed={handleSpeed}
            seedInput={seedInput} onSeedInput={setSeedInput}
            fog={fog} onFog={setFog}
          />
        </div>

        <div className="space-y-4">
          <PhaseBar state={ep.state} />
          <div className="panel p-4">
            <div className="mono-label mb-3">agents</div>
            <AgentRoster state={ep.state} fog={fog} />
            {fog && (
              <div className="mt-3 text-[11px] font-mono text-ink-3">
                ▸ infected role hidden until step 30 reveal — same as the LLM sees.
              </div>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <BroadcastFeed state={ep.state} />
            <PostmortemFeed state={ep.state} />
          </div>
          <ApiPreview state={ep.state} />
        </div>
      </div>

      <div className="mt-6">
        <LogsPanel active={isRemote} />
      </div>

      <EndCard state={ep.state} onReset={handleReset} />
    </div>
  );
}

function Controls({
  playing, onPlay, onPause, onStep, onReset,
  speed, onSpeed, seedInput, onSeedInput, fog, onFog,
}: {
  playing: boolean;
  onPlay: () => void; onPause: () => void; onStep: () => void; onReset: () => void;
  speed: number; onSpeed: (n: number) => void;
  seedInput: string; onSeedInput: (s: string) => void;
  fog: boolean; onFog: (b: boolean) => void;
}) {
  const speeds = [1, 2, 4, 8, 16];
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {playing ? (
          <button onClick={onPause} className="btn btn-ghost"><Icon.Pause size={14} /> Pause</button>
        ) : (
          <button onClick={onPlay} className="btn btn-primary"><Icon.Play size={14} /> Play</button>
        )}
        <button onClick={onStep} className="btn btn-ghost"><Icon.SkipFwd size={14} /> Step</button>
        <button onClick={onReset} className="btn btn-ghost"><Icon.Reset size={14} /> Reset</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="mono-label">speed</span>
        <div className="inline-flex rounded-lg overflow-hidden border border-ink-4/40">
          {speeds.map(s => (
            <button key={s} onClick={() => onSpeed(s)}
              className={`px-2.5 py-1.5 text-xs font-mono cursor-pointer transition-colors ${
                speed === s ? "bg-neon-violet/30 text-ink-0" : "text-ink-2 hover:bg-ink-4/30"
              }`}>
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="mono-label" htmlFor="seed">seed</label>
        <input id="seed" value={seedInput} onChange={e => onSeedInput(e.target.value)}
          className="bg-bg-2 border border-ink-4/40 rounded-lg px-2.5 py-1.5 font-mono text-xs w-28
            focus:outline-none focus:border-neon-violet" />
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={fog} onChange={e => onFog(e.target.checked)}
            className="accent-neon-violet" />
          <span className="text-xs text-ink-2">fog of war</span>
        </label>
      </div>
    </div>
  );
}

function BackendPicker({
  backend, onChange, health,
}: {
  backend: BackendKey;
  onChange: (b: BackendKey) => void;
  health: { ok: boolean; latencyMs?: number; error?: string } | null;
}) {
  type Opt = { key: BackendKey; label: string; desc: string; icon: typeof Icon.Cpu; remote: boolean };
  const opts: Opt[] = [
    {
      key: "local", icon: Icon.Cpu, remote: false,
      label: "Browser engine",
      desc: "TS port of the env · runs offline · 0 GPU",
    },
    ...(Object.entries(HF_SPACE_ENDPOINTS) as [SpaceKey, typeof HF_SPACE_ENDPOINTS[SpaceKey]][]).map(
      ([key, v]): Opt => ({
        key, icon: Icon.HuggingFace, remote: true,
        label: v.label,
        desc: `${v.desc} · ${v.url}`,
      }),
    ),
  ];
  const isRemote = backend !== "local";
  const dot = !isRemote
    ? "bg-ink-3"
    : health == null
      ? "bg-ink-3"
      : health.ok ? "bg-neon-lime animate-pulse" : "bg-neon-rose";
  const statusText = !isRemote
    ? "browser engine"
    : health == null
      ? "probing…"
      : health.ok
        ? `space online · ${health.latencyMs ?? "?"}ms`
        : `space offline${health.error ? ` (${health.error})` : ""}`;
  return (
    <div className="panel p-3 flex flex-wrap items-center gap-2">
      <Icon.Network size={14} className="text-neon-purple shrink-0" />
      <span className="mono-label text-[10px] mr-1">backend</span>
      {opts.map((o) => {
        const IconC = o.icon;
        // Disable a remote button only if it's the currently-probed space and it's offline.
        const disabled = o.remote && backend === o.key && health != null && !health.ok;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            disabled={disabled}
            className={`px-3 py-1.5 rounded-lg text-xs cursor-pointer transition-colors inline-flex items-center gap-2 ${
              backend === o.key
                ? "bg-neon-violet/25 text-ink-0 border border-neon-violet/40 shadow-[0_0_18px_-6px_rgba(167,139,250,0.6)]"
                : "text-ink-2 hover:bg-ink-4/20 border border-transparent"
            } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
            title={o.desc}
          >
            <IconC size={13} />
            {o.label}
          </button>
        );
      })}
      <span className="ml-1 inline-flex items-center gap-1.5 text-[11px] font-mono text-ink-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {statusText}
      </span>
    </div>
  );
}

function ApiPreview({ state }: { state: any }) {
  // Pull the latest captured event for an honest preview. Falls back to a
  // best-guess synthetic if nothing's been logged yet (e.g. first frame).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const last = (typeof window !== "undefined" ? (window as any).__zombiee_log : null) as
    | { kind: string; req?: unknown; res?: unknown }[] | null;
  const lastStep = last?.slice().reverse().find(e => e.kind === "step");
  const sampleAction = lastStep?.req ?? { agent_id: state.step % 3, action_type: "move_right" };
  const sampleResp = lastStep?.res ?? {
    step_count: state.step,
    current_agent_id: (state.step + 1) % 3,
    reward: 0.01,
    done: state.done,
    phase: state.phase,
  };
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="mono-label">openenv api · last step</div>
        <span className="text-[10px] font-mono text-ink-3">{lastStep ? "live capture" : "synthetic"}</span>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <CodeBlock title="POST /step" body={JSON.stringify(sampleAction, null, 2)} accent="rose" />
        <CodeBlock title="response · observation" body={JSON.stringify(sampleResp, null, 2)} accent="cyan" />
      </div>
    </div>
  );
}

// Compact judge-friendly callout that appears when remote mode is active.
// Tells the viewer where to look to verify the demo is real.
function VerifyCallout({ space }: { space: typeof HF_SPACE_ENDPOINTS[SpaceKey] }) {
  return (
    <div className="panel p-3 mb-4 border border-neon-violet/30 bg-neon-violet/5">
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <Icon.Terminal size={14} className="text-neon-violet shrink-0" />
        <span className="text-ink-1">
          <span className="font-semibold">Live remote mode.</span>{" "}
          Every action below is a real <code className="font-mono text-[11px] bg-bg-0/60 px-1.5 py-0.5 rounded">POST /step</code> against{" "}
          <a href={space.url} target="_blank" rel="noopener noreferrer"
             className="font-mono text-neon-violet hover:underline">
            {space.label}
          </a>.
        </span>
        <span className="ml-auto text-ink-3 text-[11px] font-mono">
          Scroll down to compare the network log against the Space's <a
            href={space.logsUrl}
            target="_blank" rel="noopener noreferrer"
            className="underline hover:text-ink-1"
          >container logs ↗</a>
        </span>
      </div>
    </div>
  );
}

function CodeBlock({ title, body, accent }: { title: string; body: string; accent: "rose" | "cyan" }) {
  return (
    <div className="rounded-xl bg-bg-0/60 border border-ink-4/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink-4/30 bg-bg-1/60">
        <div className={`text-[11px] font-mono uppercase tracking-wider text-neon-${accent}`}>{title}</div>
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-neon-rose/60" />
          <span className="w-2 h-2 rounded-full bg-neon-amber/60" />
          <span className="w-2 h-2 rounded-full bg-neon-lime/60" />
        </div>
      </div>
      <pre className="p-3 font-mono text-[11.5px] text-ink-1 overflow-x-auto leading-5">{body}</pre>
    </div>
  );
}

function EndCard({ state, onReset }: { state: any; onReset: () => void }) {
  if (!state.done) return null;
  const healthyAlive = state.agents.filter((a:any)=>a.alive && !a.infected).length;
  const won = healthyAlive >= 1;
  return (
    <div className={`mt-6 panel p-6 border-2 ${won ? "border-neon-lime/40" : "border-neon-rose/40"}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className={`mono-label ${won ? "text-neon-lime" : "text-neon-rose"}`}>episode terminal</div>
          <div className="font-display text-2xl mt-1">
            {won ? "Healthy survivors hold the safehouse." : "All healthy agents fell. Infected wins."}
          </div>
          <div className="text-sm text-ink-2 mt-1">
            Step {state.step}/100 · {state.postmortems.length} post-mortems generated for next episode.
          </div>
        </div>
        <button className="btn btn-primary" onClick={onReset}>
          <Icon.Reset size={14} /> Run another episode
        </button>
      </div>
    </div>
  );
}
