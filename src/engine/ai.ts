import { isOneEyedJack, isTwoEyedJack, type CardCode } from './cards';
import { BOARD_SIZE, isCorner, type Pos } from './board';
import { ownedBy, type ChipGrid } from './sequences';
import { isDeadCard, legalTargets, sequencesToWin, type Action, type GameState } from './rules';

const DIRS: Pos[] = [
  { r: 0, c: 1 },
  { r: 1, c: 0 },
  { r: 1, c: 1 },
  { r: 1, c: -1 },
];

function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

/**
 * Score how valuable cell (r,c) is for `team`, assuming a chip is placed there.
 * For each of the 4 directions we slide every 5-window containing the cell and
 * count windows that have no enemy chip; a window with k friendly chips is worth
 * roughly 10^k, so near-complete lines dominate.
 */
function lineValue(grid: ChipGrid, team: number, r: number, c: number): number {
  let total = 0;
  for (const d of DIRS) {
    for (let offset = -4; offset <= 0; offset++) {
      let friendly = 0;
      let blocked = false;
      for (let k = 0; k < 5; k++) {
        const rr = r + (offset + k) * d.r;
        const cc = c + (offset + k) * d.c;
        if (!inBounds(rr, cc)) {
          blocked = true;
          break;
        }
        if (rr === r && cc === c) continue;
        if (ownedBy(grid, team, rr, cc)) friendly++;
        else if (grid[rr][cc] !== null && !isCorner(rr, cc)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) total += Math.pow(10, friendly);
    }
  }
  return total;
}

function withChip(grid: ChipGrid, r: number, c: number, team: number | null): ChipGrid {
  const g = grid.map((row) => row.slice());
  g[r][c] = team;
  return g;
}

function completesSequence(grid: ChipGrid, team: number, r: number, c: number): boolean {
  const g = withChip(grid, r, c, team);
  for (const d of DIRS) {
    let run = 1;
    for (const sign of [1, -1]) {
      let rr = r + sign * d.r;
      let cc = c + sign * d.c;
      while (inBounds(rr, cc) && ownedBy(g, team, rr, cc)) {
        run++;
        rr += sign * d.r;
        cc += sign * d.c;
      }
    }
    if (run >= 5) return true;
  }
  return false;
}

interface Candidate {
  action: Action;
  score: number;
}

/**
 * Choose a move for the current (AI) player. Heuristic:
 *  - Winning placement: enormous bonus.
 *  - Offensive value of the cell + defensive value (what the best enemy team would gain).
 *  - One-eyed Jack: remove the enemy chip that currently has the highest line value for them.
 *  - Two-eyed Jacks are saved unless they complete a sequence or clearly outclass other plays.
 *  - Dead cards get exchanged first.
 */
export function chooseAIMove(state: GameState, rng: () => number = Math.random): Action | null {
  const player = state.players[state.currentPlayer];
  const team = player.team;
  const enemies = [...new Set(state.players.map((p) => p.team))].filter((t) => t !== team);

  if (!state.deadCardUsed) {
    const dead = player.hand.find((card) => isDeadCard(state, card));
    if (dead) return { type: 'DEAD_CARD', playerId: player.id, card: dead };
  }

  const candidates: Candidate[] = [];
  const mySeqs = state.sequences.filter((s) => s.team === team).length;
  const needed = sequencesToWin(state.teamCount);

  for (const card of new Set(player.hand)) {
    for (const target of legalTargets(state, player.id, card)) {
      const { r, c } = target.pos;
      let score = 0;
      if (target.kind === 'place') {
        const wins = completesSequence(state.grid, team, r, c);
        if (wins) score += mySeqs + 1 >= needed ? 1_000_000 : 50_000;
        score += lineValue(state.grid, team, r, c);
        // Defensive value: how much would the strongest enemy want this cell?
        let enemyBest = 0;
        for (const e of enemies) {
          if (completesSequence(state.grid, e, r, c)) enemyBest = Math.max(enemyBest, 40_000);
          enemyBest = Math.max(enemyBest, lineValue(state.grid, e, r, c) * 0.8);
        }
        score += enemyBest;
        if (isTwoEyedJack(card)) score -= wins ? 0 : 600; // keep wilds for when they matter
      } else {
        // Removing an enemy chip: value it by how much that chip is worth to them.
        const owner = state.grid[r][c]!;
        const gridWithout = withChip(state.grid, r, c, null);
        const threat = lineValue(gridWithout, owner, r, c);
        const theirNextWin = completesSequence(gridWithout, owner, r, c) ? 30_000 : 0;
        score += theirNextWin + threat * 0.9 - 400; // slight penalty: removal doesn't build our lines
        if (isOneEyedJack(card) && threat < 100) score -= 5000; // don't waste it on junk
      }
      score += rng() * 15; // tie-breaker noise so games aren't identical
      candidates.push({
        action: { type: target.kind === 'place' ? 'PLACE' : 'REMOVE', playerId: player.id, card: card as CardCode, pos: target.pos },
        score,
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].action;
}
