# Sequence — Online Board Game — Design

## Intent
A faithful, polished browser version of the Sequence board game (Jax Ltd.) that can be
played locally right now (humans sharing one screen, or against AI), with a game engine
clean enough to put behind a multiplayer server later.

## Goals
- Complete official rules: 10x10 board, two decks, free corners, two-eyed/one-eyed Jacks,
  dead cards, protected chips in completed sequences, win conditions for 2 vs 3 teams.
- Professional UI: realistic board, cards, chips, smooth animations, clear turn flow.
- Deterministic, serializable engine (pure functions) so a server can replay/validate it.

## Non-goals (this iteration)
- Real network multiplayer / accounts / lobbies. The engine is server-ready; the server is not written.
- Mobile-native apps.

## Approaches considered
1. **Vanilla HTML/CSS/JS** — zero deps but animation and state management get messy at this size.
2. **React + TypeScript + Vite** (chosen) — typed engine, component UI, fast dev loop, Framer Motion animations.
3. **Phaser/Canvas** — overkill; Sequence is a grid of DOM-friendly cells, and accessibility is better in DOM.

## Architecture
- `src/engine/` — pure TypeScript, no React. `cards`, `board`, `sequences`, `rules` (reducer), `ai`.
- `src/ui/` — React components and hooks. Only `useGame` touches the engine.
- `src/styles/` — plain CSS with design tokens.
- `src/engine/__tests__/` — Vitest unit tests for every rule.

## Rules implemented
- Hand size by player count: 2→7, 3→6, 4→6, 6→5, 8→4, 9→4, 10→3, 12→3.
- Teams: 2 or 3; players alternate teams around the table.
- Sequences needed to win: 2 teams → 2, 3 teams → 1. Sequences may share exactly one chip.
- Free corners count for every team.
- Two-eyed Jacks (J♦ J♣) are wild; one-eyed Jacks (J♥ J♠) remove an opposing chip not in a sequence.
- Dead card: once per turn a player may discard a card whose both board spaces are covered and draw.
- Draw pile exhausted → reshuffle discards.

## Builder calls
- Hot-seat privacy: a "pass the device" screen hides hands between human turns.
- AI: heuristic scoring of line potential (offense + defense), with small randomness.
