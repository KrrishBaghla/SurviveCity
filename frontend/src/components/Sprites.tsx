import { motion } from "framer-motion";

export function AgentSprite({
  agentId, infected, lockedOut, hp, hidden,
}: { agentId: number; infected: boolean; lockedOut: boolean; hp: number; hidden?: boolean }) {
  const palette = [
    { ring: "#22d3ee", body: "#0ea5b7", accent: "#67e8f9" }, // A0 cyan
    { ring: "#a3e635", body: "#65a30d", accent: "#d9f99d" }, // A1 lime
    { ring: "#fbbf24", body: "#d97706", accent: "#fde68a" }, // A2 amber
  ];
  const p = palette[agentId];
  const showInfected = infected && !hidden;

  return (
    <svg viewBox="0 0 32 32" className="w-full h-full">
      <defs>
        <radialGradient id={`a${agentId}-glow`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={p.ring} stopOpacity="0.55" />
          <stop offset="100%" stopColor={p.ring} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill={`url(#a${agentId}-glow)`} />
      <motion.g
        animate={{ y: [0, -1.2, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* head */}
        <circle cx="16" cy="11" r="4.2" fill={p.body} stroke={p.ring} strokeWidth="0.8" />
        {/* eyes */}
        <circle cx="14.4" cy="10.6" r="0.7" fill="#0c0a1a" />
        <circle cx="17.6" cy="10.6" r="0.7" fill="#0c0a1a" />
        {/* body */}
        <path
          d="M9.5 22 Q16 14 22.5 22 L22.5 26 Q16 28 9.5 26 Z"
          fill={p.body}
          stroke={p.ring}
          strokeWidth="0.8"
        />
        <path d="M11 23 L21 23" stroke={p.accent} strokeWidth="0.6" opacity="0.7" />
      </motion.g>
      {showInfected && (
        <motion.circle
          cx="22" cy="6" r="3" fill="#f43f5e"
          stroke="#fff" strokeWidth="0.6"
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ duration: 1.1, repeat: Infinity }}
        />
      )}
      {lockedOut && (
        <text x="16" y="31" textAnchor="middle" fontSize="4" fill="#fbbf24" fontFamily="Fira Code">EXILED</text>
      )}
      {/* hp bar */}
      <rect x="6" y="2.5" width="20" height="2.4" rx="1.2" fill="rgba(0,0,0,0.55)" />
      <rect x="6" y="2.5" width={20 * (hp / 3)} height="2.4" rx="1.2"
        fill={hp >= 2 ? "#a3e635" : hp === 1 ? "#fbbf24" : "#f43f5e"} />
    </svg>
  );
}

export function ZombieSprite({ id }: { id: number }) {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full">
      <defs>
        <radialGradient id={`z${id}-glow`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill={`url(#z${id}-glow)`} />
      <motion.g
        animate={{ rotate: [-3, 3, -3] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "16px 22px" }}
      >
        {/* head */}
        <circle cx="16" cy="11" r="4.5" fill="#3b1d2e" stroke="#f43f5e" strokeWidth="0.9" />
        {/* glowing eyes */}
        <motion.circle cx="14.2" cy="10.6" r="0.9" fill="#fb7185"
          animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 1.2, repeat: Infinity }} />
        <motion.circle cx="17.8" cy="10.6" r="0.9" fill="#fb7185"
          animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }} />
        {/* mouth */}
        <path d="M13.8 13.6 Q16 15 18.2 13.6" stroke="#fb7185" strokeWidth="0.7" fill="none" />
        {/* body */}
        <path d="M9 22 Q16 15 23 22 L23 27 Q16 29 9 27 Z" fill="#3b1d2e" stroke="#f43f5e" strokeWidth="0.9" />
        {/* claws */}
        <path d="M8 22 L6 24 M8 25 L5.5 26.5" stroke="#fb7185" strokeWidth="0.7" />
        <path d="M24 22 L26 24 M24 25 L26.5 26.5" stroke="#fb7185" strokeWidth="0.7" />
      </motion.g>
    </svg>
  );
}

export function FoodSprite() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full opacity-90">
      <motion.g
        animate={{ y: [0, -1, 0], scale: [1, 1.04, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <circle cx="16" cy="18" r="7" fill="#a3e635" stroke="#65a30d" strokeWidth="0.8" opacity="0.85" />
        <path d="M16 11 Q14 8 11 9" stroke="#65a30d" strokeWidth="1" fill="none" />
        <circle cx="13" cy="16" r="1" fill="#fff" opacity="0.5" />
      </motion.g>
    </svg>
  );
}

export function WallSprite() {
  return (
    <svg viewBox="0 0 32 32" className="w-full h-full">
      <rect x="2" y="2" width="28" height="28" rx="3" fill="#1a1538" stroke="#3b3463" strokeWidth="1" />
      <path d="M6 10 L26 10 M6 16 L26 16 M6 22 L26 22" stroke="#3b3463" strokeWidth="0.9" />
      <path d="M14 4 L14 10 M20 10 L20 16 M10 16 L10 22 M22 22 L22 28" stroke="#3b3463" strokeWidth="0.9" />
    </svg>
  );
}

export function SafehouseTile({ index }: { index: number }) {
  return (
    <div className="absolute inset-0 rounded-[6px] border border-neon-violet/25 bg-neon-violet/[0.07]">
      {index === 4 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-[8px] font-mono uppercase tracking-[0.3em] text-neon-purple/70">safe</div>
        </div>
      )}
    </div>
  );
}
