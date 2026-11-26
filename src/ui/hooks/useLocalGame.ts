import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IllegalMoveError,
  applyAction,
  chooseAIMove,
  createGame,
  forcePass,
  hasAnyMove,
  type Action,
  type GameOptions,
  type GameState,
  type PlayerConfig,
} from '../../engine';
import { toClientState } from '../../net/protocol';
import { describeLastMove, type GameEvent } from '../moveText';
import type { GameController } from './controller';
import { useSelection } from './useSelection';

const AI_DELAY_MS = 900;

/** Local play: humans sharing one screen and/or AI opponents. */
export function useLocalGame(configs: PlayerConfig[], options: GameOptions = {}): GameController {
  const [state, setState] = useState<GameState>(() => createGame(configs, Date.now(), options));
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [event, setEvent] = useState<GameEvent | null>(null);
  const [handoffAck, setHandoffAck] = useState(0);
  // Clock reading for when the current human turn became actionable. Updated from the event
  // handlers that hand a turn to a human: the AI's move, the pass-the-device acknowledgement,
  // the timer's auto-play, and a rematch.
  const [turnStartedLocal, setTurnStartedLocal] = useState(() => Date.now());
  const prevSeqCount = useRef(0);
  const eventId = useRef(0);

  const current = state.players[state.currentPlayer];
  const humanCount = state.players.filter((p) => !p.isAI).length;
  const isHumanTurn = !current.isAI && state.winner === null;
  const needsHandoff = isHumanTurn && humanCount > 1 && handoffAck !== current.id;
  const viewerId = state.winner !== null ? -1 : current.isAI ? -1 : current.id;

  useEffect(() => {
    if (!event) return;
    const t = setTimeout(() => setEvent(null), event.kind === 'info' ? 3500 : 6000);
    return () => clearTimeout(t);
  }, [event]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 2200);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (state.sequences.length > prevSeqCount.current) {
      setBanner(state.winner !== null ? 'VICTORY' : 'SEQUENCE!');
      const t = setTimeout(() => setBanner(null), 1600);
      prevSeqCount.current = state.sequences.length;
      return () => clearTimeout(t);
    }
    prevSeqCount.current = state.sequences.length;
  }, [state.sequences.length, state.winner]);

  // Announce the previous move to whoever is looking now (AI moves, or the other human after a handoff).
  useEffect(() => {
    const d = describeLastMove(state);
    if (!d || !state.lastMove) return;
    const mover = state.players[state.lastMove.playerId];
    const audienceIsOther = mover.isAI || humanCount > 1;
    if (!audienceIsOther || needsHandoff) return;
    setEvent({ id: ++eventId.current, ...d });
  }, [state.turn, needsHandoff]); // eslint-disable-line react-hooks/exhaustive-deps

  const dispatch = useCallback((action: Action) => {
    setState((prev) => {
      try {
        return applyAction(prev, action);
      } catch (e) {
        if (e instanceof IllegalMoveError) setError(e.message);
        else throw e;
        return prev;
      }
    });
  }, []);

  useEffect(() => {
    if (state.winner !== null || !current.isAI) return;
    const t = setTimeout(() => {
      setState((prev) => {
        const move = chooseAIMove(prev);
        if (!move) return hasAnyMove(prev, prev.currentPlayer) ? prev : forcePass(prev, prev.currentPlayer);
        return applyAction(prev, move);
      });
      setTurnStartedLocal(Date.now());
    }, AI_DELAY_MS);
    return () => clearTimeout(t);
  }, [state.currentPlayer, state.turn, state.winner, current.isAI]);

  const canAct = isHumanTurn && !needsHandoff;
  const sel = useSelection(state, current.id, canAct, dispatch);


  // Turn timer: when a human runs out of time, play a sensible move for them (or pass).
  useEffect(() => {
    if (!canAct || state.turnSeconds <= 0) return;
    const t = setTimeout(() => {
      setState((prev) => {
        if (prev.winner !== null || prev.currentPlayer !== current.id) return prev;
        const move = chooseAIMove(prev);
        const next = move ? applyAction(prev, move) : hasAnyMove(prev, prev.currentPlayer) ? prev : forcePass(prev, prev.currentPlayer);
        next.log.push(`${current.name} ran out of time — a move was played automatically.`);
        return next;
      });
      setEvent({ id: ++eventId.current, kind: 'timeout', message: `${current.name} ran out of time — a move was played automatically.` });
      setTurnStartedLocal(Date.now());
    }, state.turnSeconds * 1000);
    return () => clearTimeout(t);
  }, [canAct, state.turnSeconds, state.turn, current.id, current.name]);

  const pass = useCallback(() => {
    setState((prev) => {
      try {
        return forcePass(prev, prev.currentPlayer);
      } catch (e) {
        if (e instanceof IllegalMoveError) setError(e.message);
        return prev;
      }
    });
  }, []);
  const acknowledgeHandoff = useCallback(() => {
    setHandoffAck(current.id);
    setTurnStartedLocal(Date.now());
  }, [current.id]);
  const rematch = useCallback(() => {
    setState(createGame(configs, Date.now(), options));
    setTurnStartedLocal(Date.now());
    setHandoffAck(0);
    setEvent(null);
    prevSeqCount.current = 0;
  }, [configs, options]);

  const view = useMemo(() => toClientState(state, viewerId), [state, viewerId]);

  return {
    state: view,
    viewerId,
    canAct,
    turnStartedLocal,
    waitingText: current.isAI && state.winner === null ? `${current.name} is thinking…` : null,
    needsHandoff,
    banner,
    event,
    error,
    rematchLabel: 'Rematch',
    ...sel,
    pass,
    acknowledgeHandoff,
    rematch,
  };
}
