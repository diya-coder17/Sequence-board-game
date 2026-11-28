import { useEffect, useRef, useState } from 'react';
import { sounds } from '../sound';

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

  // One tick per whole second during the last five (5,4,3,2,1), only for the player on the clock.
  const whole = Math.ceil(remaining);
  const lastTicked = useRef<number | null>(null);
  useEffect(() => {
    lastTicked.current = null;
  }, [startedAt]);
  useEffect(() => {
    if (!active || whole > 5 || whole < 1 || lastTicked.current === whole) return;
    lastTicked.current = whole;
    sounds.tick(whole === 1);
  }, [active, whole]);
  const frac = seconds > 0 ? remaining / seconds : 0;
  const r = 16;
  const circ = 2 * Math.PI * r;
  // Red for the last 10 seconds, or the last third of a short turn.
  const urgent = remaining <= Math.min(10, seconds / 3);
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
