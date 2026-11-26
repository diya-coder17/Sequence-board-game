import { useEffect, useRef } from 'react';
import { TEAM_COLORS, sequencesToWin } from '../../engine';
import type { ClientGameState, SeatInfo } from '../../net/protocol';

interface Props {
  state: ClientGameState;
  viewerId: number;
  thinking: boolean;
  seats?: SeatInfo[];
}

const TEAM_LABEL = ['Blue', 'Green', 'Red'];

export function Sidebar({ state, viewerId, thinking, seats }: Props) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.log.length]);

  const needed = sequencesToWin(state.teamCount);
  const seqByTeam = (team: number) => state.sequences.filter((s) => s.team === team).length;

  return (
    <aside className="sidebar">
      <div className="panel">
        <h3>Players</h3>
        {state.players.map((p) => {
          const active = p.id === state.currentPlayer && state.winner === null;
          const color = TEAM_COLORS[p.team];
          return (
            <div key={p.id} className={`player-card ${active ? 'active' : ''}`}>
              <div className="avatar" style={{ background: `var(--team-${color})` }}>
                {p.name.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="name">
                  {p.name}
                  {p.isAI && <span className="pill tiny">AI</span>}
                  {p.id === viewerId && !p.isAI && <span className="pill tiny">You</span>}
                  {seats && seats[p.id] && !seats[p.id].connected && <span className="pill tiny warn">Offline</span>}
                  {active && thinking && <span className="spinner" />}
                </div>
                <div className="meta">
                  Team {TEAM_LABEL[p.team]} · {state.handCounts[p.id] ?? p.hand.length} cards
                </div>
              </div>
              <div className="seq-dots" title={`${seqByTeam(p.team)} of ${needed} sequences`}>
                {Array.from({ length: needed }, (_, i) => (
                  <i key={i} className={i < seqByTeam(p.team) ? 'filled' : ''} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel deck-row">
        <div className="deck-stack" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="deck-meta">
          <b>{state.drawCount}</b>
          cards to draw · {state.discardCount} discarded
        </div>
      </div>

      <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <h3>Game log</h3>
        <div className="log" ref={logRef}>
          {state.log.slice(-60).map((line, i) => (
            <div key={`${state.log.length}-${i}`} className={`entry ${line.includes('SEQUENCE') || line.includes('wins') ? 'seq' : line.includes('wild') || line.includes('one-eyed') ? 'jack' : ''}`}>
              {line}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
