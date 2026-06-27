// Lucide-style stroke icons (24x24)
type P = { className?: string; size?: number };
const base = (size = 18, className = "") =>
  ({
    width: size, height: size,
    viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.6,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    className,
  });

export const Icon = {
  Github: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
    </svg>
  ),
  HuggingFace: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 14c1 1.2 4.5 1.2 6 0M9 10h.01M15 10h.01" />
    </svg>
  ),
  Play: ({ size, className }: P) => (
    <svg {...base(size, className)}><path d="M5 4l14 8-14 8z" fill="currentColor" /></svg>
  ),
  Pause: ({ size, className }: P) => (
    <svg {...base(size, className)}><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
  ),
  Reset: ({ size, className }: P) => (
    <svg {...base(size, className)}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
  ),
  SkipFwd: ({ size, className }: P) => (
    <svg {...base(size, className)}><path d="M5 4l10 8-10 8z" /><line x1="19" y1="5" x2="19" y2="19" /></svg>
  ),
  Cpu: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="2" x2="9" y2="4" /><line x1="15" y1="2" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="22" /><line x1="15" y1="20" x2="15" y2="22" />
      <line x1="2" y1="9" x2="4" y2="9" /><line x1="20" y1="9" x2="22" y2="9" />
      <line x1="2" y1="15" x2="4" y2="15" /><line x1="20" y1="15" x2="22" y2="15" />
    </svg>
  ),
  Brain: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 2.8V13a3 3 0 0 0 2 2.8V17a3 3 0 0 0 3 3h1V4H9z" />
      <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 2.8V13a3 3 0 0 1-2 2.8V17a3 3 0 0 1-3 3h-1V4h1z" />
    </svg>
  ),
  Network: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" />
      <line x1="12" y1="7" x2="6" y2="17" /><line x1="12" y1="7" x2="18" y2="17" /><line x1="7" y1="19" x2="17" y2="19" />
    </svg>
  ),
  Shield: ({ size, className }: P) => (
    <svg {...base(size, className)}><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" /></svg>
  ),
  Bug: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <path d="M8 9V7a4 4 0 0 1 8 0v2" /><rect x="6" y="9" width="12" height="11" rx="6" />
      <path d="M2 14h4M18 14h4M3 9l3 2M21 9l-3 2M3 19l3-2M21 19l-3-2" />
    </svg>
  ),
  Sparkles: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3" />
    </svg>
  ),
  ArrowRight: ({ size, className }: P) => (
    <svg {...base(size, className)}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 5 20 12 13 19" /></svg>
  ),
  Activity: ({ size, className }: P) => (
    <svg {...base(size, className)}><polyline points="3 12 8 12 11 4 13 20 16 12 21 12" /></svg>
  ),
  Map: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <polygon points="3 6 9 4 15 6 21 4 21 18 15 20 9 18 3 20 3 6" />
      <line x1="9" y1="4" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="20" />
    </svg>
  ),
  Book: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <path d="M4 4h12a4 4 0 0 1 4 4v12H8a4 4 0 0 1-4-4V4z" /><path d="M4 4v16" />
    </svg>
  ),
  Code: ({ size, className }: P) => (
    <svg {...base(size, className)}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>
  ),
  Box: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><line x1="12" y1="13" x2="12" y2="21" />
    </svg>
  ),
  Discord: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <path d="M7 8c2-1 8-1 10 0M7 16c2 1 8 1 10 0M5 6c-1 4-1 8 0 12 1 1 4 2 6 2 0-1-1-2-1-2M19 6c1 4 1 8 0 12-1 1-4 2-6 2 0-1 1-2 1-2" />
    </svg>
  ),
  ArrowUpRight: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
    </svg>
  ),
  Copy: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  Terminal: ({ size, className }: P) => (
    <svg {...base(size, className)}>
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
};
