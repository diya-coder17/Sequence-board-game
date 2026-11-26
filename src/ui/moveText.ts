import { BOARD_LAYOUT, cardLabel, type GameState } from '../engine';

export type EventKind = 'info' | 'wild' | 'remove' | 'sequence' | 'warning';
export interface GameEvent {
  id: number;
  kind: EventKind;
  message: string;
}

/** Human-readable description of the last move, flagging Jacks explicitly. */
export function describeLastMove(state: GameState): { kind: EventKind; message: string } | null {
  const m = state.lastMove;
  if (!m) return null;
  const who = state.players[m.playerId]?.name ?? 'Someone';
  const cell = BOARD_LAYOUT[m.pos.r][m.pos.c];
  const cellName = cell === 'FREE' ? 'a corner' : cardLabel(cell);
  if (m.kind === 'remove') return { kind: 'remove', message: `${who} used a one-eyed Jack ${cardLabel(m.card)} to remove a chip from ${cellName}` };
  if (m.wild) return { kind: 'wild', message: `${who} played a two-eyed Jack ${cardLabel(m.card)} as a wild card on ${cellName}` };
  if (m.sequencesMade > 0) return { kind: 'sequence', message: `${who} played ${cardLabel(m.card)} and completed a sequence` };
  return { kind: 'info', message: `${who} played ${cardLabel(m.card)}` };
}
