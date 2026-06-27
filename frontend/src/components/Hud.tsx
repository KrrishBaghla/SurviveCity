import { motion, AnimatePresence } from "framer-motion";
import type { EpisodeState } from "../sim/types";

const PHASE_META: Record<string, { label: string; tint: string; sub: string }> = {
  pre_reveal: { label: "PRE-REVEAL", tint: "from-neon-cyan/40 to-neon-violet/40", sub: "infected hunger 1.5×" },
  post_reveal: { label: "POST-REVEAL", tint: "from-neon-amber/40 to-neon-rose/40", sub: "infected may attack" },
  vote: { label: "VOTE", tint: "from-neon-rose/40 to-neon-violet/40", sub: "lock one out forever" },
  post_vote: { label: "POST-VOTE", tint: "from-neon-violet/40 to-neon-cyan/40", sub: "survive to win" },
  terminal: { label: "TERMINAL", tint: "from-ink-3/40 to-ink-3/40", sub: "episode over" },
};

export function PhaseBar({ state }: { state: EpisodeState }) {
  const meta = PHASE_META[state.phase] ?? PHASE_META.pre_reveal;
  const pct = Math.min(100, (state.step / state.maxSteps) * 100);

  return (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className={`chip bg-gradient-to-r ${meta.tint}`}>{meta.label}</span>
          <span className="text-xs text-ink-2">{meta.sub}</span>
        </div>
        <div className="font-mono text-xs text-ink-2">
          step <span className="text-ink-0">{state.step}</span> / {state.maxSteps}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden relative">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-neon-violet via-neon-purple to-neon-rose"
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
        {/* phase markers */}
        {[30, 50].map(s => (
          <div key={s} className="absolute inset-y-0 w-px bg-ink-2/40" style={{ left: `${s}%` }} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-mono text-ink-3 mt-1">
        <span>0</span>
        <span className="absolute" style={{ left: "30%" }}>30 reveal</span>
        <span className="absolute" style={{ left: "50%" }}>50 vote</span>
        <span>100</span>
      </div>
    </div>
  );
}

export function AgentRoster({ state, fog }: { state: EpisodeState; fog?: boolean }) {
  const palette = [
    "from-neon-cyan/30 to-neon-cyan/0 border-neon-cyan/40 text-neon-cyan",
    "from-neon-lime/30 to-neon-lime/0 border-neon-lime/40 text-neon-lime",
    "from-neon-amber/30 to-neon-amber/0 border-neon-amber/40 text-neon-amber",
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {state.agents.map(a => {
        const tint = palette[a.id];
        const isInf = a.infected && (a.infectionRevealed || !fog);
        return (
          <div key={a.id} className={`relative rounded-xl border bg-gradient-to-b ${tint} p-3`}>
            <div className="flex items-center justify-between">
              <div className="font-mono text-sm">A{a.id}</div>
              <div className={`text-[10px] uppercase tracking-wider ${a.alive ? "text-ink-2" : "text-neon-rose"}`}>
                {a.alive ? "alive" : "dead"}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className={`h-1.5 rounded-full ${i < a.hp ? "bg-current" : "bg-bg-3"}`} />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-mono text-ink-2">
              <span>hp {a.hp}/3</span>
              <span>hunger {a.hunger}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {isInf && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neon-rose/20 border border-neon-rose/40 text-neon-rose">INFECTED</span>}
              {a.lockedOut && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-neon-amber/20 border border-neon-amber/40 text-neon-amber">EXILED</span>}
              {a.infected && fog && !a.infectionRevealed && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-bg-3 text-ink-3">??</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BroadcastFeed({ state, max = 6 }: { state: EpisodeState; max?: number }) {
  const items = state.broadcasts.slice(-max).reverse();
  const palette = ["text-neon-cyan", "text-neon-lime", "text-neon-amber"];
  return (
    <div className="panel p-4 h-full overflow-hidden">
      <div className="mono-label mb-2 flex items-center justify-between">
        <span>broadcasts</span>
        <span className="text-ink-3">{state.broadcasts.length} this ep</span>
      </div>
      <div className="space-y-1.5 font-mono text-[12px]">
        <AnimatePresence initial={false}>
          {items.map((b, i) => (
            <motion.div
              key={`${b.step}-${b.agentId}-${i}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-baseline gap-2"
            >
              <span className="text-ink-3 w-9">t{b.step.toString().padStart(2, "0")}</span>
              <span className={`${palette[b.agentId]} font-medium`}>A{b.agentId}</span>
              <span className="text-ink-1 truncate">{b.text}</span>
            </motion.div>
          ))}
          {!items.length && (
            <div className="text-ink-3 text-xs italic">no broadcasts yet…</div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function PostmortemFeed({ state, max = 5 }: { state: EpisodeState; max?: number }) {
  const items = state.postmortems.slice(-max).reverse();
  return (
    <div className="panel p-4 h-full">
      <div className="mono-label mb-2">post-mortems → next episode prompt</div>
      <div className="space-y-1.5 font-mono text-[11.5px]">
        {items.length ? items.map((pm, i) => (
          <div key={i} className="flex items-baseline gap-2 text-ink-2">
            <span className="text-neon-rose">▸</span>
            <span className="break-all">{pm}</span>
          </div>
        )) : <div className="text-ink-3 text-xs italic">no deaths yet — keep them alive…</div>}
      </div>
    </div>
  );
}
