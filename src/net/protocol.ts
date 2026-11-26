/** Messages exchanged between the browser and the game server. Shared by both sides. */
import type { Action, GameOptions, GameState, PlayerConfig } from '../engine';

export interface SeatInfo {
  name: string;
  team: number;
  connected: boolean;
  isHost: boolean;
  /** Account id when the player is logged in. */
  userId: string | null;
}

export interface PublicUser {
  id: string;
  username: string;
}

export interface HeadToHead {
  opponentId: string;
  opponent: string;
  games: number;
  wins: number;
  losses: number;
  lastPlayedAt: number;
}

export interface RoomInfo {
  code: string;
  name: string;
  playerCount: number;
  teamCount: number;
  options: Required<GameOptions>;
  seats: SeatInfo[];
  status: 'waiting' | 'playing' | 'finished';
  isPrivate: boolean;
  mySeat: number;
  /** Names of players who have asked for a rematch (finished games only). */
  rematchWanted: string[];
}

/**
 * GameState as seen by one client: other players' hands are stripped and the piles are
 * emptied (only their sizes are sent). It stays structurally a GameState so the engine's
 * read-only helpers (legalTargets, isDeadCard, hasAnyMove) work on it unchanged.
 */
export type ClientGameState = GameState & {
  handCounts: number[];
  drawCount: number;
  discardCount: number;
};

export type ClientMessage =
  | { type: 'hello'; token: string | null; name: string; session: string | null }
  | { type: 'register'; username: string; password: string }
  | { type: 'login'; username: string; password: string }
  | { type: 'logout' }
  | { type: 'stats' }
  | { type: 'ping' }
  | { type: 'resync' }
  | { type: 'set_name'; name: string }
  | { type: 'create_room'; name: string; playerCount: number; teamCount: number; options: GameOptions }
  | { type: 'join_room'; code: string }
  | { type: 'leave_room' }
  | { type: 'quick_match' }
  | { type: 'cancel_quick_match' }
  | { type: 'start_game' }
  | { type: 'action'; action: Action }
  | { type: 'pass' }
  | { type: 'rematch' };

export type ServerMessage =
  | { type: 'welcome'; token: string; name: string; online: number; user: PublicUser | null }
  | { type: 'auth'; user: PublicUser | null; session: string | null; message?: string }
  | { type: 'stats'; entries: HeadToHead[] }
  | { type: 'pong' }
  | { type: 'room'; room: RoomInfo }
  | { type: 'state'; state: ClientGameState; mySeat: number }
  | { type: 'left' }
  | { type: 'queue'; searching: boolean; waiting: number }
  | { type: 'event'; kind: 'info' | 'wild' | 'remove' | 'sequence' | 'warning' | 'timeout'; message: string }
  | { type: 'error'; message: string };

export const ONLINE_PLAYER_COUNTS = [2, 3, 4, 6] as const;

export function roomPlayerConfigs(seats: SeatInfo[]): PlayerConfig[] {
  return seats.map((s) => ({ name: s.name, team: s.team, isAI: false }));
}

/** Strip hidden information for a given seat. */
export function toClientState(state: GameState, seat: number): ClientGameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: p.id === seat ? p.hand : [] })),
    drawPile: [],
    discardPile: [],
    handCounts: state.players.map((p) => p.hand.length),
    drawCount: state.drawPile.length,
    discardCount: state.discardPile.length,
  };
}
