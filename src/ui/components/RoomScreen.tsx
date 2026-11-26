import { useState } from 'react';
import { DEFAULT_TEAM_COLORS, sequencesToWin } from '../../engine';
import type { OnlineSession } from '../hooks/useOnlineGame';
import { COLOR_LABEL } from '../gameOptions';

interface Props {
  session: OnlineSession;
}

export function RoomScreen({ session }: Props) {
  const room = session.room!;
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const link = `${location.origin}${location.pathname}?room=${room.code}`;
  const me = room.seats[room.mySeat];
  const full = room.seats.length === room.playerCount;
  // Tolerate an older server that doesn't send options yet.
  const options = room.options ?? { teamColors: DEFAULT_TEAM_COLORS.slice(0, room.teamCount), sequencesToWin: sequencesToWin(room.teamCount), turnSeconds: 0 };

  const copy = async (text: string, what: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      prompt('Copy this:', text);
    }
  };

  return (
    <div className="setup">
      <div className="setup-card">
        <div className="lobby-head">
          <button className="btn btn-ghost btn-sm" onClick={session.leaveRoom}>
            ← Leave room
          </button>
          <span className="pill">
            {room.playerCount} players · {room.teamCount} teams
          </span>
        </div>
        <h1 style={{ fontSize: 30, color: 'var(--gold-300)' }}>{room.name}</h1>
        <p className="subtitle">Share the code or the link. The game starts when all seats are filled.</p>

        <div className="share-box">
          <div>
            <span className="field-label">Room code</span>
            <div className="room-code">{room.code}</div>
          </div>
          <div className="share-actions">
            <button className="btn" onClick={() => copy(room.code, 'code')}>
              {copied === 'code' ? 'Copied!' : 'Copy code'}
            </button>
            <button className="btn btn-primary" onClick={() => copy(link, 'link')}>
              {copied === 'link' ? 'Link copied!' : 'Copy invite link'}
            </button>
          </div>
          <div className="share-link">{link}</div>
        </div>

        <div className="option-summary">
          <span className="pill">
            First to {options.sequencesToWin} sequence{options.sequencesToWin > 1 ? 's' : ''}
          </span>
          <span className="pill">{options.turnSeconds ? `${options.turnSeconds}s per turn` : 'No turn timer'}</span>
          {options.teamColors.map((c, i) => (
            <span className="pill" key={c}>
              <span className={`chip ${c} inline-chip`} /> Team {i + 1}: {COLOR_LABEL[c]}
            </span>
          ))}
        </div>

        <span className="field-label" style={{ marginTop: 22 }}>
          Seats ({room.seats.length}/{room.playerCount})
        </span>
        <div className="player-list">
          {Array.from({ length: room.playerCount }, (_, i) => {
            const seat = room.seats[i];
            const team = i % room.teamCount;
            return (
              <div className={`player-row seat ${seat ? '' : 'empty'}`} key={i}>
                <span className={`chip ${options.teamColors[team]} inline-chip`} />
                <span className="seat-name">
                  {seat ? seat.name : 'Waiting for a player…'}
                  {seat?.isHost && <span className="pill tiny">Host</span>}
                  {seat && i === room.mySeat && <span className="pill tiny">You</span>}
                  {seat && !seat.connected && <span className="pill tiny warn">Disconnected</span>}
                </span>
                <span className="seat-team">Team {team + 1}</span>
              </div>
            );
          })}
        </div>

        <div className="setup-footer">
          <span className="error-text">{session.error ?? ''}</span>
          {me?.isHost ? (
            <button className="btn btn-primary" disabled={!full} onClick={session.startGame}>
              {full ? 'Start game' : `Waiting for ${room.playerCount - room.seats.length} more…`}
            </button>
          ) : (
            <span className="rules-summary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="spinner" /> Waiting for the host to start…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
