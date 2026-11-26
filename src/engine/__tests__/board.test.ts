import { describe, expect, it } from 'vitest';
import { BOARD_LAYOUT, CARD_POSITIONS, FREE, isCorner } from '../board';
import { RANKS, SUITS, buildDeck } from '../cards';

describe('board layout', () => {
  it('is 10x10 with free corners', () => {
    expect(BOARD_LAYOUT).toHaveLength(10);
    for (const row of BOARD_LAYOUT) expect(row).toHaveLength(10);
    expect(BOARD_LAYOUT[0][0]).toBe(FREE);
    expect(BOARD_LAYOUT[0][9]).toBe(FREE);
    expect(BOARD_LAYOUT[9][0]).toBe(FREE);
    expect(BOARD_LAYOUT[9][9]).toBe(FREE);
    expect(isCorner(0, 0) && isCorner(9, 9) && !isCorner(0, 1)).toBe(true);
  });

  it('shows every non-Jack card exactly twice and no Jacks', () => {
    for (const s of SUITS) {
      for (const r of RANKS) {
        const card = `${r}${s}`;
        if (r === 'J') expect(CARD_POSITIONS[card]).toBeUndefined();
        else expect(CARD_POSITIONS[card], card).toHaveLength(2);
      }
    }
    expect(Object.keys(CARD_POSITIONS)).toHaveLength(48);
  });

  it('uses two full decks (104 cards)', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(104);
    expect(deck.filter((c) => c === 'JD')).toHaveLength(2);
  });
});
