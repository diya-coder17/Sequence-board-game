import { BOARD_SIZE, isCorner, type Pos } from './board';

export const SEQUENCE_LENGTH = 5;

/** Chip grid: null = empty, otherwise a team index. */
export type ChipGrid = (number | null)[][];

export interface Sequence {
  team: number;
  cells: Pos[];
}

const DIRECTIONS: Pos[] = [
  { r: 0, c: 1 }, // horizontal
  { r: 1, c: 0 }, // vertical
  { r: 1, c: 1 }, // diagonal down-right
  { r: 1, c: -1 }, // diagonal down-left
];

export function emptyGrid(): ChipGrid {
  return Array.from({ length: BOARD_SIZE }, () => Array<number | null>(BOARD_SIZE).fill(null));
}

/** Whether the cell at (r,c) counts as `team`'s chip (corners are wild for everyone). */
export function ownedBy(grid: ChipGrid, team: number, r: number, c: number): boolean {
  if (isCorner(r, c)) return true;
  return grid[r][c] === team;
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function cellKey(p: Pos): string {
  return `${p.r},${p.c}`;
}

/**
 * Find every new sequence that `team` completes which involves the cell `placed`.
 * Rules: a sequence is 5 in a row; two sequences by the same team may share at most
 * one chip, so each run can only reuse one cell already locked in an existing sequence.
 *
 * A run of 9 (e.g. 10 chips in a line) yields two sequences sharing the middle cell.
 */
export function findNewSequences(
  grid: ChipGrid,
  team: number,
  placed: Pos,
  existing: Sequence[],
): Sequence[] {
  const locked = new Set<string>();
  for (const s of existing) if (s.team === team) for (const cell of s.cells) locked.add(cellKey(cell));

  const found: Sequence[] = [];

  for (const dir of DIRECTIONS) {
    // Walk to the start of this team's run through `placed`.
    let start = { ...placed };
    while (true) {
      const nr = start.r - dir.r;
      const nc = start.c - dir.c;
      if (!inBounds(nr, nc) || !ownedBy(grid, team, nr, nc)) break;
      start = { r: nr, c: nc };
    }
    const run: Pos[] = [];
    let cur = { ...start };
    while (inBounds(cur.r, cur.c) && ownedBy(grid, team, cur.r, cur.c)) {
      run.push(cur);
      cur = { r: cur.r + dir.r, c: cur.c + dir.c };
    }
    if (run.length < SEQUENCE_LENGTH) continue;

    // Greedily carve sequences out of the run. Each window may contain at most one
    // locked cell and must include the newly placed chip to count as "new".
    let i = 0;
    const newlyLocked = new Set<string>();
    while (i + SEQUENCE_LENGTH <= run.length) {
      const window = run.slice(i, i + SEQUENCE_LENGTH);
      const lockedCount = window.filter((p) => locked.has(cellKey(p)) || newlyLocked.has(cellKey(p))).length;
      const includesPlaced = window.some((p) => p.r === placed.r && p.c === placed.c);
      if (lockedCount <= 1 && includesPlaced) {
        found.push({ team, cells: window });
        for (const p of window) newlyLocked.add(cellKey(p));
        // Next window may share exactly this window's last cell.
        i += SEQUENCE_LENGTH - 1;
      } else {
        i += 1;
      }
    }
  }
  return found;
}

/** True if (r,c) is part of any completed sequence (chips there are protected). */
export function isInSequence(sequences: Sequence[], r: number, c: number): boolean {
  return sequences.some((s) => s.cells.some((p) => p.r === r && p.c === c));
}
