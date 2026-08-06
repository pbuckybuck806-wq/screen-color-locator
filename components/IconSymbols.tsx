export function IconSymbols() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <symbol id="regmark" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="50" cy="50" r="14" fill="none" stroke="currentColor" strokeWidth="3" />
        <line x1="50" y1="4" x2="50" y2="34" stroke="currentColor" strokeWidth="3" />
        <line x1="50" y1="66" x2="50" y2="96" stroke="currentColor" strokeWidth="3" />
        <line x1="4" y1="50" x2="34" y2="50" stroke="currentColor" strokeWidth="3" />
        <line x1="66" y1="50" x2="96" y2="50" stroke="currentColor" strokeWidth="3" />
      </symbol>
      <symbol id="bucket" viewBox="0 0 24 24">
        <path
          d="M5 8h14l-1.4 11a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5 8z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path d="M4 8c0-3.3 3.6-5 8-5s8 1.7 8 5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </symbol>
    </svg>
  );
}

export function RegMark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className ?? "reg-badge"} style={style}>
      <use href="#regmark" />
    </svg>
  );
}

export function BucketIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className ?? "reg-badge"} style={style}>
      <use href="#bucket" />
    </svg>
  );
}
