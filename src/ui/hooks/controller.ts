import type { CardCode, LegalTarget, Pos } from '../../engine';
import type { ClientGameState, SeatInfo } from '../../net/protocol';
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
  roomCode?: string;
  connection?: string;
  /** Online only: who is currently connected. */
  seats?: SeatInfo[];

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
