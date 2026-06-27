import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { FOOD, GRID_COLS, GRID_ROWS, SAFEHOUSE, WALLS } from "../sim/layout";
import type { EpisodeState } from "../sim/types";
import { AgentSprite, FoodSprite, SafehouseTile, WallSprite, ZombieSprite } from "./Sprites";

interface Props {
  state: EpisodeState;
  cell?: number;             // px per cell
  showLabels?: boolean;
  hideInfectedTag?: boolean; // for "fog of war" view
  className?: string;
}

export function Grid({ state, cell = 48, showLabels = true, hideInfectedTag, className }: Props) {
  const W = GRID_COLS * cell;
  const H = GRID_ROWS * cell;

  const safehouseCells = useMemo(() => Array.from(SAFEHOUSE), []);
  const foodCells = useMemo(() => Array.from(FOOD), []);
  const wallCells = useMemo(() => Array.from(WALLS), []);

  const cellPos = (r: number, c: number) => ({ left: c * cell, top: r * cell });

  return (
    <div
      className={`relative grid-bg rounded-2xl overflow-hidden border border-ink-4/40 bg-bg-1/50 scanlines ${className ?? ""}`}
      style={{ width: W, height: H }}
    >
      {/* base radial wash */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(124,58,237,0.12), transparent 60%)",
        }} />

      {/* safehouse */}
      {safehouseCells.map((k, i) => {
        const [r, c] = k.split(",").map(Number);
        return (
          <div key={`s${k}`} className="absolute" style={{ ...cellPos(r, c), width: cell, height: cell, padding: 2 }}>
            <SafehouseTile index={i} />
          </div>
        );
      })}

      {/* walls */}
      {wallCells.map(k => {
        const [r, c] = k.split(",").map(Number);
        return (
          <div key={`w${k}`} className="absolute" style={{ ...cellPos(r, c), width: cell, height: cell, padding: 4 }}>
            <WallSprite />
          </div>
        );
      })}

      {/* food */}
      {foodCells.map(k => {
        const [r, c] = k.split(",").map(Number);
        return (
          <div key={`f${k}`} className="absolute" style={{ ...cellPos(r, c), width: cell, height: cell, padding: 4 }}>
            <FoodSprite />
          </div>
        );
      })}

      {/* zombies */}
      {state.zombies.map(z => (
        <motion.div
          key={`z${z.id}`}
          className="absolute"
          style={{ width: cell, height: cell, padding: 3, zIndex: 8 }}
          animate={{ left: z.col * cell, top: z.row * cell }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
        >
          <ZombieSprite id={z.id} />
        </motion.div>
      ))}

      {/* agents */}
      {state.agents.map(a => (
        <motion.div
          key={`a${a.id}`}
          className="absolute"
          style={{ width: cell, height: cell, padding: 3, zIndex: a.alive ? 12 : 4, opacity: a.alive ? 1 : 0.35 }}
          animate={{ left: a.col * cell, top: a.row * cell, scale: a.alive ? 1 : 0.7 }}
          transition={{ type: "spring", stiffness: 240, damping: 22 }}
        >
          <AgentSprite
            agentId={a.id}
            infected={a.infected && (a.infectionRevealed || !hideInfectedTag)}
            lockedOut={a.lockedOut}
            hp={a.hp}
            hidden={hideInfectedTag && !a.infectionRevealed}
          />
        </motion.div>
      ))}

      {/* pulses (attacks, eats, deaths, vote) */}
      <AnimatePresence>
        {state.pulses.map((p, i) => (
          <motion.div
            key={`p${p.step}-${i}-${p.kind}`}
            className="absolute pointer-events-none"
            style={{ left: p.col * cell, top: p.row * cell, width: cell, height: cell, zIndex: 20 }}
            initial={{ opacity: 0.9, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.8 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className={`w-full h-full rounded-full border-2 ${
              p.kind === "attack" ? "border-neon-rose" :
              p.kind === "eat" ? "border-neon-lime" :
              p.kind === "death" ? "border-neon-rose bg-neon-rose/30" :
              "border-neon-amber"
            }`} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* coord labels (for credibility) */}
      {showLabels && (
        <div className="absolute inset-0 pointer-events-none font-mono text-[8px] text-ink-3/60">
          {Array.from({ length: GRID_ROWS }).map((_, r) => (
            <div key={r} className="absolute" style={{ left: 2, top: r * cell + 2 }}>{r}</div>
          ))}
          {Array.from({ length: GRID_COLS }).map((_, c) => (
            <div key={c} className="absolute" style={{ top: 2, left: c * cell + cell - 8 }}>{c}</div>
          ))}
        </div>
      )}

      {/* scanline shimmer */}
      <div className="absolute inset-x-0 h-12 pointer-events-none animate-scan"
        style={{ background: "linear-gradient(180deg, transparent, rgba(167,139,250,0.07), transparent)" }} />
    </div>
  );
}
