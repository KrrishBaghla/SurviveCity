import { Icon } from "../components/Icon";
import { HF_URL, REPO_URL } from "../components/Layout";

const METRICS = [
  { label: "Survival rate", base: 0.15, trained: 0.48, color: "lime" },
  { label: "Vote accuracy", base: 0.33, trained: 0.62, color: "purple" },
  { label: "Avg reward", base: 0.31, trained: 0.54, color: "cyan" },
  { label: "Group outcome", base: 0.18, trained: 0.51, color: "rose" },
] as const;

export default function Dashboard() {
  return (
    <div className="max-w-[95vw] mx-auto px-5 lg:px-8 py-10">
      <Header />
      <KPIRow />
      <div className="mt-8 grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <ChartCard title="Training curve · GRPO" sub="reward / 100 steps · LoRA r=8 · Qwen2.5-3B-Instruct"
          src="/figures/training_curve.png" />
        <ChartCard title="Eval @ checkpoint 12" sub="trained vs random baseline · 10 episodes"
          src="/figures/eval_step_0012_bars.png" />
      </div>
      <div className="mt-6 grid lg:grid-cols-2 gap-6">
        <ChartCard title="Eval bars · all checkpoints" sub="composite reward · seeded eval set"
          src="/figures/eval_bars.png" />
        <ChartCard title="Eval history" sub="reward + survival across training"
          src="/figures/eval_history.png" />
      </div>
      <ConfigSection />
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <div className="mono-label">/dashboard · training metrics</div>
        <h1 className="mt-1 text-3xl font-display tracking-tight">Failure replay vs random baseline</h1>
        <p className="text-ink-2 mt-1 text-sm max-w-2xl">
          GRPO on Qwen2.5-3B with LoRA r=8 on a single T4 (Colab) and a DGX A100 (4000 steps).
          Post-mortems from prior episodes are prepended to the system prompt — the only memory the agents have.
        </p>
      </div>
      <div className="flex gap-2">
        <a href={REPO_URL + "/tree/master/v1/notebooks"} target="_blank" rel="noreferrer" className="btn btn-ghost">
          <Icon.Code size={14} /> Notebooks
        </a>
        <a href={HF_URL} target="_blank" rel="noreferrer" className="btn btn-ghost">
          <Icon.HuggingFace size={14} /> Checkpoints
        </a>
      </div>
    </div>
  );
}

function KPIRow() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {METRICS.map(m => {
        const lift = ((m.trained - m.base) / m.base) * 100;
        return (
          <div key={m.label} className={`panel p-5 relative overflow-hidden`}>
            <div className={`absolute -top-8 -right-8 w-24 h-24 rounded-full bg-neon-${m.color}/20 blur-2xl`} />
            <div className="mono-label">{m.label}</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-3xl font-display text-neon-${m.color}`}>
                {(m.trained * 100).toFixed(0)}%
              </span>
              <span className="text-xs text-ink-3 font-mono">vs {(m.base * 100).toFixed(0)}%</span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-bg-3 overflow-hidden">
              <div className={`h-full bg-neon-${m.color}`} style={{ width: `${m.trained * 100}%` }} />
            </div>
            <div className="mt-2 text-[11px] font-mono text-ink-3">+{lift.toFixed(0)}% relative</div>
          </div>
        );
      })}
    </div>
  );
}

function ChartCard({ title, sub, src }: { title: string; sub: string; src: string }) {
  return (
    <div className="panel p-4 sm:p-5 relative overflow-hidden">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="font-display text-lg text-ink-0">{title}</div>
          <div className="text-[11px] font-mono text-ink-3 uppercase tracking-wider">{sub}</div>
        </div>
        <Icon.Activity size={16} className="text-neon-purple" />
      </div>
      <div className="rounded-xl border border-ink-4/40 overflow-hidden bg-bg-0/40">
        <img src={src} alt={title} className="w-full block mix-blend-screen"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.2"; }} />
      </div>
    </div>
  );
}

function ConfigSection() {
  const config = [
    ["base_model", "Qwen/Qwen2.5-3B-Instruct"],
    ["adapter", "LoRA r=8, α=16, dropout=0.05"],
    ["algorithm", "GRPO (TRL + Unsloth)"],
    ["episodes", "4000 steps · 100-step horizon"],
    ["batch", "1 · grad_accum=4"],
    ["lr", "2e-5 · cosine warmup 200"],
    ["compute", "Colab T4 → DGX A100"],
    ["memory", "every-save push to HF Hub"],
  ];
  return (
    <div className="mt-8 grid lg:grid-cols-[1.2fr_1fr] gap-6">
      <div className="panel p-5">
        <div className="mono-label mb-4">training config</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-xs">
          {config.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-ink-4/20 pb-1.5">
              <span className="text-ink-3">{k}</span>
              <span className="text-ink-1">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel p-5 bg-gradient-to-br from-neon-violet/15 to-transparent">
        <div className="mono-label">deploy targets</div>
        <h3 className="mt-2 font-display text-xl">Run training anywhere</h3>
        <p className="mt-1 text-sm text-ink-2">
          Same notebook ships pushes to the Hub on every save — Colab, Kaggle, and DGX share one repo.
          Disconnects don't lose progress.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex items-center gap-2"><span className="chip">colab</span> free T4 · ~3-4h full run</li>
          <li className="flex items-center gap-2"><span className="chip">kaggle</span> T4 / P100 / L4 · UserSecretsClient</li>
          <li className="flex items-center gap-2"><span className="chip">dgx</span> A100 · ~30 min full run</li>
          <li className="flex items-center gap-2"><span className="chip">local</span> RTX 4050 · inference only</li>
        </ul>
      </div>
    </div>
  );
}
