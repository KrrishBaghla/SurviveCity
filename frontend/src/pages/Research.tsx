import { Icon } from "../components/Icon";
import { PAPER_URL, REPO_URL } from "../components/Layout";

export default function Research() {
  return (
    <div className="max-w-[95vw] mx-auto px-5 lg:px-8 py-12">
      <div className="mono-label">/research · v1 design notes</div>
      <h1 className="mt-1 text-4xl sm:text-5xl font-display tracking-tight neon-text">
        How three LLMs learn to outlive a zombie they can't see.
      </h1>
      <p className="text-ink-2 mt-4 text-lg max-w-3xl">
        The contribution lives at the intersection of three OpenEnv themes — multi-agent ToM, long-horizon credit assignment,
        and self-improvement. We pin them together with a deterministic post-mortem that survives across episodes.
      </p>
      <div className="mt-6 flex gap-3 flex-wrap">
        <a href={PAPER_URL} target="_blank" rel="noreferrer" className="btn btn-ghost"><Icon.Book size={14} /> Read v1.tex</a>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-ghost"><Icon.Github size={14} /> Source on GitHub</a>
      </div>

      <Section title="1 · Why failure replay" anchor="why">
        <p>
          Most "self-improvement" baselines in LLM RL replay successes — discount, weight, retrain. Failures get dropped or summarized
          by another LLM (introducing a judge bias). We do the opposite: <strong className="text-ink-0">deaths get a deterministic
          structured post-mortem</strong>, and that string is prepended to every survivor's system prompt next episode.
        </p>
        <Code>
{`# postmortem.py — deterministic, no LLM
"A0 died step=42 cause=zombie_attack hp=0 hunger=11"
"A2 died step=58 cause=infected_attack hp=0 hunger=8 [from A1]"`}
        </Code>
        <p>
          Because the post-mortem is generated from observable state, it's reproducible — the same trajectory yields the same lesson.
          That's what lets us measure failure-replay <em>as a learning signal</em>, not a noise source.
        </p>
      </Section>

      <Section title="2 · The hidden-role pressure cooker" anchor="hidden-role">
        <p>
          One agent starts secretly infected. They get +1.5× hunger pre-reveal and become hostile post-reveal at step 30.
          The rest must read the behavior, not the role: <strong className="text-ink-0">infection is masked from observations</strong>{" "}
          and only revealed to the infected at step 30.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          {[
            { phase: "pre-reveal · 1-29", body: "subtle hunger drift cue · agents broadcast suspicion" },
            { phase: "post-reveal · 30-49", body: "infected attacks adjacent · everyone updates beliefs" },
            { phase: "vote · step 50", body: "lock one agent out of safehouse — irreversible" },
            { phase: "post-vote · 51-100", body: "exiled can't heal · survive the long tail" },
          ].map(p => (
            <div key={p.phase} className="panel p-4">
              <div className="font-mono text-xs uppercase tracking-wider text-neon-purple">{p.phase}</div>
              <div className="text-sm text-ink-1 mt-1">{p.body}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="3 · Reward design without an LLM judge" anchor="rewards">
        <p>
          OpenEnv requires a single scalar reward in (0, 1). We build it from three independent rubrics and clamp the sum.
          No model-in-the-loop scoring — every value is computable from the env state.
        </p>
        <Code>
{`# rubric.py
reward = clip(
  SurvivalRubric(state)        # dense per-step
  + VoteRubric(state)          # sparse @ step 50
  + GroupOutcomeRubric(state), # terminal
  0.01, 0.99,
)`}
        </Code>
      </Section>

      <Section title="4 · The training loop" anchor="loop">
        <p>
          We use GRPO via TRL + Unsloth on Qwen2.5-3B-Instruct with LoRA r=8.
          A single shared model drives all three agents with role-conditional system prompts; post-mortems from the previous
          episode are prepended to that prompt verbatim. We measured a <strong className="text-ink-0">+33pp survival lift</strong>{" "}
          and a <strong className="text-ink-0">+29pp vote-accuracy lift</strong> over the random baseline.
        </p>
      </Section>

      <Section title="5 · Compute story" anchor="compute">
        <p>
          The same notebook drives Colab (free T4), Kaggle (T4/P100/L4) and DGX (A100). Hub <code>every_save</code> means
          a session disconnect doesn't lose progress — we can hop machines mid-run. Our local RTX 4050 is reserved for
          inference and pre-flight smoke tests.
        </p>
        <div className="grid grid-cols-3 gap-3 mt-3">
          {[
            { gpu: "Colab T4", mins: "~210 min", role: "primary trainer" },
            { gpu: "DGX A100", mins: "~32 min", role: "fast iteration" },
            { gpu: "RTX 4050", mins: "—", role: "smoke / inference" },
          ].map(c => (
            <div key={c.gpu} className="panel p-4">
              <div className="font-mono text-sm text-ink-0">{c.gpu}</div>
              <div className="text-[11px] mono-label mt-1">{c.role}</div>
              <div className="mt-2 text-neon-purple font-mono text-sm">{c.mins}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="6 · OpenEnv compliance" anchor="openenv">
        <ul className="list-disc list-inside space-y-1.5 text-ink-2">
          <li>FastAPI server exposing <code>/health · /reset · /step · /state</code></li>
          <li><code>Observation.reward</code> set on every step, clamped to (0.01, 0.99)</li>
          <li>Pydantic models · deterministic seeding · no hidden LLM judge</li>
          <li>Dockerized for HF Spaces deployment (<code>app_port: 7860</code>)</li>
        </ul>
      </Section>

      <div className="mt-16 panel p-6 bg-gradient-to-br from-neon-violet/15 via-bg-1 to-neon-rose/15">
        <div className="mono-label">developer</div>
        <h3 className="mt-1 font-display text-2xl">Krrish Baghla</h3>
        <p className="mt-2 text-ink-2 text-sm max-w-xl">
          Code is MIT, models are public on the Hub. Pull requests welcome.
        </p>
        <div className="mt-4 flex gap-2">
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="btn btn-primary">
            <Icon.Github size={14} /> Star the repo
          </a>
        </div>
      </div>
    </div>
  );
}

function Section({ title, anchor, children }: { title: string; anchor: string; children: React.ReactNode }) {
  return (
    <section id={anchor} className="mt-14 scroll-mt-20">
      <h2 className="text-2xl font-display tracking-tight border-b border-ink-4/30 pb-3">{title}</h2>
      <div className="mt-5 space-y-4 text-ink-2 leading-relaxed">{children}</div>
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="rounded-xl bg-bg-0/60 border border-ink-4/40 p-4 font-mono text-[12.5px] text-ink-1 overflow-x-auto">
      {children}
    </pre>
  );
}
