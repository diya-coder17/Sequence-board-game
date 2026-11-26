import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
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

/**
 * Keys must stay stable when a card leaves the hand, otherwise every card to its right
 * re-mounts and the whole hand appears to reshuffle. Two decks mean duplicates, so the key
 * is the card code plus its occurrence number ("7C#0", "7C#1").
 */
function stableKeys(cards: CardCode[]): string[] {
  const seen = new Map<string, number>();
  return cards.map((c) => {
    const n = seen.get(c) ?? 0;
    seen.set(c, n + 1);
    return `${c}#${n}`;
  });
}

export function Hand({ cards, selected, deadCards, playable, disabled, onSelect, onHover }: Props) {
  const keys = useMemo(() => stableKeys(cards), [cards]);
  return (
    <div className="hand" onMouseLeave={() => onHover(null)}>
      <AnimatePresence initial={false} mode="popLayout">
        {cards.map((card, i) => {
          const dead = deadCards.has(card);
          const canPlay = playable.has(card) || dead;
          return (
            <motion.button
              key={keys[i]}
              layout="position"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14, transition: { duration: 0.14 } }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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
