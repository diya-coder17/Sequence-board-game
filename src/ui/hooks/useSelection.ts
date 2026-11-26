import { useCallback, useMemo, useState } from 'react';
import {
  hasAnyMove,
  isDeadCard,
  isJack,
  legalTargets,
  positionsFor,
  type Action,
  type CardCode,
  type GameState,
  type LegalTarget,
  type Pos,
} from '../../engine';

/** Card selection + legal-target logic shared by local and online play. */
export function useSelection(state: GameState, playerId: number, enabled: boolean, dispatch: (a: Action) => void) {
  const [rawSelected, setSelectedCard] = useState<CardCode | null>(null);
  const [hoverCard, setHoverCard] = useState<CardCode | null>(null);
  const [hoverPos, setHoverPos] = useState<Pos | null>(null);
  const player = state.players[playerId];
  // A selection is only meaningful while the card is still in hand and the player may act.
  const selectedCard = rawSelected && enabled && player?.hand.includes(rawSelected) ? rawSelected : null;

  const legal = useMemo<LegalTarget[]>(
    () => (enabled && selectedCard && player ? legalTargets(state, playerId, selectedCard) : []),
    [state, playerId, selectedCard, enabled, player],
  );
  const hints = useMemo(() => (enabled && !selectedCard && hoverCard && !isJack(hoverCard) ? positionsFor(hoverCard) : []), [hoverCard, selectedCard, enabled]);
  const deadCards = useMemo(() => {
    const s = new Set<CardCode>();
    if (!enabled || !player || state.deadCardUsed) return s;
    for (const c of player.hand) if (isDeadCard(state, c)) s.add(c);
    return s;
  }, [state, player, enabled]);
  const playable = useMemo(() => {
    const s = new Set<CardCode>();
    if (!enabled || !player) return s;
    for (const c of player.hand) if (legalTargets(state, playerId, c).length > 0) s.add(c);
    return s;
  }, [state, player, playerId, enabled]);
  const stuck = enabled && !!player && !hasAnyMove(state, playerId);

  const selectCard = useCallback((card: CardCode) => setSelectedCard((prev) => (prev === card ? null : card)), []);
  const clickCell = useCallback(
    (pos: Pos) => {
      if (!selectedCard || !enabled) return;
      const t = legal.find((x) => x.pos.r === pos.r && x.pos.c === pos.c);
      if (!t) return;
      dispatch({ type: t.kind === 'place' ? 'PLACE' : 'REMOVE', playerId, card: selectedCard, pos });
      setSelectedCard(null);
      setHoverPos(null);
    },
    [selectedCard, enabled, legal, dispatch, playerId],
  );
  const exchangeDeadCard = useCallback(() => {
    if (!selectedCard) return;
    dispatch({ type: 'DEAD_CARD', playerId, card: selectedCard });
    setSelectedCard(null);
  }, [selectedCard, dispatch, playerId]);

  return { selectedCard, hoverCard, hoverPos, legal, hints, deadCards, playable, stuck, selectCard, setHoverCard, setHoverPos, clickCell, exchangeDeadCard };
}
