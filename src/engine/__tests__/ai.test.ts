import { describe, expect, it } from 'vitest';
import { chooseAIMove } from '../ai';
import { applyAction, createGame, forcePass, hasAnyMove, type PlayerConfig } from '../rules';
import { makeRng } from '../cards';

const cfg: PlayerConfig[] = [
  { name: 'Bot 1', team: 0, isAI: true },
  { name: 'Bot 2', team: 1, isAI: true },
];

describe('AI', () => {
  it('takes a winning move when available', () => {
    let g = createGame(cfg, 5);
    for (let c = 1; c <= 4; c++) g.grid[0][c] = 0;
    g.grid[0][4] = null;
    g.players[0].hand = ['JD', '2S', '3S', '4S', '5S', '6S', '7S'];
    g.sequences = [{ team: 0, cells: [8, 7, 6, 5, 4].map((c) => ({ r: 9, c })) }];
    const move = chooseAIMove(g, makeRng(1));
    expect(move).toMatchObject({ type: 'PLACE', pos: { r: 0, c: 4 } });
    g = applyAction(g, move!);
    expect(g.winner).toBe(0);
  });

  it('blocks an opponent about to complete a sequence', () => {
    const g = createGame(cfg, 5);
    for (let c = 1; c <= 4; c++) g.grid[0][c] = 1; // enemy threatens (0,5) = 6S
    g.players[0].hand = ['6S', 'KC', 'KD', 'QD', '9D', 'AD', '8C'];
    const move = chooseAIMove(g, makeRng(1));
    expect(move).toMatchObject({ type: 'PLACE', card: '6S', pos: { r: 0, c: 5 } });
  });

  it('plays a full game between two bots to completion', () => {
    let g = createGame(cfg, 2024);
    const rng = makeRng(9);
    let guard = 0;
    while (g.winner === null && guard++ < 600) {
      const move = chooseAIMove(g, rng);
      if (!move) {
        expect(hasAnyMove(g, g.currentPlayer)).toBe(false);
        g = forcePass(g, g.currentPlayer);
        continue;
      }
      g = applyAction(g, move);
    }
    expect(g.winner).not.toBeNull();
    expect(g.sequences.filter((s) => s.team === g.winner)).toHaveLength(2);
  });
});
