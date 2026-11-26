import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, GameOptions } from '../../engine';
import { GameClient, type ConnectionStatus } from '../../net/client';
import type { ClientGameState, HeadToHead, PublicUser, RoomInfo } from '../../net/protocol';
import type { GameEvent } from '../moveText';
import type { GameController } from './controller';
import { useSelection } from './useSelection';

export interface OnlineSession {
  status: ConnectionStatus;
  online: number;
  name: string;
  user: PublicUser | null;
  stats: HeadToHead[];
  authError: string | null;
  authBusy: boolean;
  room: RoomInfo | null;
  state: ClientGameState | null;
  searching: boolean;
  waiting: number;
  error: string | null;
  event: GameEvent | null;
  setName: (name: string) => void;
  register: (username: string, password: string) => void;
  login: (username: string, password: string) => void;
  logout: () => void;
  createRoom: (name: string, playerCount: number, teamCount: number, options: GameOptions) => void;
  joinRoom: (code: string) => void;
  leaveRoom: () => void;
  quickMatch: () => void;
  cancelQuickMatch: () => void;
  startGame: () => void;
  controller: GameController | null;
}

/** Owns the socket and mirrors server state; builds a GameController once a game is running. */
export function useOnlineGame(): OnlineSession {
  const [client] = useState(() => new GameClient());

  const [status, setStatus] = useState<ConnectionStatus>('closed');
  const [online, setOnline] = useState(0);
  const [name, setNameState] = useState(client.name);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [stats, setStats] = useState<HeadToHead[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [state, setState] = useState<ClientGameState | null>(null);
  const [mySeat, setMySeat] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<GameEvent | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [turnStartedLocal, setTurnStartedLocal] = useState(() => Date.now());
  const prevSeq = useRef(0);
  const eventId = useRef(0);

  useEffect(() => {
    const offStatus = client.onStatus(setStatus);
    const offMsg = client.onMessage((m) => {
      switch (m.type) {
        case 'welcome':
          setOnline(m.online);
          setNameState(m.name);
          setUser(m.user);
          break;
        case 'auth':
          setAuthBusy(false);
          setUser(m.user);
          if (m.user) setNameState(m.user.username);
          if (!m.user) setStats([]);
          if (m.message) setAuthError(m.message);
          break;
        case 'stats':
          setStats(m.entries);
          break;
        case 'room':
          setRoom(m.room);
          setMySeat(m.room.mySeat);
          if (m.room.status === 'waiting') setState(null);
          break;
        case 'state':
          setState((prev) => {
            if (!prev || prev.turn !== m.state.turn || prev.seed !== m.state.seed) setTurnStartedLocal(Date.now());
            return m.state;
          });
          setMySeat(m.mySeat);
          break;
        case 'left':
          setRoom(null);
          setState(null);
          setMySeat(-1);
          prevSeq.current = 0;
          break;
        case 'queue':
          setSearching(m.searching);
          setWaiting(m.waiting);
          break;
        case 'event':
          setEvent({ id: ++eventId.current, kind: m.kind, message: m.message });
          break;
        case 'error':
          setAuthBusy(false);
          if (/username|password|taken|sign in/i.test(m.message)) setAuthError(m.message);
          else setError(m.message);
          // The server lost track of us (restart / stale tab): ask for the current picture.
          if (/No game in progress|not in a room/i.test(m.message)) client.send({ type: 'resync' });
          break;
      }
    });
    // Deferred so React StrictMode's throw-away first mount never opens a socket.
    const t = setTimeout(() => client.connect(), 0);
    return () => {
      clearTimeout(t);
      offStatus();
      offMsg();
      client.close();
    };
  }, [client]);

  useEffect(() => {
    if (!event) return;
    const t = setTimeout(() => setEvent(null), event.kind === 'info' ? 3500 : 6000);
    return () => clearTimeout(t);
  }, [event]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 2600);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!state) return;
    if (state.sequences.length > prevSeq.current) {
      setBanner(state.winner !== null ? (state.winner === state.players[mySeat]?.team ? 'VICTORY' : 'DEFEAT') : 'SEQUENCE!');
      const t = setTimeout(() => setBanner(null), 1600);
      prevSeq.current = state.sequences.length;
      return () => clearTimeout(t);
    }
    prevSeq.current = state.sequences.length;
  }, [state, mySeat]);

  const dispatch = useCallback(
    (action: Action) => {
      if (!client.send({ type: 'action', action })) setError('Not connected — reconnecting…');
    },
    [client],
  );
  const fallback = useMemo(() => emptyState(), []);
  const live = state ?? fallback;
  const canAct = !!state && state.winner === null && state.currentPlayer === mySeat && status === 'open';
  const sel = useSelection(live, Math.max(mySeat, 0), canAct, dispatch);

  const setName = useCallback(
    (n: string) => {
      const clean = n.trim().slice(0, 16);
      if (!clean || user) return;
      client.setName(clean);
      setNameState(clean);
    },
    [client, user],
  );

  const controller: GameController | null = useMemo(() => {
    if (!state || !room) return null;
    const current = state.players[state.currentPlayer];
    const me = state.players[mySeat];
    const iWant = !!me && room.rematchWanted.includes(me.name);
    return {
      state,
      viewerId: mySeat,
      canAct,
      waitingText: state.winner === null && !canAct ? (status === 'open' ? `Waiting for ${current.name}…` : 'Reconnecting…') : null,
      needsHandoff: false,
      banner,
      event,
      error,
      rematchLabel: iWant ? `Waiting for others (${room.rematchWanted.length}/${room.seats.length})` : room.rematchWanted.length ? 'Accept rematch' : 'Rematch',
      rematchWanted: room.rematchWanted,
      rematchVoted: iWant,
      roomCode: room.isPrivate ? room.code : undefined,
      roomName: room.name,
      seats: room.seats,
      turnStartedLocal,
      connection: status === 'open' ? undefined : status,
      headToHead: me?.id !== undefined ? headToHeadFor(stats, room, mySeat) : null,
      ...sel,
      pass: () => client.send({ type: 'pass' }),
      acknowledgeHandoff: () => {},
      rematch: () => client.send({ type: 'rematch' }),
    };
  }, [state, room, mySeat, canAct, banner, event, error, status, sel, client, turnStartedLocal, stats]);

  return {
    status,
    online,
    name,
    user,
    stats,
    authError,
    authBusy,
    room,
    state,
    searching,
    waiting,
    error,
    event,
    setName,
    register: (username, password) => {
      setAuthError(null);
      setAuthBusy(true);
      if (!client.send({ type: 'register', username, password })) setAuthBusy(false);
    },
    login: (username, password) => {
      setAuthError(null);
      setAuthBusy(true);
      if (!client.send({ type: 'login', username, password })) setAuthBusy(false);
    },
    logout: () => {
      client.clearSession();
      client.send({ type: 'logout' });
    },
    createRoom: (roomName, playerCount, teamCount, options) => client.send({ type: 'create_room', name: roomName, playerCount, teamCount, options }),
    joinRoom: (code) => client.send({ type: 'join_room', code: code.trim().toUpperCase() }),
    leaveRoom: () => client.send({ type: 'leave_room' }),
    quickMatch: () => client.send({ type: 'quick_match' }),
    cancelQuickMatch: () => client.send({ type: 'cancel_quick_match' }),
    startGame: () => client.send({ type: 'start_game' }),
    controller,
  };
}

/** Record against the opponents in this room, if both sides are logged in. */
function headToHeadFor(stats: HeadToHead[], room: RoomInfo, mySeat: number): HeadToHead[] | null {
  const me = room.seats[mySeat];
  if (!me?.userId) return null;
  const others = room.seats.filter((s, i) => i !== mySeat && s.userId);
  const rows = others.map((s) => stats.find((h) => h.opponentId === s.userId)).filter((h): h is HeadToHead => !!h);
  return rows.length ? rows : null;
}

function emptyState(): ClientGameState {
  return {
    seed: 0,
    players: [],
    teamCount: 2,
    teamColors: ['blue', 'green'],
    targetSequences: 2,
    turnSeconds: 0,
    turnStartedAt: 0,
    grid: Array.from({ length: 10 }, () => Array(10).fill(null)),
    sequences: [],
    wildCells: [],
    drawPile: [],
    discardPile: [],
    currentPlayer: -1,
    deadCardUsed: false,
    winner: null,
    turn: 0,
    lastMove: null,
    log: [],
    handCounts: [],
    drawCount: 0,
    discardCount: 0,
  };
}
