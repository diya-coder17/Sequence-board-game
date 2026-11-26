import { useEffect, useState } from 'react';

interface Props {
  seconds: number;
  startedAt: number;
  active: boolean;
}

/** Circular countdown for the current turn. Purely visual; expiry is enforced by the game logic. */
export function TurnTimer({ seconds, startedAt, active }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [active, startedAt]);

  const remaining = Math.max(0, seconds - (now - startedAt) / 1000);
  const frac = seconds > 0 ? remaining / seconds : 0;
  const r = 16;
  const circ = 2 * Math.PI * r;
  const urgent = remaining <= 10;
  return (
    <div className={`turn-timer ${urgent ? 'urgent' : ''} ${active ? '' : 'idle'}`} title={`${Math.ceil(remaining)}s left`} role="timer" aria-live="off">
      <svg viewBox="0 0 40 40" width="40" height="40">
        <circle cx="20" cy="20" r={r} className="track" />
        <circle cx="20" cy="20" r={r} className="progress" strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)} transform="rotate(-90 20 20)" />
      </svg>
      <span className="turn-timer-text">{Math.ceil(remaining)}</span>
    </div>
  );
}
