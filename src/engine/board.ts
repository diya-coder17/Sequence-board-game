import type { CardCode } from './cards';

export const BOARD_SIZE = 10;
export const FREE = 'FREE';
export type CellCard = CardCode | typeof FREE;

export interface Pos {
  r: number;
  c: number;
}

/**
 * The official Sequence board layout. Every non-Jack card appears exactly twice;
 * the four corners are free spaces that count for every team.
 */
export const BOARD_LAYOUT: CellCard[][] = [
  ['FREE', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', 'FREE'],
  ['6C', '5C', '4C', '3C', '2C', 'AH', 'KH', 'QH', '10H', '10S'],
  ['7C', 'AS', '2D', '3D', '4D', '5D', '6D', '7D', '9H', 'QS'],
  ['8C', 'KS', '6C', '5C', '4C', '3C', '2C', '8D', '8H', 'KS'],
  ['9C', 'QS', '7C', '6H', '5H', '4H', 'AH', '9D', '7H', 'AS'],
  ['10C', '10S', '8C', '7H', '2H', '3H', 'KH', '10D', '6H', '2D'],
  ['QC', '9S', '9C', '8H', '9H', '10H', 'QH', 'QD', '5H', '3D'],
  ['KC', '8S', '10C', 'QC', 'KC', 'AC', 'AD', 'KD', '4H', '4D'],
  ['AC', '7S', '6S', '5S', '4S', '3S', '2S', '2H', '3H', '5D'],
  ['FREE', 'AD', 'KD', 'QD', '10D', '9D', '8D', '7D', '6D', 'FREE'],
];

export function isCorner(r: number, c: number): boolean {
  return (r === 0 || r === BOARD_SIZE - 1) && (c === 0 || c === BOARD_SIZE - 1);
}

export function cardAt(r: number, c: number): CellCard {
  return BOARD_LAYOUT[r][c];
}

export function posKey(r: number, c: number): string {
  return `${r},${c}`;
}

/** Map from card code to the (two) positions where it appears on the board. */
export const CARD_POSITIONS: Readonly<Record<string, Pos[]>> = (() => {
  const map: Record<string, Pos[]> = {};
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const card = BOARD_LAYOUT[r][c];
      if (card === FREE) continue;
      (map[card] ??= []).push({ r, c });
    }
  }
  return map;
})();

export function positionsFor(card: CardCode): Pos[] {
  return CARD_POSITIONS[card] ?? [];
}
