export function HeroScene() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px]" aria-hidden>
      <div className="absolute inset-[8%] rounded-full bg-cobalt/20 blur-3xl" />
      <svg viewBox="0 0 520 520" className="relative h-full w-full">
        <defs>
          <linearGradient id="arcMetal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#93C5FD" />
            <stop offset="45%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#0D1B30" />
          </linearGradient>
          <linearGradient id="core" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#93C5FD" />
          </linearGradient>
          <radialGradient id="plinth" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#1D4ED8" />
            <stop offset="100%" stopColor="#07111F" />
          </radialGradient>
        </defs>
        <ellipse cx="260" cy="390" rx="170" ry="36" fill="url(#plinth)" opacity="0.9" />
        <ellipse cx="260" cy="378" rx="120" ry="18" fill="#3B82F6" opacity="0.25" />
        <path
          d="M90 300C110 150 190 90 300 110C390 126 450 210 430 300"
          fill="none"
          stroke="url(#arcMetal)"
          strokeWidth="28"
          strokeLinecap="round"
        />
        <path
          d="M120 292C136 176 198 128 286 142"
          fill="none"
          stroke="#F8FAFC"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
        />
        <g className="arc-orbit">
          <circle cx="260" cy="250" r="148" fill="none" stroke="#93C5FD" strokeOpacity="0.25" strokeDasharray="4 10" />
          <circle className="node-pulse" cx="408" cy="250" r="7" fill="#93C5FD" />
          <circle className="node-pulse" cx="260" cy="102" r="6" fill="#F8FAFC" />
          <circle className="node-pulse" cx="130" cy="300" r="5" fill="#3B82F6" />
        </g>
        <rect x="214" y="196" width="92" height="108" rx="22" fill="#0D1B30" stroke="#93C5FD" strokeOpacity="0.7" />
        <rect x="232" y="214" width="56" height="40" rx="10" fill="url(#core)" />
        <text x="260" y="278" textAnchor="middle" fill="#93C5FD" fontSize="11" fontFamily="ui-monospace, monospace">
          VAULT
        </text>
        <path d="M168 250H214" stroke="#93C5FD" strokeOpacity="0.5" />
        <path d="M306 250H360" stroke="#93C5FD" strokeOpacity="0.5" />
      </svg>
    </div>
  );
}
