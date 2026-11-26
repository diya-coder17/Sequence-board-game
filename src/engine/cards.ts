/** Card primitives shared by the engine and the UI. */

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

/** A card code such as "10H", "JS", "AD". Jacks are "JS" | "JH" | "JD" | "JC". */
export type CardCode = `${Rank}${Suit}`;

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME: Record<Suit, string> = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };

export function suitOf(card: CardCode): Suit {
  return card.slice(-1) as Suit;
}
export function rankOf(card: CardCode): Rank {
  return card.slice(0, -1) as Rank;
}
export function isRed(card: CardCode): boolean {
  const s = suitOf(card);
  return s === 'H' || s === 'D';
}

/** Two-eyed Jacks are wild: place a chip on any open space. */
export function isTwoEyedJack(card: CardCode): boolean {
  return card === 'JD' || card === 'JC';
}
/** One-eyed Jacks remove an opponent's chip. */
export function isOneEyedJack(card: CardCode): boolean {
  return card === 'JH' || card === 'JS';
}
export function isJack(card: CardCode): boolean {
  return rankOf(card) === 'J';
}

/** Sequence is played with two standard 52-card decks (no Jokers). */
export function buildDeck(): CardCode[] {
  const deck: CardCode[] = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const s of SUITS) {
      for (const r of RANKS) deck.push(`${r}${s}` as CardCode);
    }
  }
  return deck;
}

/** Small seedable PRNG (mulberry32) so games can be replayed deterministically. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function cardLabel(card: CardCode): string {
  return `${rankOf(card)}${SUIT_SYMBOL[suitOf(card)]}`;
}
