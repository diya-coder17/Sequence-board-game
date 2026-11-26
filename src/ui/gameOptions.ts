import type { GameOptions, TeamColor } from '../engine';

export const TIMER_CHOICES = [0, 30, 60, 90] as const;
export const COLOR_LABEL: Record<TeamColor, string> = {
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  purple: 'Purple',
  orange: 'Orange',
  teal: 'Teal',
  gold: 'Gold',
  pink: 'Pink',
};

export interface OptionsValue {
  teamColors: TeamColor[];
  sequencesToWin: number;
  turnSeconds: number;
}

export function toGameOptions(v: OptionsValue, teamCount: number): GameOptions {
  return { teamColors: v.teamColors.slice(0, teamCount), sequencesToWin: v.sequencesToWin, turnSeconds: v.turnSeconds };
}
