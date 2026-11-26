import { SUIT_SYMBOL, isRed, rankOf, suitOf, type CardCode } from '../../engine';

interface Props {
  card: CardCode;
  /** 'mini' renders inside a board cell, 'hand' renders a full playing card. */
  variant: 'mini' | 'hand';
}

/** Playing-card face used both on the board (mini) and in the hand. */
export function CardFace({ card, variant }: Props) {
  const rank = rankOf(card);
  const suit = SUIT_SYMBOL[suitOf(card)];
  const red = isRed(card);
  const isFace = rank === 'J' || rank === 'Q' || rank === 'K' || rank === 'A';
  const p = variant === 'mini' ? { root: 'mini-card', corner: 'corner', pip: 'pip' } : { root: '', corner: 'c-corner', pip: 'c-pip' };
  return (
    <span className={`${p.root} ${red ? 'red' : ''}`.trim()} aria-hidden>
      <span className={p.corner}>
        {rank}
        <small>{suit}</small>
      </span>
      <span className={`${p.pip} ${isFace ? 'face' : ''}`.trim()}>{isFace ? rank : suit}</span>
      <span className={`${p.corner} br`}>
        {rank}
        <small>{suit}</small>
      </span>
    </span>
  );
}
