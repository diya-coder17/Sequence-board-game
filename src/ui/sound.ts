/**
 * Tiny synthesised sound effects via the Web Audio API — no audio files to load.
 * Browsers only allow audio after a user gesture, so the context is created lazily on
 * first play and resumed on the next pointer/key event if it was suspended.
 */
const MUTE_KEY = 'sequence.muted';

let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();
const listeners = new Set<(m: boolean) => void>();

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

if (typeof window !== 'undefined') {
  // Unlock audio on the first interaction so later programmatic sounds are allowed.
  const unlock = () => {
    context();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

interface Tone {
  freq: number;
  /** Seconds after the call to start. */
  at?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Frequency to glide to by the end. */
  slideTo?: number;
}

function play(tones: Tone[]) {
  if (muted) return;
  const ac = context();
  if (!ac || ac.state !== 'running') return;
  const now = ac.currentTime;
  for (const t of tones) {
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    const start = now + (t.at ?? 0);
    const peak = t.gain ?? 0.18;
    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.slideTo) osc.frequency.exponentialRampToValueAtTime(t.slideTo, start + t.dur);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(start);
    osc.stop(start + t.dur + 0.02);
  }
}

export const sounds = {
  /** Chip set down on the board: short wooden click. */
  place() {
    play([
      { freq: 1800, dur: 0.045, type: 'triangle', gain: 0.22, slideTo: 900 },
      { freq: 320, dur: 0.11, type: 'sine', gain: 0.16, slideTo: 180 },
    ]);
  },
  /** Chip removed by a one-eyed Jack: low, slightly hollow pop. */
  remove() {
    play([
      { freq: 420, dur: 0.14, type: 'square', gain: 0.07, slideTo: 140 },
      { freq: 150, dur: 0.22, type: 'sine', gain: 0.18, slideTo: 70 },
    ]);
  },
  /** Sequence completed: rising three-note chime. */
  sequence() {
    play([
      { freq: 659, at: 0, dur: 0.35, gain: 0.16 },
      { freq: 880, at: 0.12, dur: 0.4, gain: 0.16 },
      { freq: 1319, at: 0.24, dur: 0.7, gain: 0.18 },
      { freq: 1319 * 2, at: 0.24, dur: 0.5, gain: 0.03 },
    ]);
  },
  /** Game won: the chime plus a resolving chord. */
  victory() {
    play([
      { freq: 523, at: 0, dur: 0.5, gain: 0.14 },
      { freq: 659, at: 0.14, dur: 0.5, gain: 0.14 },
      { freq: 784, at: 0.28, dur: 0.6, gain: 0.14 },
      { freq: 1047, at: 0.42, dur: 1.1, gain: 0.18 },
      { freq: 784, at: 0.42, dur: 1.1, gain: 0.08 },
    ]);
  },
  /** Countdown tick for the final seconds; the last one is higher. */
  tick(final = false) {
    play([{ freq: final ? 1400 : 1000, dur: final ? 0.12 : 0.06, type: 'square', gain: final ? 0.1 : 0.06 }]);
  },
};

export function isMuted() {
  return muted;
}
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(m);
}
export function onMuteChange(fn: (m: boolean) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
