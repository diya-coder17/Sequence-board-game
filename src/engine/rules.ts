import {
  buildDeck,
  isOneEyedJack,
  isTwoEyedJack,
  makeRng,
  shuffle,
  type CardCode,
} from './cards';
import { BOARD_LAYOUT, FREE, isCorner, positionsFor, type Pos } from './board';
import { emptyGrid, findNewSequences, isInSequence, type ChipGrid, type Sequence } from './sequences';

export type TeamColor = 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'teal' | 'gold' | 'pink';
/** Every chip colour a team may pick. */
export const CHIP_COLORS: TeamColor[] = ['blue', 'green', 'red', 'purple', 'orange', 'teal', 'gold', 'pink'];
/** Default colours for teams 1-3 (classic blue / green / red). */
export const DEFAULT_TEAM_COLORS: TeamColor[] = ['blue', 'green', 'red'];

export interface GameOptions {
  /** Chip colour per team index. Must be distinct. Defaults to blue / green / red. */
  teamColors?: TeamColor[];
  /** Sequences needed to win (1-3). Defaults to the official rule: 2 for 2 teams, 1 for 3 teams. */
  sequencesToWin?: number;
  /** Seconds per turn, 0 = no timer. */
  turnSeconds?: number;
}

export interface PlayerConfig {
  name: string;
  team: number;
  isAI: boolean;
}

export interface Player extends PlayerConfig {
  id: number;
  hand: CardCode[];
}

export interface LastMove {
  playerId: number;
  card: CardCode;
  pos: Pos;
  kind: 'place' | 'remove';
  /** True when the chip was placed with a two-eyed (wild) Jack. */
  wild: boolean;
  /** How many sequences this move completed. */
  sequencesMade: number;
}

export interface GameState {
  seed: number;
  players: Player[];
  teamCount: number;
  teamColors: TeamColor[];
  /** Sequences a team needs to win this game. */
  targetSequences: number;
  /** Seconds allowed per turn (0 = unlimited). */
  turnSeconds: number;
  /** Epoch ms when the current turn began (drives the timer). */
  turnStartedAt: number;
  grid: ChipGrid;
  sequences: Sequence[];
  /** Cells whose chip was placed with a two-eyed Jack (shown to everyone). */
  wildCells: Pos[];
  drawPile: CardCode[];
  discardPile: CardCode[];
  currentPlayer: number;
  /** Whether the current player has already swapped a dead card this turn. */
  deadCardUsed: boolean;
  winner: number | null; // team index
  turn: number;
  lastMove: LastMove | null;
  log: string[];
}

export type Action =
  | { type: 'PLACE'; playerId: number; card: CardCode; pos: Pos }
  | { type: 'REMOVE'; playerId: number; card: CardCode; pos: Pos }
  | { type: 'DEAD_CARD'; playerId: number; card: CardCode };

export const HAND_SIZE: Record<number, number> = {
  2: 7,
  3: 6,
  4: 6,
  6: 5,
  8: 4,
  9: 4,
  10: 3,
  12: 3,
};

export function handSizeFor(playerCount: number): number {
  const size = HAND_SIZE[playerCount];
  if (!size) throw new Error(`Unsupported player count: ${playerCount}`);
  return size;
}

export function sequencesToWin(teamCount: number): number {
  return teamCount === 2 ? 2 : 1;
}

export function validatePlayers(players: PlayerConfig[]): void {
  const n = players.length;
  if (!(n in HAND_SIZE)) throw new Error(`Sequence supports 2, 3, 4, 6, 8, 9, 10 or 12 players (got ${n}).`);
  const teams = new Set(players.map((p) => p.team));
  if (teams.size !== 2 && teams.size !== 3) throw new Error('There must be 2 or 3 teams.');
  if (n % teams.size !== 0) throw new Error('Players must divide evenly among teams.');
  const perTeam = n / teams.size;
  for (const t of teams) {
    if (players.filter((p) => p.team === t).length !== perTeam) throw new Error('Teams must be equal in size.');
  }
  // Turn order must alternate teams (official rule: teammates sit apart).
  for (let i = 0; i < n; i++) {
    if (players[i].team === players[(i + 1) % n].team) {
      throw new Error('Teammates must not sit next to each other in turn order.');
    }
  }
}

export function resolveOptions(teamCount: number, options: GameOptions = {}): Required<GameOptions> {
  const teamColors = (options.teamColors ?? DEFAULT_TEAM_COLORS).slice(0, teamCount);
  if (teamColors.length !== teamCount) throw new Error('Every team needs a colour.');
  if (new Set(teamColors).size !== teamCount) throw new Error('Teams must have different colours.');
  if (teamColors.some((c) => !CHIP_COLORS.includes(c))) throw new Error('Unknown chip colour.');
  const sequences = options.sequencesToWin ?? sequencesToWin(teamCount);
  if (!Number.isInteger(sequences) || sequences < 1 || sequences > 3) throw new Error('Sequences to win must be 1, 2 or 3.');
  const turnSeconds = options.turnSeconds ?? 0;
  if (!Number.isInteger(turnSeconds) || turnSeconds < 0 || turnSeconds > 600) throw new Error('Invalid turn timer.');
  return { teamColors, sequencesToWin: sequences, turnSeconds };
}

export function createGame(configs: PlayerConfig[], seed = Date.now(), options: GameOptions = {}, now = Date.now()): GameState {
  validatePlayers(configs);
  const teamCount = new Set(configs.map((p) => p.team)).size;
  const resolved = resolveOptions(teamCount, options);
  const rng = makeRng(seed);
  const deck = shuffle(buildDeck(), rng);
  const handSize = handSizeFor(configs.length);
  const players: Player[] = configs.map((cfg, id) => ({ ...cfg, id, hand: [] }));
  for (let i = 0; i < handSize; i++) {
    for (const p of players) p.hand.push(deck.pop()!);
  }
  return {
    seed,
    players,
    teamCount,
    teamColors: resolved.teamColors,
    targetSequences: resolved.sequencesToWin,
    turnSeconds: resolved.turnSeconds,
    turnStartedAt: now,
    grid: emptyGrid(),
    sequences: [],
    wildCells: [],
    drawPile: deck,
    discardPile: [],
    currentPlayer: 0,
    deadCardUsed: false,
    winner: null,
    turn: 1,
    lastMove: null,
    log: [
      `Game started. First to ${resolved.sequencesToWin} sequence${resolved.sequencesToWin > 1 ? 's' : ''} wins.` +
        (resolved.turnSeconds ? ` ${resolved.turnSeconds}s per turn.` : ''),
    ],
  };
}

/** A card is dead when every board space showing it already holds a chip. */
export function isDeadCard(state: GameState, card: CardCode): boolean {
  if (isTwoEyedJack(card) || isOneEyedJack(card)) return false;
  const spots = positionsFor(card);
  return spots.length > 0 && spots.every((p) => state.grid[p.r][p.c] !== null);
}

export interface LegalTarget {
  pos: Pos;
  kind: 'place' | 'remove';
}

/** Every board cell the given card could legally act on for the given player. */
export function legalTargets(state: GameState, playerId: number, card: CardCode): LegalTarget[] {
  const player = state.players[playerId];
  if (!player || !player.hand.includes(card)) return [];
  const out: LegalTarget[] = [];

  if (isTwoEyedJack(card)) {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (!isCorner(r, c) && state.grid[r][c] === null) out.push({ pos: { r, c }, kind: 'place' });
      }
    }
    return out;
  }
  if (isOneEyedJack(card)) {
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const owner = state.grid[r][c];
        if (owner !== null && owner !== player.team && !isInSequence(state.sequences, r, c)) {
          out.push({ pos: { r, c }, kind: 'remove' });
        }
      }
    }
    return out;
  }
  for (const pos of positionsFor(card)) {
    if (state.grid[pos.r][pos.c] === null) out.push({ pos, kind: 'place' });
  }
  return out;
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: p.hand.slice() })),
    grid: state.grid.map((row) => row.slice()),
    sequences: state.sequences.map((s) => ({ team: s.team, cells: s.cells.map((c) => ({ ...c })) })),
    wildCells: state.wildCells.map((c) => ({ ...c })),
    drawPile: state.drawPile.slice(),
    discardPile: state.discardPile.slice(),
    log: state.log.slice(),
  };
}

function removeFromHand(player: Player, card: CardCode): void {
  const idx = player.hand.indexOf(card);
  if (idx === -1) throw new Error(`${player.name} does not hold ${card}.`);
  player.hand.splice(idx, 1);
}

function drawCard(state: GameState, player: Player): void {
  if (state.drawPile.length === 0) {
    if (state.discardPile.length === 0) return; // No cards left anywhere; hand shrinks.
    const rng = makeRng(state.seed + state.turn * 7919);
    state.drawPile = shuffle(state.discardPile, rng);
    state.discardPile = [];
    state.log.push('Draw pile exhausted — discards reshuffled.');
  }
  player.hand.push(state.drawPile.pop()!);
}

function endTurn(state: GameState, now: number): void {
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  state.deadCardUsed = false;
  state.turn += 1;
  state.turnStartedAt = now;
}

export class IllegalMoveError extends Error {}

function assertTurn(state: GameState, playerId: number): Player {
  if (state.winner !== null) throw new IllegalMoveError('The game is over.');
  if (state.currentPlayer !== playerId) throw new IllegalMoveError('It is not your turn.');
  return state.players[playerId];
}

/** Pure reducer: returns a new state or throws IllegalMoveError. `now` stamps the next turn's start. */
export function applyAction(prev: GameState, action: Action, now = Date.now()): GameState {
  const state = cloneState(prev);
  const player = assertTurn(state, action.playerId);

  switch (action.type) {
    case 'DEAD_CARD': {
      if (state.deadCardUsed) throw new IllegalMoveError('You already exchanged a dead card this turn.');
      if (!player.hand.includes(action.card)) throw new IllegalMoveError('You do not hold that card.');
      if (!isDeadCard(state, action.card)) throw new IllegalMoveError('That card is not dead.');
      removeFromHand(player, action.card);
      state.discardPile.push(action.card);
      drawCard(state, player);
      state.deadCardUsed = true;
      state.log.push(`${player.name} exchanged a dead card.`);
      return state;
    }
    case 'PLACE': {
      const legal = legalTargets(state, player.id, action.card).some(
        (t) => t.kind === 'place' && t.pos.r === action.pos.r && t.pos.c === action.pos.c,
      );
      if (!legal) throw new IllegalMoveError('You cannot place a chip there with that card.');
      removeFromHand(player, action.card);
      state.discardPile.push(action.card);
      state.grid[action.pos.r][action.pos.c] = player.team;
      const fresh = findNewSequences(state.grid, player.team, action.pos, state.sequences);
      state.sequences.push(...fresh);
      const cellCard = BOARD_LAYOUT[action.pos.r][action.pos.c];
      state.log.push(
        `${player.name} played ${action.card}${isTwoEyedJack(action.card) ? ` (wild) on ${cellCard === FREE ? 'corner' : cellCard}` : ''}.` +
          (fresh.length ? ` SEQUENCE${fresh.length > 1 ? ' ×2' : ''}!` : ''),
      );
      if (isTwoEyedJack(action.card)) state.wildCells.push({ ...action.pos });
      state.lastMove = {
        playerId: player.id,
        card: action.card,
        pos: action.pos,
        kind: 'place',
        wild: isTwoEyedJack(action.card),
        sequencesMade: fresh.length,
      };
      drawCard(state, player);
      const teamSeqs = state.sequences.filter((s) => s.team === player.team).length;
      if (teamSeqs >= state.targetSequences) {
        state.winner = player.team;
        state.log.push(`Team ${player.team + 1} wins!`);
        return state;
      }
      endTurn(state, now);
      return state;
    }
    case 'REMOVE': {
      const legal = legalTargets(state, player.id, action.card).some(
        (t) => t.kind === 'remove' && t.pos.r === action.pos.r && t.pos.c === action.pos.c,
      );
      if (!legal) throw new IllegalMoveError('You cannot remove that chip.');
      removeFromHand(player, action.card);
      state.discardPile.push(action.card);
      state.grid[action.pos.r][action.pos.c] = null;
      state.wildCells = state.wildCells.filter((p) => p.r !== action.pos.r || p.c !== action.pos.c);
      state.log.push(`${player.name} removed a chip with ${action.card} (one-eyed Jack).`);
      state.lastMove = { playerId: player.id, card: action.card, pos: action.pos, kind: 'remove', wild: false, sequencesMade: 0 };
      drawCard(state, player);
      endTurn(state, now);
      return state;
    }
  }
}

/** Does the current player have any legal action at all (used for a forced pass)? */
export function hasAnyMove(state: GameState, playerId: number): boolean {
  const player = state.players[playerId];
  return player.hand.some((card) => legalTargets(state, playerId, card).length > 0 || (!state.deadCardUsed && isDeadCard(state, card)));
}

/** Pass the turn when a player is stuck (all cards dead and already exchanged). */
export function forcePass(prev: GameState, playerId: number, now = Date.now()): GameState {
  const state = cloneState(prev);
  const player = assertTurn(state, playerId);
  if (hasAnyMove(state, playerId)) throw new IllegalMoveError('You still have a legal move.');
  state.log.push(`${player.name} has no legal move and passes.`);
  endTurn(state, now);
  return state;
}

/** True once the current player's clock has run out (never when the timer is off). */
export function isTurnExpired(state: GameState, now = Date.now()): boolean {
  return state.turnSeconds > 0 && state.winner === null && now - state.turnStartedAt >= state.turnSeconds * 1000;
}
