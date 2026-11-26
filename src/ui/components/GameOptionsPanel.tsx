import { CHIP_COLORS, type TeamColor } from '../../engine';
import { COLOR_LABEL, TIMER_CHOICES, type OptionsValue } from '../gameOptions';

interface Props {
  teamCount: number;
  value: OptionsValue;
  onChange: (next: OptionsValue) => void;
  /** Official default for this team count, shown as a hint. */
  defaultSequences: number;
}

/** Team colours, win target and turn timer — shared by local setup and online room creation. */
export function GameOptionsPanel({ teamCount, value, onChange, defaultSequences }: Props) {
  const setColor = (team: number, color: TeamColor) => {
    const next = value.teamColors.slice();
    const clash = next.indexOf(color);
    if (clash !== -1 && clash !== team) next[clash] = next[team]; // swap so colours stay distinct
    next[team] = color;
    onChange({ ...value, teamColors: next });
  };

  return (
    <div className="options-panel">
      <div>
        <span className="field-label">Team colours</span>
        <div className="team-color-rows">
          {Array.from({ length: teamCount }, (_, team) => (
            <div className="team-color-row" key={team}>
              <span className="team-color-name">
                <span className={`chip ${value.teamColors[team]} inline-chip`} />
                Team {team + 1}
              </span>
              <div className="swatches" role="radiogroup" aria-label={`Team ${team + 1} colour`}>
                {CHIP_COLORS.map((c) => {
                  const taken = value.teamColors.indexOf(c);
                  const mine = taken === team;
                  return (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={mine}
                      title={COLOR_LABEL[c] + (taken !== -1 && !mine ? ' (swap)' : '')}
                      className={`swatch ${c} ${mine ? 'selected' : ''} ${taken !== -1 && !mine ? 'taken' : ''}`}
                      onClick={() => setColor(team, c)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="options-grid">
        <div>
          <span className="field-label">Sequences to win</span>
          <div className="segmented">
            {[1, 2, 3].map((n) => (
              <button key={n} type="button" className={n === value.sequencesToWin ? 'active' : ''} onClick={() => onChange({ ...value, sequencesToWin: n })}>
                {n}
                {n === defaultSequences && <small className="hint-tag">official</small>}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="field-label">Turn timer</span>
          <div className="segmented">
            {TIMER_CHOICES.map((s) => (
              <button key={s} type="button" className={s === value.turnSeconds ? 'active' : ''} onClick={() => onChange({ ...value, turnSeconds: s })}>
                {s === 0 ? 'Off' : `${s}s`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
