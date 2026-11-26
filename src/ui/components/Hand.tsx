import { AnimatePresence, motion } from 'framer-motion';
import { isOneEyedJack, isRed, isTwoEyedJack, type CardCode } from '../../engine';
import { CardFace } from './CardFace';

interface Props {
  cards: CardCode[];
  selected: CardCode | null;
  deadCards: Set<CardCode>;
  playable: Set<CardCode>;
  disabled: boolean;
  onSelect: (card: CardCode) => void;
  onHover: (card: CardCode | null) => void;
}

export function Hand({ cards, selected, deadCards, playable, disabled, onSelect, onHover }: Props) {
  return (
    <div className="hand" onMouseLeave={() => onHover(null)}>
      <AnimatePresence initial={false}>
        {cards.map((card, i) => {
          const dead = deadCards.has(card);
          const canPlay = playable.has(card) || dead;
          return (
            <motion.button
              key={`${card}-${i}`}
              layout
              initial={{ y: 60, opacity: 0, rotate: -6 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: -80, opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              className={[
                'card',
                isRed(card) ? 'red' : '',
                selected === card ? 'selected' : '',
                !canPlay && !disabled ? 'unplayable' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={disabled}
              onClick={() => onSelect(card)}
              onMouseEnter={() => onHover(card)}
              aria-pressed={selected === card}
              aria-label={card}
            >
              <CardFace card={card} variant="hand" />
              {dead && <span className="badge dead">Dead</span>}
              {isTwoEyedJack(card) && <span className="badge wild">Wild</span>}
              {isOneEyedJack(card) && <span className="badge remove">Remove</span>}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
