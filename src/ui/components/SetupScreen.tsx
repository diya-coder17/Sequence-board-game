import { useMemo, useState } from 'react';
import { DEFAULT_TEAM_COLORS, HAND_SIZE, sequencesToWin, validatePlayers, type GameOptions, type PlayerConfig } from '../../engine';
import { toGameOptions, type OptionsValue } from '../gameOptions';
import { GameOptionsPanel } from './GameOptionsPanel';

interface Props {
  onStart: (players: PlayerConfig[], options: GameOptions) => void;
  onBack: () => void;
}

const PLAYER_COUNTS = Object.keys(HAND_SIZE).map(Number);
const DEFAULT_NAMES = ['Alex', 'Sam', 'Jordan', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Quinn', 'Avery', 'Drew', 'Jamie', 'Reese'];

interface Seat {
  name: string;
  isAI: boolean;
}

export function SetupScreen({ onStart, onBack }: Props) {
  const [count, setCount] = useState(2);
  const [teams, setTeams] = useState(2);
  const [seats, setSeats] = useState<Seat[]>(() => [
    { name: 'You', isAI: false },
    { name: 'Computer', isAI: true },
  ]);
  const [options, setOptions] = useState<OptionsValue>({ teamColors: DEFAULT_TEAM_COLORS.slice(), sequencesToWin: 2, turnSeconds: 0 });
  const [customSequences, setCustomSequences] = useState(false);

  const teamOptions = useMemo(() => [2, 3].filter((t) => count % t === 0), [count]);
  const effectiveTeams = teamOptions.includes(teams) ? teams : teamOptions[0];
  const officialSequences = sequencesToWin(effectiveTeams);
  const effectiveOptions: OptionsValue = { ...options, sequencesToWin: customSequences ? options.sequencesToWin : officialSequences };

  const players: PlayerConfig[] = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        name: (seats[i]?.name ?? DEFAULT_NAMES[i]).trim() || DEFAULT_NAMES[i],
        team: i % effectiveTeams,
        isAI: seats[i]?.isAI ?? i !== 0,
      })),
    [count, effectiveTeams, seats],
  );

  const error = useMemo(() => {
    try {
      validatePlayers(players);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [players]);

  const update = (i: number, patch: Partial<Seat>) =>
    setSeats((prev) => {
      const next = players.map((p, idx) => prev[idx] ?? { name: p.name, isAI: p.isAI });
      next[i] = { ...next[i], ...patch };
      return next;
    });

  const changeCount = (n: number) => {
    setCount(n);
    setSeats((prev) =>
      Array.from({ length: n }, (_, i) => prev[i] ?? { name: i === 0 ? 'You' : i === 1 ? 'Computer' : DEFAULT_NAMES[i], isAI: i !== 0 }),
    );
  };

  return (
    <div className="setup">
      <div className="setup-card wide">
        <div className="lobby-head">
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            ← Back
          </button>
          <span className="pill">Same device</span>
        </div>
        <div className="brand">
          <div className="brand-logo" aria-hidden>
            <i /><i /><i /><i />
          </div>
          <h1>Sequence</h1>
        </div>
        <p className="subtitle">The classic strategy game of cards and chips. Five in a row makes a sequence.</p>

        <div className="setup-grid">
          <div>
            <span className="field-label">Players</span>
            <div className="segmented">
              {PLAYER_COUNTS.map((n) => (
                <button key={n} className={n === count ? 'active' : ''} onClick={() => changeCount(n)}>
                  {n}
                </button>
              ))}
            </div>

            <span className="field-label" style={{ marginTop: 18 }}>
              Teams
            </span>
            <div className="segmented">
              {[2, 3].map((t) => (
                <button key={t} className={t === effectiveTeams ? 'active' : ''} disabled={!teamOptions.includes(t)} onClick={() => setTeams(t)}>
                  {t} teams
                </button>
              ))}
            </div>

            <div className="player-list">
              {players.map((p, i) => (
                <div className="player-row" key={i} style={{ animationDelay: `${i * 30}ms` }}>
                  <span className={`chip ${effectiveOptions.teamColors[p.team]} inline-chip`} title={`Team ${p.team + 1}`} />
                  <input value={seats[i]?.name ?? p.name} onChange={(e) => update(i, { name: e.target.value })} aria-label={`Player ${i + 1} name`} maxLength={16} />
                  <div className="toggle">
                    <button className={!p.isAI ? 'active' : ''} onClick={() => update(i, { isAI: false })}>
                      Human
                    </button>
                    <button className={p.isAI ? 'active' : ''} onClick={() => update(i, { isAI: true })}>
                      AI
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <GameOptionsPanel
              teamCount={effectiveTeams}
              value={effectiveOptions}
              defaultSequences={officialSequences}
              onChange={(next) => {
                setOptions(next);
                setCustomSequences(true);
              }}
            />
            <p className="rules-summary" style={{ marginTop: 14 }}>
              Each player holds <strong>{HAND_SIZE[count]} cards</strong>. Two-eyed Jacks are wild, one-eyed Jacks remove a chip, free corners count for everyone.
            </p>
          </div>
        </div>

        <div className="setup-footer">
          <span className="error-text">{error ?? ''}</span>
          <button className="btn btn-primary" disabled={!!error} onClick={() => onStart(players, toGameOptions(effectiveOptions, effectiveTeams))}>
            Start game
          </button>
        </div>
      </div>
    </div>
  );
}
