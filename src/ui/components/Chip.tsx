import { motion } from 'framer-motion';
import type { TeamColor } from '../../engine';

interface Props {
  color: TeamColor;
  ghost?: boolean;
  /** Placed with a two-eyed Jack — shown with a small "J" badge so everyone can tell. */
  wild?: boolean;
}

/** A chip settles onto the board with one short ease-out; no bounce, no wobble. */
export function Chip({ color, ghost, wild }: Props) {
  return (
    <motion.span
      className={`chip ${color} ${ghost ? 'ghost' : ''}`.trim()}
      initial={ghost ? { opacity: 0 } : { scale: 0.55, opacity: 0 }}
      animate={ghost ? { opacity: 0.45 } : { scale: 1, opacity: 1 }}
      exit={{ scale: 0.7, opacity: 0, transition: { duration: 0.16 } }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      title={wild ? 'Placed with a two-eyed Jack (wild)' : undefined}
    >
      {wild && <span className="wild-mark">J</span>}
    </motion.span>
  );
}
