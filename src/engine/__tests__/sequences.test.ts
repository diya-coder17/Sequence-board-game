import { describe, expect, it } from 'vitest';
import { emptyGrid, findNewSequences, type Sequence } from '../sequences';

describe('findNewSequences', () => {
  it('detects a horizontal five', () => {
    const g = emptyGrid();
    for (let c = 1; c <= 5; c++) g[3][c] = 0;
    const seqs = findNewSequences(g, 0, { r: 3, c: 5 }, []);
    expect(seqs).toHaveLength(1);
    expect(seqs[0].cells).toHaveLength(5);
  });

  it('uses a free corner as a wild chip', () => {
    const g = emptyGrid();
    for (let c = 1; c <= 4; c++) g[0][c] = 1; // (0,0) is a corner
    expect(findNewSequences(g, 1, { r: 0, c: 4 }, [])).toHaveLength(1);
  });

  it('detects diagonals', () => {
    const g = emptyGrid();
    for (let i = 2; i <= 6; i++) g[i][i] = 0;
    expect(findNewSequences(g, 0, { r: 4, c: 4 }, [])).toHaveLength(1);
    const h = emptyGrid();
    for (let i = 0; i < 5; i++) h[2 + i][8 - i] = 2;
    expect(findNewSequences(h, 2, { r: 6, c: 4 }, [])).toHaveLength(1);
  });

  it('does not report four in a row or another team’s chips', () => {
    const g = emptyGrid();
    for (let c = 1; c <= 4; c++) g[5][c] = 0;
    g[5][5] = 1;
    expect(findNewSequences(g, 0, { r: 5, c: 4 }, [])).toHaveLength(0);
  });

  it('allows a second sequence to share exactly one chip with the first', () => {
    const g = emptyGrid();
    for (let c = 1; c <= 5; c++) g[4][c] = 0;
    const first = findNewSequences(g, 0, { r: 4, c: 5 }, []);
    expect(first).toHaveLength(1);
    // Extend to 9 in a row: cells 1..9 -> second sequence 5..9 shares cell 5.
    for (let c = 6; c <= 9; c++) g[4][c] = 0;
    const second = findNewSequences(g, 0, { r: 4, c: 9 }, first);
    expect(second).toHaveLength(1);
    expect(second[0].cells.map((p) => p.c)).toEqual([5, 6, 7, 8, 9]);
  });

  it('does not count a second sequence that overlaps two locked chips', () => {
    const g = emptyGrid();
    for (let c = 1; c <= 5; c++) g[4][c] = 0;
    const existing: Sequence[] = findNewSequences(g, 0, { r: 4, c: 5 }, []);
    for (let c = 6; c <= 8; c++) g[4][c] = 0; // now 1..8, window 4..8 would reuse two locked
    expect(findNewSequences(g, 0, { r: 4, c: 8 }, existing)).toHaveLength(0);
  });

  it('awards two sequences at once for a ten-long line placed in the middle', () => {
    const g = emptyGrid();
    for (let c = 0; c <= 9; c++) if (c !== 4) g[2][c] = 0;
    g[2][4] = 0;
    const seqs = findNewSequences(g, 0, { r: 2, c: 4 }, []);
    expect(seqs).toHaveLength(2);
  });
});
