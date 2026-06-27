// Live log panel — renders every event the engines push through the
// pub/sub in remoteEngine.ts. Designed so a judge can keep this open next to
// the HF Space's "Logs" tab and visually verify the two streams agree.
//
// What's shown:
//   - One row per captured event, newest at the bottom.
//   - Color-coded by kind (init / health / reset / step / tick / error).
//   - Each row is clickable to expand the request/response JSON.
//   - Filter chips so judges can isolate "step" calls (the matching ones)
//     from health-pings + ticks.
//   - Action row: copy-to-clipboard + open-HF-logs link + clear.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  HF_SPACE_URL, SESSION_ID,
  clearLogBuffer, getLogBuffer, subscribeLog,
  type LogEvent, type LogEventKind,
} from "../sim/remoteEngine";
import { Icon } from "./Icon";

const KIND_COLOR: Record<LogEventKind, string> = {
  init:        "text-neon-amber",
  health:      "text-neon-cyan",
  reset:       "text-neon-violet",
  step:        "text-neon-lime",
  tick:        "text-ink-2",
  error:       "text-neon-rose",
  "local-tick": "text-neon-cyan",
};

const KIND_TAG: Record<LogEventKind, string> = {
  init:        "init",
  health:      "health",
  reset:       "reset",
  step:        "step",
  tick:        "tick",
  error:       "error",
  "local-tick": "local",
};

type FilterKey = "all" | "step" | "network" | "errors";

const FILTER_FN: Record<FilterKey, (e: LogEvent) => boolean> = {
  all:     () => true,
  step:    (e) => e.kind === "step",
  network: (e) => e.kind === "step" || e.kind === "reset" || e.kind === "health",
  errors:  (e) => e.kind === "error",
};

const HF_LOGS_URL = `https://huggingface.co/spaces/noanya/zombiee/logs/container`;

export function LogsPanel({ active }: { active: boolean }) {
  const [events, setEvents] = useState<LogEvent[]>(() => Array.from(getLogBuffer()));
  const [filter, setFilter] = useState<FilterKey>("all");
  const [autoscroll, setAutoscroll] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copyOk, setCopyOk] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const off = subscribeLog((ev) => {
      setEvents((curr) => {
        const next = curr.length >= 500 ? curr.slice(-499) : curr.slice();
        next.push(ev);
        return next;
      });
    });
    return off;
  }, []);

  const filtered = useMemo(
    () => events.filter(FILTER_FN[filter]),
    [events, filter],
  );

  // Auto-scroll to bottom on new events.
  useEffect(() => {
    if (!autoscroll) return;
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length, autoscroll]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(events, null, 2));
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
    } catch { /* clipboard blocked, ignore */ }
  };

  const handleClear = () => {
    clearLogBuffer();
    setEvents([]);
    setExpanded(null);
  };

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="mono-label">live network log</div>
          <span className="chip text-[10px]">
            <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-neon-violet animate-pulse" : "bg-ink-3"}`} />
            session {SESSION_ID.slice(0, 12)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <a
            href={HF_LOGS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-lg border border-ink-4/40 text-ink-2 hover:text-ink-0 hover:bg-ink-4/30 transition-colors inline-flex items-center gap-1.5"
            title="Open the matching log on the Hugging Face Space"
          >
            HF logs <Icon.ArrowUpRight size={10} />
          </a>
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 rounded-lg border border-ink-4/40 text-ink-2 hover:text-ink-0 hover:bg-ink-4/30 transition-colors inline-flex items-center gap-1.5"
            title="Copy the full log buffer (JSON) to clipboard"
          >
            {copyOk ? <span className="text-neon-lime">copied</span> : <>copy <Icon.Copy size={10} /></>}
          </button>
          <button
            onClick={handleClear}
            className="px-2.5 py-1 rounded-lg border border-ink-4/40 text-ink-2 hover:text-ink-0 hover:bg-ink-4/30 transition-colors inline-flex items-center gap-1.5"
          >
            clear <Icon.Reset size={10} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <FilterChip active={filter === "all"}     onClick={() => setFilter("all")}     label="all"     count={counts.all} />
        <FilterChip active={filter === "step"}    onClick={() => setFilter("step")}    label="steps"   count={counts.step} />
        <FilterChip active={filter === "network"} onClick={() => setFilter("network")} label="network" count={(counts.step ?? 0) + (counts.reset ?? 0) + (counts.health ?? 0)} />
        <FilterChip active={filter === "errors"}  onClick={() => setFilter("errors")}  label="errors"  count={counts.error ?? 0} dangerous />
        <label className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-mono text-ink-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoscroll}
            onChange={(e) => setAutoscroll(e.target.checked)}
            className="accent-neon-violet"
          />
          autoscroll
        </label>
      </div>

      <div
        ref={scrollerRef}
        className="rounded-xl bg-bg-0/70 border border-ink-4/40 overflow-y-auto font-mono text-[11px] leading-5"
        style={{ height: 300 }}
      >
        {filtered.length === 0 ? (
          <div className="p-3 text-ink-3">no events yet — switch backend or click play</div>
        ) : (
          filtered.map((ev, i) => {
            const idx = events.indexOf(ev);
            const isOpen = expanded === idx;
            return (
              <div key={`${ev.ts}-${i}`} className="border-b border-ink-4/20 last:border-b-0">
                <button
                  onClick={() => setExpanded(isOpen ? null : idx)}
                  className="w-full text-left px-3 py-1.5 flex items-baseline gap-2 hover:bg-ink-4/15 transition-colors"
                >
                  <span className="text-ink-3 shrink-0">{ev.ts}</span>
                  <span className={`shrink-0 ${KIND_COLOR[ev.kind]}`}>
                    [{ev.source === "local" ? "local" : "hf"}:{KIND_TAG[ev.kind]}]
                  </span>
                  <span className="text-ink-1 truncate">{ev.summary ?? JSON.stringify(ev.req ?? ev.res ?? {})}</span>
                </button>
                {isOpen && (
                  <pre className="px-3 pb-2 pt-1 bg-bg-0/95 text-[10.5px] text-ink-2 overflow-x-auto">
{JSON.stringify(
  { ts: ev.ts, kind: ev.kind, source: ev.source, endpoint: ev.endpoint, method: ev.method, path: ev.path,
    latencyMs: ev.latencyMs, req: ev.req, res: ev.res, error: ev.error },
  null, 2,
)}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] font-mono text-ink-3">
        <span>endpoint <span className="text-ink-1">{HF_SPACE_URL}</span></span>
        <span className="text-ink-4/60">·</span>
        <span>X-Zombiee-Session <span className="text-ink-1">{SESSION_ID}</span> (sent on every request)</span>
      </div>
    </div>
  );
}

function FilterChip({
  active, onClick, label, count, dangerous,
}: {
  active: boolean; onClick: () => void; label: string; count?: number; dangerous?: boolean;
}) {
  const base = "px-2.5 py-1 rounded-lg text-[11px] font-mono cursor-pointer transition-colors border";
  const on = dangerous
    ? "bg-neon-rose/20 text-neon-rose border-neon-rose/40"
    : "bg-neon-violet/20 text-ink-0 border-neon-violet/40";
  const off = "text-ink-2 border-ink-4/40 hover:bg-ink-4/20";
  return (
    <button onClick={onClick} className={`${base} ${active ? on : off}`}>
      {label}{count !== undefined ? <span className="text-ink-3 ml-1">({count})</span> : null}
    </button>
  );
}
