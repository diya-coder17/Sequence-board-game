import type { CardCode, LegalTarget, Pos } from '../../engine';
import type { ClientGameState, HeadToHead, SeatInfo } from '../../net/protocol';
import type { GameEvent } from '../moveText';

/** Everything GameScreen needs, regardless of whether the game runs locally or on a server. */
export interface GameController {
  state: ClientGameState;
  /** Seat whose hand is shown; -1 when nobody's hand should be visible. */
  viewerId: number;
  canAct: boolean;
  waitingText: string | null;
  needsHandoff: boolean;
  banner: string | null;
  event: GameEvent | null;
  error: string | null;
  rematchLabel: string;
  /** Online: names who already asked for a rematch, and whether the viewer did. */
  rematchWanted?: string[];
  rematchVoted?: boolean;
  /** Online: the viewer's record against the opponents in this room (logged-in players only). */
  headToHead?: HeadToHead[] | null;
  roomCode?: string;
  connection?: string;
  /** Online only: who is currently connected. */
  seats?: SeatInfo[];
  roomName?: string;
  /** Local clock reading when the current turn became actionable (drives the countdown). */
  turnStartedLocal: number;

  selectedCard: CardCode | null;
  hoverCard: CardCode | null;
  hoverPos: Pos | null;
  legal: LegalTarget[];
  hints: Pos[];
  deadCards: Set<CardCode>;
  playable: Set<CardCode>;
  stuck: boolean;

  selectCard: (card: CardCode) => void;
  setHoverCard: (card: CardCode | null) => void;
  setHoverPos: (pos: Pos | null) => void;
  clickCell: (pos: Pos) => void;
  exchangeDeadCard: () => void;
  pass: () => void;
  acknowledgeHandoff: () => void;
  rematch: () => void;
}
