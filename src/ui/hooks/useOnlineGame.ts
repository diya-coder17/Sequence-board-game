import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action, GameOptions } from '../../engine';
import { GameClient, type ConnectionStatus } from '../../net/client';
import type { ClientGameState, RoomInfo } from '../../net/protocol';
import type { GameEvent } from '../moveText';
import type { GameController } from './controller';
import { useSelection } from './useSelection';

export interface OnlineSession {
  status: ConnectionStatus;
  online: number;
  name: string;
  room: RoomInfo | null;
  state: ClientGameState | null;
  searching: boolean;
  waiting: number;
  error: string | null;
  event: GameEvent | null;
  setName: (name: string) => void;
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
          setError(m.message);
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

  const dispatch = useCallback((action: Action) => client.send({ type: 'action', action }), [client]);
  const fallback = useMemo(() => emptyState(), []);
  const live = state ?? fallback;
  const canAct = !!state && state.winner === null && state.currentPlayer === mySeat;
  const sel = useSelection(live, Math.max(mySeat, 0), canAct, dispatch);

  const setName = useCallback(
    (n: string) => {
      const clean = n.trim().slice(0, 16);
      if (!clean) return;
      client.setName(clean);
      setNameState(clean);
    },
    [client],
  );

  const controller: GameController | null = useMemo(() => {
    if (!state || !room) return null;
    const current = state.players[state.currentPlayer];
    return {
      state,
      viewerId: mySeat,
      canAct,
      waitingText: state.winner === null && !canAct ? `Waiting for ${current.name}…` : null,
      needsHandoff: false,
      banner,
      event,
      error,
      rematchLabel: 'Rematch',
      roomCode: room.isPrivate ? room.code : undefined,
      roomName: room.name,
      seats: room.seats,
      turnStartedLocal,
      connection: status === 'open' ? undefined : status,
      ...sel,
      pass: () => client.send({ type: 'pass' }),
      acknowledgeHandoff: () => {},
      rematch: () => client.send({ type: 'rematch' }),
    };
  }, [state, room, mySeat, canAct, banner, event, error, status, sel, client, turnStartedLocal]);

  return {
    status,
    online,
    name,
    room,
    state,
    searching,
    waiting,
    error,
    event,
    setName,
    createRoom: (name, playerCount, teamCount, options) => client.send({ type: 'create_room', name, playerCount, teamCount, options }),
    joinRoom: (code) => client.send({ type: 'join_room', code: code.trim().toUpperCase() }),
    leaveRoom: () => client.send({ type: 'leave_room' }),
    quickMatch: () => client.send({ type: 'quick_match' }),
    cancelQuickMatch: () => client.send({ type: 'cancel_quick_match' }),
    startGame: () => client.send({ type: 'start_game' }),
    controller,
  };
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
