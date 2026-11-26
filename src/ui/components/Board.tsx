import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import {
  BOARD_LAYOUT,
  FREE,
  posKey,
  type GameState,
  type LegalTarget,
  type Pos,
} from '../../engine';
import { CardFace } from './CardFace';
import { Chip } from './Chip';

interface Props {
  state: GameState;
  legal: LegalTarget[];
  /** Cells matching the hovered hand card (soft hint when nothing is selected). */
  hints: Pos[];
  hoverPos: Pos | null;
  onHover: (pos: Pos | null) => void;
  onCellClick: (pos: Pos) => void;
  previewTeam: number;
}

export function Board({ state, legal, hints, hoverPos, onHover, onCellClick, previewTeam }: Props) {
  const legalMap = useMemo(() => {
    const m = new Map<string, LegalTarget>();
    for (const t of legal) m.set(posKey(t.pos.r, t.pos.c), t);
    return m;
  }, [legal]);
  const hintSet = useMemo(() => new Set(hints.map((p) => posKey(p.r, p.c))), [hints]);
  const seqSet = useMemo(() => {
    const s = new Set<string>();
    for (const seq of state.sequences) for (const c of seq.cells) s.add(posKey(c.r, c.c));
    return s;
  }, [state.sequences]);
  const wildSet = useMemo(() => new Set(state.wildCells.map((p) => posKey(p.r, p.c))), [state.wildCells]);
  const dimOthers = legal.length > 0;

  return (
    <div className="board-wrap">
      <div className="board-frame">
        <div className="board" role="grid" aria-label="Sequence board">
          {BOARD_LAYOUT.map((row, r) =>
            row.map((card, c) => {
              const key = posKey(r, c);
              const owner = state.grid[r][c];
              const target = legalMap.get(key);
              const isLast = !!state.lastMove && state.lastMove.pos.r === r && state.lastMove.pos.c === c;
              const lastKind = isLast ? state.lastMove!.kind : null;
              const hovering = hoverPos && hoverPos.r === r && hoverPos.c === c;
              const cls = [
                'cell',
                card === FREE ? 'free' : '',
                target ? 'legal' : '',
                target?.kind === 'remove' ? 'remove-target' : '',
                !target && hintSet.has(key) ? 'hint' : '',
                dimOthers && !target && card !== FREE ? 'dimmed' : '',
                seqSet.has(key) ? 'in-seq' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <button
                  key={key}
                  className={cls}
                  role="gridcell"
                  aria-label={card === FREE ? 'Free corner' : card}
                  onClick={() => target && onCellClick({ r, c })}
                  onMouseEnter={() => target && onHover({ r, c })}
                  onMouseLeave={() => onHover(null)}
                  tabIndex={target ? 0 : -1}
                >
                  {card === FREE ? <span className="chip free" title="Free corner — counts for every team" aria-hidden /> : <CardFace card={card} variant="mini" />}
                  <AnimatePresence>
                    {owner !== null && <Chip key={`chip-${owner}`} color={state.teamColors[owner]} wild={wildSet.has(key)} />}
                    {owner === null && hovering && target?.kind === 'place' && <Chip key="ghost" color={state.teamColors[previewTeam]} ghost />}
                  </AnimatePresence>
                  {isLast && lastKind === 'place' && (
                    <motion.span key={`ripple-${state.turn}`} className={`last-ripple ${state.lastMove!.wild ? 'wild' : ''}`} aria-hidden>
                      <i />
                      <i />
                      <i />
                    </motion.span>
                  )}
                  {isLast && lastKind === 'remove' && owner === null && (
                    <motion.span
                      key={`removed-${state.turn}`}
                      className={`removed-mark ${state.lastMove!.removedTeam !== undefined ? state.teamColors[state.lastMove!.removedTeam] : ''}`}
                      aria-label="Chip removed here by a one-eyed Jack"
                      title="A one-eyed Jack removed a chip here"
                      initial={{ opacity: 0, scale: 1.3 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <i className="removed-ghost" />
                      <b>✕</b>
                    </motion.span>
                  )}
                </button>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
