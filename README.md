# Sequence — Online Board Game

A faithful, polished browser version of the classic **Sequence** board game: 10×10 card board,
two decks, coloured chips, wild and one-eyed Jacks, dead-card exchange, and 2- or 3-team play.
Play online (quick match or a private room with an invite link), against the computer, or with
friends on one screen.

## Play it online

- **Game:** https://sequence-board-game-two.vercel.app (web app on Vercel)
- **Game server:** https://sequence-online-23hl.onrender.com (WebSocket server on Render, free tier — may take up to a minute to wake)

## Run it

```bash
npm install
npm run dev:all
```

Open http://localhost:5173. This starts the Vite dev server (UI) and the game server (port 3001,
WebSocket at `/ws`, proxied by Vite).

For a single production process that friends can reach (for example on a LAN or a host like Render/Fly):

```bash
npm start
```

That builds the client and serves it together with the WebSocket server on `PORT` (default 3001).

| Script                 | What it does                                               |
| ---------------------- | ---------------------------------------------------------- |
| `npm run dev:all`      | UI dev server + game server together (recommended)         |
| `npm run dev`          | UI dev server only (local play works, online does not)     |
| `npm run server`       | Game server only, with auto-restart                        |
| `npm start`            | Build and serve everything from one process                |
| `npm test`             | Engine + room-manager unit tests (Vitest)                  |
| `npm run typecheck`    | Type-check client and server                               |
| `npm run build`        | Build the client to `dist/`                                |
| `npm run lint`         | Lint with oxlint                                           |
| `npm run test-player`  | Scripted opponent for testing online play alone (see below)|

### Testing online play by yourself

1. Run `npm run dev:all`.
2. In the app choose **Play online → Create room** and copy the code.
3. In a terminal run `npm run test-player join <CODE>` — a bot named "Friend" joins and auto-plays.
   Or run `npm run test-player host`, which prints a room code for you to join.

Two browser tabs also work: each tab is its own player.

## Tech stack

- **TypeScript** everywhere. The rules engine is pure, deterministic (seedable) and has no UI dependency,
  so it can later run on a server to validate moves for real-time online play.
- **React 19 + Vite** for the interface.
- **Framer Motion** for chip drops, card deals, banners and modals.
- **Node + ws** for the game server. It imports the same engine, validates every action, strips other
  players' hands before broadcasting, and serves the built client.
- **Vitest** for the rules test-suite (board integrity, Jacks, dead cards, sequence detection, win conditions, AI)
  and the room manager (rooms, matchmaking, turn ownership, rematch).

## Project structure

```
src/
  engine/              Pure game logic (no React)
    cards.ts           Card codes, two-deck builder, seeded shuffle
    board.ts           Official 10×10 layout, free corners, card→positions index
    sequences.ts       Five-in-a-row detection, shared-chip rule, protected chips
    rules.ts           Game state, actions (PLACE / REMOVE / DEAD_CARD), reducer, win check
    ai.ts              Heuristic computer opponent (offence + defence + Jack economy)
    __tests__/         Vitest specs for every rule
  net/
    protocol.ts        Client/server message types; hand-stripping for the client view
    client.ts          Reconnecting WebSocket client (per-tab token so refreshes rejoin)
  ui/
    hooks/useSelection.ts   Card selection + legal targets (shared by local and online)
    hooks/useLocalGame.ts   Same-device play: AI turns, pass-the-device handoff
    hooks/useOnlineGame.ts  Mirrors server state, builds the same controller for the UI
    components/        HomeScreen, SetupScreen, OnlineLobby, RoomScreen, GameScreen, Board, Hand, Sidebar, Modals…
  styles/              Design tokens + application CSS
server/
  rooms.ts             Rooms, private codes, quick-match queue, rematch votes (pure, unit-tested)
  index.ts             HTTP static hosting + WebSocket endpoint
scripts/test-player.ts Scripted opponent for solo testing
docs/superpowers/specs Design document
```

## Rules implemented

- Hand size by player count: 2→7, 3→6, 4→6, 6→5, 8→4, 9→4, 10→3, 12→3.
- 2 teams need **two** sequences to win, 3 teams need **one**. Two sequences may share one chip.
- Free corners count as every team's chip.
- Two-eyed Jacks (J♦ J♣) place a chip anywhere; one-eyed Jacks (J♥ J♠) remove an opponent's chip
  unless it is locked in a completed sequence.
- A dead card (both board spaces covered) can be exchanged once per turn before playing.
- Draw pile empty → discards are reshuffled. A player with no legal move passes.

## How to play (in the app)

- **Play online → Quick match** pairs you with the next person searching (2 players).
- **Play online → Create room** gives you a 6-letter code and an invite link (`/?room=CODE`).
  Rooms support 2, 3, 4 or 6 players in 2 or 3 teams; the host starts when every seat is filled.
  A refresh reconnects you to your seat; others see an "Offline" badge while you are away.
- **Play on this device** lets you mix humans and AI. A "pass the device" screen hides hands between humans.
- On your turn, hover a card to preview its two board spaces, click it, then click a highlighted space.

### Game options

Both local setup and online room creation let you choose:

- **Team colours** — eight chip colours (blue, green, red, purple, orange, teal, gold, pink); teams must differ.
- **Sequences to win** — 1, 2 or 3 (the official rule is 2 for two teams, 1 for three teams).
- **Turn timer** — off, 30, 60 or 90 seconds. A countdown ring shows the time left; when it runs out a sensible
  move is played automatically (the server enforces this online) and everyone is told.
- **Room name** (online) — shown in the lobby and the game header.

The last move is marked with a gold ripple on the placed chip (purple for a wild Jack) and a fading red ✕ where a chip was removed.

### Jack announcements

Whenever anyone plays a **two-eyed Jack** (wild) or a **one-eyed Jack** (remove), every other player gets
a callout, the "Last move" line spells it out, the game log records it, and chips placed with a wild Jack
carry a permanent **J** marker on the board.
