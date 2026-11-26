import { useState } from 'react';
import { TEAM_COLORS, sequencesToWin } from '../../engine';
import type { OnlineSession } from '../hooks/useOnlineGame';

interface Props {
  session: OnlineSession;
}

const TEAM_LABEL = ['Blue', 'Green', 'Red'];

export function RoomScreen({ session }: Props) {
  const room = session.room!;
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const link = `${location.origin}${location.pathname}?room=${room.code}`;
  const me = room.seats[room.mySeat];
  const full = room.seats.length === room.playerCount;

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
            {room.playerCount} players · {room.teamCount} teams · first to {sequencesToWin(room.teamCount)}
          </span>
        </div>
        <h1 style={{ fontSize: 30, color: 'var(--gold-300)' }}>Private room</h1>
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

        <span className="field-label" style={{ marginTop: 22 }}>
          Seats ({room.seats.length}/{room.playerCount})
        </span>
        <div className="player-list">
          {Array.from({ length: room.playerCount }, (_, i) => {
            const seat = room.seats[i];
            const team = i % room.teamCount;
            return (
              <div className={`player-row seat ${seat ? '' : 'empty'}`} key={i}>
                <span className="team-dot" style={{ background: `var(--team-${TEAM_COLORS[team]})` }} />
                <span className="seat-name">
                  {seat ? seat.name : 'Waiting for a player…'}
                  {seat?.isHost && <span className="pill tiny">Host</span>}
                  {seat && i === room.mySeat && <span className="pill tiny">You</span>}
                  {seat && !seat.connected && <span className="pill tiny warn">Disconnected</span>}
                </span>
                <span className="seat-team">Team {TEAM_LABEL[team]}</span>
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
