import { motion } from 'framer-motion';
import { TEAM_COLORS } from '../../engine';

interface Props {
  team: number;
  ghost?: boolean;
  /** Placed with a two-eyed Jack — shown with a "J" marker so everyone can tell. */
  wild?: boolean;
}

export function Chip({ team, ghost, wild }: Props) {
  return (
    <motion.span
      className={`chip ${TEAM_COLORS[team]} ${ghost ? 'ghost' : ''}`.trim()}
      initial={ghost ? { opacity: 0, scale: 0.6 } : { scale: 0, y: -40, opacity: 0 }}
      animate={ghost ? { opacity: 0.45, scale: 1 } : { scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0.3, opacity: 0, rotate: 90 }}
      transition={ghost ? { duration: 0.15 } : { type: 'spring', stiffness: 520, damping: 26, mass: 0.7 }}
      title={wild ? 'Placed with a two-eyed Jack (wild)' : undefined}
    >
      {wild && <span className="wild-mark">J</span>}
    </motion.span>
  );
}
