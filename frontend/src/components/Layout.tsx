import { Link, NavLink, Outlet } from "react-router-dom";
import { Icon } from "./Icon";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/play", label: "Live Demo" },
  { to: "/dashboard", label: "Training" },
  { to: "/research", label: "Research" },
];

export const REPO_URL = "https://github.com/KrrishBaghla/SurviveCity";
export const HF_URL = "https://huggingface.co/spaces/noanya/zombiee-v1-extended";
export const PAPER_URL = "https://github.com/KrrishBaghla/SurviveCity";

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col noise relative">
      <Navbar />
      <main className="flex-1 relative z-[2]">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function Navbar() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-bg-0/70 border-b border-ink-4/30">
      <div className="max-w-[95vw] mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group cursor-pointer">
          <Logo />
          <div className="leading-normal flex flex-col justify-center">
            <div className="font-display font-semibold text-ink-0 text-[15px] tracking-tight">SurviveCity</div>
            <div className="text-[10px] font-mono text-ink-3 uppercase tracking-[0.2em] mt-0.5">Krrish Baghla</div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm transition-colors duration-200 cursor-pointer ${
                  isActive
                    ? "bg-neon-violet/15 text-ink-0 border border-neon-violet/30"
                    : "text-ink-2 hover:text-ink-0 hover:bg-ink-4/20 border border-transparent"
                }`
              }>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={REPO_URL} target="_blank" rel="noreferrer"
            className="btn btn-ghost !px-3 !py-2" aria-label="GitHub repo">
            <Icon.Github size={16} />
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <Link to="/play" className="btn btn-primary !px-3 !py-2 hidden sm:inline-flex">
            <Icon.Play size={14} /> Run Demo
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="drop-shadow-[0_0_12px_rgba(124,58,237,0.55)]">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="0.5" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f43f5e" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="#0c0a1a" stroke="url(#lg)" strokeWidth="1.5" />
      <path d="M20 22 q12 -10 24 0 v8 h-4 v-6 q-8 -6 -16 0 v6 h-4 z" fill="url(#lg)" />
      <path d="M18 36 h28 v6 q0 8 -8 10 h-12 q-8 -2 -8 -10 z" fill="url(#lg)" />
      <circle cx="26" cy="44" r="2.2" fill="#0c0a1a" />
      <circle cx="38" cy="44" r="2.2" fill="#0c0a1a" />
      <path d="M28 50 q4 3 8 0" stroke="#0c0a1a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ink-4/30 bg-bg-0/60 backdrop-blur relative z-[2]">
      <div className="max-w-[95vw] mx-auto px-5 lg:px-8 py-10 grid md:grid-cols-4 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <Logo size={28} />
            <div className="font-display font-semibold text-ink-0">SurviveCity</div>
          </div>
          <p className="mt-3 text-sm text-ink-2 max-w-md">
            Multi-agent LLM environment with cross-episode failure-replay learning.
            Developed by Krrish Baghla.
          </p>
          <div className="mt-4 flex gap-2">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-ghost"><Icon.Github size={15} /> Source</a>
            <a href={HF_URL} target="_blank" rel="noreferrer" className="btn btn-ghost"><Icon.HuggingFace size={15} /> Hub</a>
          </div>
        </div>
        <div>
          <div className="mono-label mb-3">Build</div>
          <ul className="space-y-1.5 text-sm text-ink-2">
            <li><Link to="/play" className="hover:text-ink-0">Live Demo</Link></li>
            <li><Link to="/dashboard" className="hover:text-ink-0">Training Curves</Link></li>
            <li><Link to="/research" className="hover:text-ink-0">Research Notes</Link></li>
          </ul>
        </div>
        <div>
          <div className="mono-label mb-3">Resources</div>
          <ul className="space-y-1.5 text-sm text-ink-2">
            <li><a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-ink-0">GitHub</a></li>
            <li><a href={HF_URL} target="_blank" rel="noreferrer" className="hover:text-ink-0">Hugging Face</a></li>
            <li><a href="https://github.com/meta-pytorch/openenv" target="_blank" rel="noreferrer" className="hover:text-ink-0">OpenEnv</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-4/20 py-4 text-center text-[11px] font-mono text-ink-3">
        © 2025 Krrish Baghla · MIT
      </div>
    </footer>
  );
}
