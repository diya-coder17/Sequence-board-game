import { describe, expect, it } from 'vitest';
import {
  IllegalMoveError,
  applyAction,
  createGame,
  forcePass,
  handSizeFor,
  isDeadCard,
  isTurnExpired,
  legalTargets,
  sequencesToWin,
  validatePlayers,
  type GameState,
  type PlayerConfig,
} from '../rules';
import { positionsFor } from '../board';
import type { CardCode } from '../cards';

const two: PlayerConfig[] = [
  { name: 'A', team: 0, isAI: false },
  { name: 'B', team: 1, isAI: false },
];

/** Force a specific hand onto a player for deterministic tests. */
function giveHand(state: GameState, playerId: number, hand: CardCode[]): GameState {
  const s = structuredClone(state);
  s.players[playerId].hand = hand;
  return s;
}

describe('setup', () => {
  it('deals the correct hand size', () => {
    expect(handSizeFor(2)).toBe(7);
    expect(handSizeFor(3)).toBe(6);
    expect(handSizeFor(4)).toBe(6);
    expect(handSizeFor(6)).toBe(5);
    expect(handSizeFor(12)).toBe(3);
    const g = createGame(two, 1);
    expect(g.players[0].hand).toHaveLength(7);
    expect(g.drawPile).toHaveLength(104 - 14);
  });

  it('is deterministic for a seed', () => {
    expect(createGame(two, 42).players[0].hand).toEqual(createGame(two, 42).players[0].hand);
  });

  it('requires 2 or 3 sequences accordingly', () => {
    expect(sequencesToWin(2)).toBe(2);
    expect(sequencesToWin(3)).toBe(1);
  });

  it('applies game options and validates them', () => {
    const g = createGame(two, 1, { teamColors: ['red', 'blue'], sequencesToWin: 3, turnSeconds: 30 }, 1000);
    expect(g.teamColors).toEqual(['red', 'blue']);
    expect(g.targetSequences).toBe(3);
    expect(g.turnSeconds).toBe(30);
    expect(g.turnStartedAt).toBe(1000);
    expect(createGame(two, 1).targetSequences).toBe(2);
    expect(createGame(two, 1).teamColors).toEqual(['blue', 'green']);
    expect(() => createGame(two, 1, { teamColors: ['blue', 'blue'] })).toThrow(/different/);
    expect(() => createGame(two, 1, { sequencesToWin: 4 })).toThrow(/1, 2 or 3/);
    expect(() => createGame(two, 1, { turnSeconds: -5 })).toThrow(/timer/);
  });

  it('a custom sequences-to-win target ends the game accordingly', () => {
    let g = createGame(two, 1, { sequencesToWin: 1 });
    for (let c = 1; c <= 3; c++) g.grid[0][c] = 0;
    g = giveHand(g, 0, ['JD', '3S', '4S', '5S', '6S', '7S', '8S']);
    g = applyAction(g, { type: 'PLACE', playerId: 0, card: 'JD', pos: { r: 0, c: 4 } });
    expect(g.winner).toBe(0);
  });

  it('tracks turn start time and expiry', () => {
    let g = createGame(two, 1, { turnSeconds: 30 }, 0);
    expect(isTurnExpired(g, 29_999)).toBe(false);
    expect(isTurnExpired(g, 30_000)).toBe(true);
    g = giveHand(g, 0, ['2S', '3S', '4S', '5S', '6S', '7S', '8S']);
    g = applyAction(g, { type: 'PLACE', playerId: 0, card: '2S', pos: positionsFor('2S')[0] }, 5_000);
    expect(g.turnStartedAt).toBe(5_000);
    expect(isTurnExpired(createGame(two, 1, {}, 0), 10 ** 9)).toBe(false);
  });

  it('rejects bad team arrangements', () => {
    expect(() => validatePlayers([{ name: 'a', team: 0, isAI: false }, { name: 'b', team: 0, isAI: false }])).toThrow();
    expect(() =>
      validatePlayers([
        { name: 'a', team: 0, isAI: false },
        { name: 'b', team: 0, isAI: false },
        { name: 'c', team: 1, isAI: false },
        { name: 'd', team: 1, isAI: false },
      ]),
    ).toThrow(/next to each other|equal/);
    expect(() =>
      validatePlayers([
        { name: 'a', team: 0, isAI: false },
        { name: 'b', team: 1, isAI: false },
        { name: 'c', team: 0, isAI: false },
        { name: 'd', team: 1, isAI: false },
      ]),
    ).not.toThrow();
  });
});

describe('placing chips', () => {
  it('places on a matching card space, draws, and advances the turn', () => {
    let g = giveHand(createGame(two, 1), 0, ['2S', '3S', '4S', '5S', '6S', '7S', '8S']);
    const pos = positionsFor('2S')[0];
    g = applyAction(g, { type: 'PLACE', playerId: 0, card: '2S', pos });
    expect(g.grid[pos.r][pos.c]).toBe(0);
    expect(g.players[0].hand).toHaveLength(7);
    expect(g.players[0].hand).not.toContain('2S');
    expect(g.currentPlayer).toBe(1);
    expect(g.discardPile).toEqual(['2S']);
  });

  it('refuses out-of-turn and mismatched plays', () => {
    const g = giveHand(createGame(two, 1), 0, ['2S', '3S', '4S', '5S', '6S', '7S', '8S']);
    expect(() => applyAction(g, { type: 'PLACE', playerId: 1, card: g.players[1].hand[0], pos: { r: 1, c: 1 } })).toThrow(IllegalMoveError);
    expect(() => applyAction(g, { type: 'PLACE', playerId: 0, card: '2S', pos: positionsFor('3S')[0] })).toThrow(IllegalMoveError);
    expect(() => applyAction(g, { type: 'PLACE', playerId: 0, card: 'KD', pos: positionsFor('KD')[0] })).toThrow(/does not hold|cannot/);
  });

  it('refuses an occupied space', () => {
    let g = giveHand(createGame(two, 1), 0, ['2S', '3S', '4S', '5S', '6S', '7S', '8S']);
    const pos = positionsFor('2S')[0];
    g = applyAction(g, { type: 'PLACE', playerId: 0, card: '2S', pos });
    g = giveHand(g, 1, ['2S', '3S', '4S', '5S', '6S', '7S', '8S']);
    expect(() => applyAction(g, { type: 'PLACE', playerId: 1, card: '2S', pos })).toThrow(IllegalMoveError);
    expect(legalTargets(g, 1, '2S')).toHaveLength(1);
  });
});

describe('jacks', () => {
  it('two-eyed jack can go on any empty non-corner space', () => {
    const g = giveHand(createGame(two, 1), 0, ['JD', 'JC', '4S', '5S', '6S', '7S', '8S']);
    const targets = legalTargets(g, 0, 'JD');
    expect(targets).toHaveLength(96);
    expect(targets.every((t) => t.kind === 'place')).toBe(true);
  });

  it('one-eyed jack removes an opponent chip but not own chips or protected ones', () => {
    let g = giveHand(createGame(two, 1), 0, ['2S', '3S', '4S', '5S', '6S', '7S', '8S']);
    const pos = positionsFor('2S')[0];
    g = applyAction(g, { type: 'PLACE', playerId: 0, card: '2S', pos });
    g = giveHand(g, 1, ['JS', 'JH', '4S', '5S', '6S', '7S', '8S']);
    const targets = legalTargets(g, 1, 'JS');
    expect(targets).toEqual([{ pos, kind: 'remove' }]);
    g = applyAction(g, { type: 'REMOVE', playerId: 1, card: 'JS', pos });
    expect(g.grid[pos.r][pos.c]).toBeNull();
    expect(g.currentPlayer).toBe(0);
  });

  it('one-eyed jack cannot touch a chip inside a completed sequence', () => {
    let g = createGame(two, 1);
    // Build team 0 a row on row 0: cells (0,1)..(0,4) + corner.
    for (let c = 1; c <= 4; c++) g.grid[0][c] = 0;
    g = giveHand(g, 0, ['JD', '3S', '4S', '5S', '6S', '7S', '8S']);
    g.grid[0][4] = null;
    g = applyAction(g, { type: 'PLACE', playerId: 0, card: 'JD', pos: { r: 0, c: 4 } });
    expect(g.sequences).toHaveLength(1);
    g = giveHand(g, 1, ['JS', 'JH', '4S', '5S', '6S', '7S', '8S']);
    expect(legalTargets(g, 1, 'JS').some((t) => t.pos.r === 0)).toBe(false);
  });
});

describe('wild-jack visibility', () => {
  it('records wild placements so every player can see them', () => {
    let g = giveHand(createGame(two, 1), 0, ['JD', 'JC', '4S', '5S', '6S', '7S', '8S']);
    g = applyAction(g, { type: 'PLACE', playerId: 0, card: 'JD', pos: { r: 4, c: 4 } });
    expect(g.wildCells).toEqual([{ r: 4, c: 4 }]);
    expect(g.lastMove).toMatchObject({ wild: true, kind: 'place', card: 'JD' });
    g = giveHand(g, 1, ['JS', 'JH', '4S', '5S', '6S', '7S', '8S']);
    g = applyAction(g, { type: 'REMOVE', playerId: 1, card: 'JS', pos: { r: 4, c: 4 } });
    expect(g.wildCells).toEqual([]);
    expect(g.lastMove).toMatchObject({ wild: false, kind: 'remove', removedTeam: 0 });
  });
});

describe('dead cards', () => {
  it('detects a dead card and allows one exchange per turn', () => {
    let g = createGame(two, 1);
    for (const p of positionsFor('2S')) g.grid[p.r][p.c] = 1;
    g = giveHand(g, 0, ['2S', '3S', '4S', '5S', '6S', '7S', '8S']);
    expect(isDeadCard(g, '2S')).toBe(true);
    expect(isDeadCard(g, '3S')).toBe(false);
    expect(isDeadCard(g, 'JD')).toBe(false);
    g = applyAction(g, { type: 'DEAD_CARD', playerId: 0, card: '2S' });
    expect(g.currentPlayer).toBe(0); // still your turn
    expect(g.players[0].hand).toHaveLength(7);
    expect(g.deadCardUsed).toBe(true);
    for (const p of positionsFor('3S')) g.grid[p.r][p.c] = 1;
    expect(() => applyAction(g, { type: 'DEAD_CARD', playerId: 0, card: '3S' })).toThrow(/already/);
  });

  it('forcePass only works when truly stuck', () => {
    const g = createGame(two, 1);
    expect(() => forcePass(g, 0)).toThrow(IllegalMoveError);
  });
});

describe('winning', () => {
  it('2 teams need two sequences; the second ends the game', () => {
    let g = createGame(two, 1);
    for (let c = 1; c <= 4; c++) g.grid[0][c] = 0; // first row w/ corner
    for (let c = 1; c <= 3; c++) g.grid[9][c] = 0; // bottom row w/ corner, missing (9,4)
    g = giveHand(g, 0, ['JD', 'JC', '4S', '5S', '6S', '7S', '8S']);
    // complete first sequence
    g.grid[0][4] = null;
    g = applyAction(g, { type: 'PLACE', playerId: 0, card: 'JD', pos: { r: 0, c: 4 } });
    expect(g.winner).toBeNull();
    expect(g.currentPlayer).toBe(1);
    g = giveHand(g, 1, ['2S', '3S', '4S', '5S', '6S', '7S', '8S']);
    g = applyAction(g, { type: 'PLACE', playerId: 1, card: '5S', pos: positionsFor('5S')[1] });
    g = giveHand(g, 0, ['JC', '4S', '5S', '6S', '7S', '8S', '9S']);
    g = applyAction(g, { type: 'PLACE', playerId: 0, card: 'JC', pos: { r: 9, c: 4 } });
    expect(g.sequences.filter((s) => s.team === 0)).toHaveLength(2);
    expect(g.winner).toBe(0);
    expect(() => applyAction(g, { type: 'PLACE', playerId: 1, card: '2S', pos: positionsFor('2S')[0] })).toThrow(/over/);
  });

  it('3 teams need a single sequence', () => {
    const three: PlayerConfig[] = [
      { name: 'A', team: 0, isAI: false },
      { name: 'B', team: 1, isAI: false },
      { name: 'C', team: 2, isAI: false },
    ];
    let g = createGame(three, 3);
    for (let c = 1; c <= 3; c++) g.grid[0][c] = 2;
    g.currentPlayer = 2;
    g = giveHand(g, 2, ['JD', '4S', '5S', '6S', '7S', '8S']);
    g = applyAction(g, { type: 'PLACE', playerId: 2, card: 'JD', pos: { r: 0, c: 4 } });
    expect(g.winner).toBe(2);
  });
});
