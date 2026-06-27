import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Grid } from "../components/Grid";
import { useEpisode } from "../hooks/useEpisode";
import { Icon } from "../components/Icon";
import { HF_URL, REPO_URL } from "../components/Layout";
import { AgentRoster, BroadcastFeed, PhaseBar } from "../components/Hud";

export default function Landing() {
  const { state } = useEpisode({ seed: 7, speed: 3, autoStart: true, loopOnEnd: true });

  return (
    <div className="relative">
      <Hero state={state} />
      <Pillars />
      <DesignSection />
      <RewardSection />
      <ResultsTeaser />
      <CTASection />
    </div>
  );
}

function Hero({ state }: { state: any }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-neon-violet/30 blur-[120px] animate-drift" />
        <div className="absolute -bottom-32 -left-20 w-[420px] h-[420px] rounded-full bg-neon-rose/25 blur-[120px] animate-drift" />
      </div>
      <div className="max-w-[95vw] mx-auto px-5 lg:px-8 pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 chip mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-lime animate-pulse" />
              release v1.0 · openenv simulation
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.05 }}
              className="text-[44px] sm:text-6xl lg:text-7xl font-display font-semibold leading-[1.02] neon-text">
              Three agents.<br />
              Three zombies.<br />
              <span className="bg-gradient-to-r from-neon-purple via-neon-violet to-neon-rose bg-clip-text text-transparent">
                One infected.
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15 }}
              className="mt-5 text-lg text-ink-2 max-w-xl">
              <span className="text-ink-0">SurviveCity</span> is the first OpenEnv-compliant environment for{" "}
              <span className="text-neon-purple">cross-episode failure-replay learning</span> in multi-agent LLMs.
              Every death writes a deterministic post-mortem that becomes the next episode's lesson.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.25 }}
              className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/play" className="btn btn-primary"><Icon.Play size={15} /> Run live demo</Link>
              <Link to="/research" className="btn btn-ghost"><Icon.Book size={15} /> Read the design</Link>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-ghost">
                <Icon.Github size={15} /> GitHub
              </a>
              <a href={HF_URL} target="_blank" rel="noreferrer" className="btn btn-ghost">
                <Icon.HuggingFace size={15} /> HF Hub
              </a>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.4 }}
              className="mt-10 grid grid-cols-3 gap-4 max-w-lg">
              {[
                { k: "+33%", v: "survival lift" },
                { k: "+29pt", v: "vote accuracy" },
                { k: "100", v: "step horizon" },
              ].map(s => (
                <div key={s.v} className="panel p-4">
                  <div className="text-2xl font-display font-semibold neon-text">{s.k}</div>
                  <div className="text-[11px] mono-label mt-0.5">{s.v}</div>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[28px] bg-gradient-to-br from-neon-violet/30 via-neon-purple/15 to-neon-rose/30 blur-2xl" />
            <div className="panel p-4 sm:p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="mono-label">live simulation · seed 7</div>
                <div className="chip">
                  <span className="w-1.5 h-1.5 rounded-full bg-neon-lime animate-pulse" />
                  loop
                </div>
              </div>
              <div className="flex justify-center">
                <Grid state={state} cell={Math.min(44, Math.floor((window.innerWidth - 640) / 12) || 36)} />
              </div>
              <div className="mt-4 grid sm:grid-cols-[1fr_1fr] gap-3">
                <PhaseBar state={state} />
                <div className="panel p-4">
                  <AgentRoster state={state} fog />
                </div>
              </div>
              <div className="mt-3">
                <BroadcastFeed state={state} max={3} />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Pillars() {
  const items = [
    {
      icon: <Icon.Brain size={22} />,
      tag: "theme 4",
      title: "Failure-Replay Memory",
      body: "Each death emits a deterministic post-mortem. The next episode's system prompt prepends them — agents literally learn from how they die.",
      tint: "from-neon-violet/30",
    },
    {
      icon: <Icon.Network size={22} />,
      tag: "theme 1",
      title: "Hidden-Role ToM",
      body: "One agent starts secretly infected with 1.5× hunger. Others infer betrayal from behavior, broadcast suspicion, and vote them out.",
      tint: "from-neon-rose/30",
    },
    {
      icon: <Icon.Activity size={22} />,
      tag: "theme 2",
      title: "100-Step Long Horizon",
      body: "Phased mechanics: survival → reveal → vote → post-vote. Long enough that strategy compounds, short enough to train on a free T4.",
      tint: "from-neon-cyan/30",
    },
    {
      icon: <Icon.Shield size={22} />,
      tag: "rubric",
      title: "Composable Rewards",
      body: "Three independent rubrics — survival, vote, group-outcome — combined with strict OpenEnv clamping. No LLM judge. No randomness.",
      tint: "from-neon-lime/30",
    },
  ];
  return (
    <section className="py-20 relative">
      <div className="max-w-[95vw] mx-auto px-5 lg:px-8">
        <SectionTitle eyebrow="Research" title="Four pillars, one environment" />
        <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map(it => (
            <div key={it.title}
              className={`panel p-5 bg-gradient-to-b ${it.tint} to-transparent hover:border-neon-violet/40 transition-colors`}>
              <div className="flex items-center justify-between text-ink-2">
                {it.icon}
                <span className="chip !bg-bg-3/50">{it.tag}</span>
              </div>
              <div className="mt-4 font-display text-lg text-ink-0">{it.title}</div>
              <p className="mt-2 text-sm text-ink-2 leading-relaxed">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DesignSection() {
  return (
    <section className="py-20 relative">
      <div className="max-w-[95vw] mx-auto px-5 lg:px-8 grid lg:grid-cols-[1.1fr_1fr] gap-10 items-center">
        <div>
          <SectionTitle eyebrow="Environment" title="A 10×10 city, four corner depots, one safehouse" />
          <p className="mt-5 text-ink-2 text-base leading-relaxed">
            Every spawn, wall, and food depot is fixed across episodes — the only variation is which agent starts infected
            and the zombie wander RNG. That determinism is what makes the post-mortem signal teachable.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[
              { k: "Safehouse", v: "3×3 center · heals 1 hp/step · zombie-immune" },
              { k: "Food (F)", v: "4 corner depots — agents must leave shelter to eat" },
              { k: "Walls (#)", v: "Chokepoints around safehouse approaches" },
              { k: "Zombies (Z)", v: "BFS chase nearest exposed agent — wander otherwise" },
            ].map(c => (
              <div key={c.k} className="panel p-3">
                <div className="font-mono text-[11px] uppercase tracking-wider text-neon-purple">{c.k}</div>
                <div className="text-sm text-ink-1 mt-1">{c.v}</div>
              </div>
            ))}
          </div>
        </div>
        <CityMap />
      </div>
    </section>
  );
}

function CityMap() {
  // ASCII-art-style stylized map
  const rows = [
    ". . . . . . . . . .",
    ". F . . . . . . F .",
    ". . . . . . . . . .",
    ". . . # . . # . . .",
    ". . . . S S S . . .",
    ". . # . S S S # . .",
    ". . . . S S S . . .",
    ". . . # . # . . . .",
    ". F . . . . . . F .",
    ". . . . . . . . . .",
  ];
  const color = (ch: string) => {
    if (ch === "S") return "text-neon-purple";
    if (ch === "F") return "text-neon-lime";
    if (ch === "#") return "text-neon-rose";
    return "text-ink-3";
  };
  return (
    <div className="panel p-6 relative">
      <div className="mono-label mb-3 flex justify-between">
        <span>survivecity_env / layout.py</span>
        <span className="text-ink-3">10×10 deterministic</span>
      </div>
      <pre className="font-mono text-[15px] leading-7 sm:text-[18px] sm:leading-9">
        {rows.map((row, ri) => (
          <div key={ri}>
            {row.split(" ").map((ch, ci) => (
              <span key={ci} className={`${color(ch)} mx-1`}>{ch}</span>
            ))}
          </div>
        ))}
      </pre>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-mono">
        <span className="chip"><span className="w-2 h-2 rounded-full bg-neon-purple inline-block mr-1.5" />S — safehouse</span>
        <span className="chip"><span className="w-2 h-2 rounded-full bg-neon-lime inline-block mr-1.5" />F — food</span>
        <span className="chip"><span className="w-2 h-2 rounded-full bg-neon-rose inline-block mr-1.5" /># — wall</span>
      </div>
    </div>
  );
}

function RewardSection() {
  const rubrics = [
    {
      name: "SurvivalRubric", type: "dense", color: "neon-cyan",
      bullets: ["+0.005 alive · per step", "+0.05 eat · per food", "−0.10 damage · per hp", "−0.50 death"],
      desc: "Per-step, per-agent. Dense gradient that never sleeps.",
    },
    {
      name: "VoteRubric", type: "sparse @ step 50", color: "neon-rose",
      bullets: ["+0.30 correct vote", "−0.20 wrong vote", "0 abstain"],
      desc: "Only fires once. Tests theory-of-mind under deadline.",
    },
    {
      name: "GroupOutcomeRubric", type: "terminal", color: "neon-lime",
      bullets: ["+0.40 healthy survives", "+0.30 infected neutralized", "−0.30 wipe"],
      desc: "Aligns individual incentive with collective survival.",
    },
  ];
  return (
    <section className="py-20 relative">
      <div className="max-w-[95vw] mx-auto px-5 lg:px-8">
        <SectionTitle eyebrow="Reward Design" title="Three composable, deterministic rubrics" />
        <p className="mt-3 text-ink-2 max-w-2xl">
          Final reward is <code className="font-mono text-neon-purple">clip(Σ rubrics, 0.01, 0.99)</code> — strict OpenEnv compliance.
          No LLM judge anywhere in the loop.
        </p>
        <div className="mt-10 grid lg:grid-cols-3 gap-4">
          {rubrics.map(r => (
            <div key={r.name} className="panel p-5 relative overflow-hidden">
              <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full bg-${r.color}/20 blur-3xl`} />
              <div className="font-mono text-xs uppercase tracking-wider text-ink-3">{r.type}</div>
              <div className={`mt-1 font-display text-xl text-${r.color}`}>{r.name}</div>
              <p className="mt-2 text-sm text-ink-2">{r.desc}</p>
              <ul className="mt-4 space-y-1.5 font-mono text-[12.5px] text-ink-1">
                {r.bullets.map(b => (
                  <li key={b} className="flex items-start gap-2">
                    <span className={`text-${r.color}`}>▸</span>{b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ResultsTeaser() {
  return (
    <section className="py-20 relative">
      <div className="max-w-[95vw] mx-auto px-5 lg:px-8">
        <SectionTitle eyebrow="Training" title="Failure replay actually works" />
        <div className="mt-8 grid lg:grid-cols-[1.2fr_1fr] gap-6 items-stretch">
          <div className="panel p-3 overflow-hidden">
            <img src="/figures/training_curve.png" alt="Training curve"
              className="w-full rounded-xl border border-ink-4/40 mix-blend-screen" />
          </div>
          <div className="panel p-6 flex flex-col justify-center">
            <div className="mono-label">measured on 4 evals × 10 episodes</div>
            <div className="mt-3 space-y-3">
              {[
                { metric: "Survival rate", base: "15%", trained: "48%" },
                { metric: "Vote accuracy", base: "33%", trained: "62%" },
                { metric: "Avg. reward", base: "0.31", trained: "0.54" },
              ].map(r => (
                <div key={r.metric} className="flex items-center justify-between gap-4 border-b border-ink-4/20 pb-3 last:border-0">
                  <div className="text-sm text-ink-1">{r.metric}</div>
                  <div className="flex items-baseline gap-3 font-mono">
                    <span className="text-ink-3 line-through">{r.base}</span>
                    <Icon.ArrowRight size={14} className="text-neon-purple" />
                    <span className="text-neon-lime text-lg">{r.trained}</span>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/dashboard" className="btn btn-ghost mt-6 self-start">
              <Icon.Activity size={15} /> See full dashboard
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-24 relative">
      <div className="max-w-5xl mx-auto px-5 lg:px-8 text-center">
        <div className="inline-flex chip mb-5">
          <Icon.Sparkles size={12} /> open source · MIT
        </div>
        <h2 className="text-4xl sm:text-5xl font-display font-semibold tracking-tight neon-text">
          Watch agents learn from their mistakes.
        </h2>
        <p className="mt-4 text-ink-2 text-lg max-w-2xl mx-auto">
          The full episode runner runs in your browser — no GPU, no install. Train it for real on Colab,
          Kaggle, or DGX with the included notebooks.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link to="/play" className="btn btn-primary"><Icon.Play size={15} /> Open live demo</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-ghost">
            <Icon.Github size={15} /> Star on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="mono-label">{eyebrow}</div>
      <h2 className="mt-2 text-3xl sm:text-4xl font-display tracking-tight">{title}</h2>
      <div className="divider mt-4 max-w-md" />
    </div>
  );
}
