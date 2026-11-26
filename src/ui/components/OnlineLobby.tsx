import { useState } from 'react';
import { DEFAULT_TEAM_COLORS, sequencesToWin } from '../../engine';
import { toGameOptions, type OptionsValue } from '../gameOptions';
import { GameOptionsPanel } from './GameOptionsPanel';
import { AccountPanel } from './AccountPanel';
import { ONLINE_PLAYER_COUNTS } from '../../net/protocol';
import type { OnlineSession } from '../hooks/useOnlineGame';

interface Props {
  session: OnlineSession;
  initialCode: string | null;
  onBack: () => void;
}

const STATUS_TEXT: Record<string, string> = {
  connecting: 'Connecting to server…',
  reconnecting: 'Reconnecting…',
  closed: 'Offline',
  open: 'Connected',
};

export function OnlineLobby({ session, initialCode, onBack }: Props) {
  // Local draft; falls back to the server-confirmed name until the user types.
  const [typedName, setTypedName] = useState<string | null>(null);
  const draftName = typedName ?? session.name;
  const setDraftName = setTypedName;
  const [code, setCode] = useState(initialCode ?? '');
  const [playerCount, setPlayerCount] = useState(2);
  const [teamCount, setTeamCount] = useState(2);
  const [tab, setTab] = useState<'quick' | 'create' | 'join'>(initialCode ? 'join' : 'quick');
  const [roomName, setRoomName] = useState('');
  const [options, setOptions] = useState<OptionsValue>({ teamColors: DEFAULT_TEAM_COLORS.slice(), sequencesToWin: 2, turnSeconds: 0 });
  const [customSequences, setCustomSequences] = useState(false);
  const connected = session.status === 'open';
  const nameOk = draftName.trim().length > 0;
  const teamOptions = [2, 3].filter((t) => playerCount % t === 0);
  const effectiveTeams = teamOptions.includes(teamCount) ? teamCount : teamOptions[0];
  const officialSequences = sequencesToWin(effectiveTeams);
  const effectiveOptions: OptionsValue = { ...options, sequencesToWin: customSequences ? options.sequencesToWin : officialSequences };

  const commitName = () => {
    if (draftName.trim() && draftName.trim() !== session.name) session.setName(draftName);
  };
  const guard = (fn: () => void) => () => {
    commitName();
    fn();
  };

  return (
    <div className="setup">
      <div className="setup-card wide">
        <div className="lobby-head">
          <button className="btn btn-ghost btn-sm" onClick={onBack}>
            ← Back
          </button>
          <span className={`pill conn ${session.status}`}>
            <i />
            {STATUS_TEXT[session.status]}
            {connected && session.online > 0 ? ` · ${session.online} online` : ''}
          </span>
        </div>
        <div className="brand">
          <div className="brand-logo" aria-hidden>
            <i /><i /><i /><i />
          </div>
          <h1>Play online</h1>
        </div>
        <p className="subtitle">Pick a name, then find an opponent or set up a room for your friends.</p>

        <label className="field-label" htmlFor="player-name">
          Your name
        </label>
        <input
          id="player-name"
          className="text-input"
          value={draftName}
          maxLength={16}
          placeholder="e.g. Diya"
          disabled={!!session.user}
          title={session.user ? 'Signed-in players use their account name' : undefined}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
        />

        <AccountPanel session={session} />

        <div className="tabs">
          <button className={tab === 'quick' ? 'active' : ''} onClick={() => setTab('quick')}>
            Quick match
          </button>
          <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>
            Create room
          </button>
          <button className={tab === 'join' ? 'active' : ''} onClick={() => setTab('join')}>
            Join with code
          </button>
        </div>

        {tab === 'quick' && (
          <div className="tab-panel">
            <p className="rules-summary">
              We pair you with the next player who is looking for a game. Two players, two teams, first to two sequences.
            </p>
            {session.searching ? (
              <div className="searching">
                <span className="spinner" /> Searching for an opponent… {session.waiting > 1 ? `(${session.waiting} in queue)` : ''}
                <button className="btn btn-sm" onClick={session.cancelQuickMatch}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn btn-primary" disabled={!connected || !nameOk} onClick={guard(session.quickMatch)}>
                Find an opponent
              </button>
            )}
          </div>
        )}

        {tab === 'create' && (
          <div className="tab-panel">
            <label className="field-label" htmlFor="room-name">
              Room name
            </label>
            <input
              id="room-name"
              className="text-input"
              value={roomName}
              maxLength={32}
              placeholder={`${draftName.trim() || 'Your'}'s theatre room`}
              onChange={(e) => setRoomName(e.target.value)}
            />
            <span className="field-label">Players</span>
            <div className="segmented">
              {ONLINE_PLAYER_COUNTS.map((n) => (
                <button key={n} className={n === playerCount ? 'active' : ''} onClick={() => setPlayerCount(n)}>
                  {n}
                </button>
              ))}
            </div>
            <span className="field-label" style={{ marginTop: 16 }}>
              Teams
            </span>
            <div className="segmented">
              {[2, 3].map((t) => (
                <button key={t} className={t === effectiveTeams ? 'active' : ''} disabled={!teamOptions.includes(t)} onClick={() => setTeamCount(t)}>
                  {t} teams
                </button>
              ))}
            </div>
            <GameOptionsPanel
              teamCount={effectiveTeams}
              value={effectiveOptions}
              defaultSequences={officialSequences}
              onChange={(next) => {
                setOptions(next);
                setCustomSequences(true);
              }}
            />
            <p className="rules-summary" style={{ marginTop: 4 }}>
              You'll get a room code and a link to share. The game starts when every seat is filled.
            </p>
            <button
              className="btn btn-primary"
              disabled={!connected || !nameOk}
              onClick={guard(() => session.createRoom(roomName, playerCount, effectiveTeams, toGameOptions(effectiveOptions, effectiveTeams)))}
            >
              Create private room
            </button>
          </div>
        )}

        {tab === 'join' && (
          <div className="tab-panel">
            <label className="field-label" htmlFor="room-code">
              Room code
            </label>
            <div className="join-row">
              <input
                id="room-code"
                className="text-input code"
                value={code}
                maxLength={6}
                placeholder="ABC123"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && guard(() => session.joinRoom(code))()}
              />
              <button className="btn btn-primary" disabled={!connected || !nameOk || code.length !== 6} onClick={guard(() => session.joinRoom(code))}>
                Join room
              </button>
            </div>
          </div>
        )}

        {session.error && <p className="error-text" style={{ marginTop: 14 }}>{session.error}</p>}
        {session.status !== 'open' && session.status !== 'connecting' && (
          <p className="error-text" style={{ marginTop: 14 }}>
            Can't reach the game server. It may be waking up — this can take up to a minute on free hosting.
          </p>
        )}
      </div>
    </div>
  );
}
