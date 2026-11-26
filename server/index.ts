/**
 * Sequence game server: WebSocket for play, static hosting of the built client, durable
 * storage (MongoDB or a JSON file) so games survive restarts, optional accounts with
 * head-to-head statistics, heartbeats to detect dead connections, and turn timers.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { IllegalMoveError, cardLabel, BOARD_LAYOUT } from '../src/engine';
import type { ClientMessage, PublicUser, ServerMessage } from '../src/net/protocol';
import { AuthService } from './auth';
import { RoomManager, type Outbound, type Room } from './rooms';
import { createStore } from './store';

// SEQUENCE_PORT wins in development (Vite owns PORT there); hosts like Render set PORT in production.
const PORT = Number(process.env.SEQUENCE_PORT ?? process.env.PORT ?? 3001);
const DIST = resolve(process.cwd(), 'dist');
const HAS_DIST = existsSync(join(DIST, 'index.html'));
const HEARTBEAT_MS = 30_000;
const ROOM_TTL_MS = 1000 * 60 * 60 * 12; // forget rooms nobody touched for 12h

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size, online: onlineCount(), store: process.env.MONGODB_URI ? 'mongodb' : 'file' }));
    return;
  }
  if (!HAS_DIST) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Sequence game server is running. In development, open the Vite dev server instead.');
    return;
  }
  let file = normalize(join(DIST, url.pathname));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html'); // SPA fallback
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

interface Client {
  token: string;
  name: string;
  user: PublicUser | null;
  ws: WebSocket | null;
  alive: boolean;
}

const store = createStore();
const auth = new AuthService(store);
const manager = new RoomManager();
const clients = new Map<string, Client>();

function send(token: string, message: ServerMessage) {
  const ws = clients.get(token)?.ws;
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}
function flush(out: Outbound[]) {
  for (const o of out) send(o.token, o.message);
}
type EventKind = 'info' | 'wild' | 'remove' | 'sequence' | 'warning' | 'timeout';
function broadcastEvent(room: Room, kind: EventKind, message: string, except?: string) {
  for (const s of room.seats) if (s.token !== except) send(s.token, { type: 'event', kind, message });
}
function onlineCount() {
  let n = 0;
  for (const c of clients.values()) if (c.ws && c.ws.readyState === c.ws.OPEN) n++;
  return n;
}
function cleanName(name: unknown): string {
  const n = String(name ?? '')
    .replace(/[^\p{L}\p{N} _.'-]/gu, '')
    .trim()
    .slice(0, 16);
  return n || 'Player';
}
function persistRoom(room: Room) {
  const alive = manager.rooms.has(room.code);
  const op = alive
    ? store.saveRoom({ code: room.code, data: RoomManager.serialize(room), updatedAt: Date.now() })
    : store.deleteRoom(room.code);
  op.catch((e) => console.error('persist failed', e));
}
function persistClient(c: Client) {
  store.saveClient({ token: c.token, name: c.name, userId: c.user?.id ?? null, updatedAt: Date.now() }).catch(() => {});
}
/** Broadcast the latest room + state to every seat and write it to the store. */
function sync(room: Room) {
  flush(manager.broadcastRoom(room));
  persistRoom(room);
  recordStatsIfFinished(room);
}

/** Write the result to head-to-head stats once per finished game (logged-in players only). */
function recordStatsIfFinished(room: Room) {
  const g = room.game;
  if (!g || g.winner === null || room.statsRecorded) return;
  room.statsRecorded = true;
  const players = room.seats.filter((s) => s.userId).map((s) => ({ userId: s.userId!, username: s.name, team: s.team }));
  if (players.length < 2) return;
  const winners = new Set(players.filter((p) => p.team === g.winner).map((p) => p.userId));
  auth.recordGame(players, winners).catch((e) => console.error('stats failed', e));
}

/** One pending timer per room; re-armed after every state change. */
const turnTimers = new Map<string, NodeJS.Timeout>();
const TIMER_GRACE_MS = 1500; // network slack before the server plays for someone

function clearTurnTimer(code: string) {
  const t = turnTimers.get(code);
  if (t) clearTimeout(t);
  turnTimers.delete(code);
}
function scheduleTurnTimer(room: Room) {
  clearTurnTimer(room.code);
  const g = room.game;
  if (!g || room.status !== 'playing' || g.turnSeconds <= 0) return;
  const due = g.turnStartedAt + g.turnSeconds * 1000 + TIMER_GRACE_MS - Date.now();
  const t = setTimeout(() => {
    turnTimers.delete(room.code);
    const result = manager.autoPlay(room.code);
    if (!result) return;
    sync(result.room);
    broadcastEvent(result.room, 'timeout', `${result.playerName} ran out of time — a move was played automatically.`);
    announceMove(result.room, '');
    scheduleTurnTimer(result.room);
  }, Math.max(0, due));
  turnTimers.set(room.code, t);
}

/** Tell the other players what just happened, loudly for Jacks and sequences. */
function announceMove(room: Room, actorToken: string) {
  const g = room.game;
  if (!g?.lastMove) return;
  const mover = g.players[g.lastMove.playerId];
  const cell = BOARD_LAYOUT[g.lastMove.pos.r][g.lastMove.pos.c];
  const cellName = cell === 'FREE' ? 'a corner' : cardLabel(cell);
  if (g.lastMove.kind === 'remove') {
    broadcastEvent(room, 'remove', `${mover.name} used a one-eyed Jack ${cardLabel(g.lastMove.card)} to remove a chip from ${cellName}.`, actorToken);
  } else if (g.lastMove.wild) {
    broadcastEvent(room, 'wild', `${mover.name} played a two-eyed Jack ${cardLabel(g.lastMove.card)} as a wild card on ${cellName}!`, actorToken);
  }
  if (g.lastMove.sequencesMade > 0 && g.winner === null) {
    broadcastEvent(room, 'sequence', `${mover.name} completed a sequence!`, actorToken);
  }
}

/** Remove the client from whatever room it is in and tell everyone affected. */
function leaveCurrentRoom(client: Client) {
  const { token } = client;
  const room = manager.roomOf(token);
  const result = manager.leaveRoom(token);
  send(token, { type: 'left' });
  if (!room) return;
  if (!manager.rooms.has(room.code)) {
    clearTurnTimer(room.code);
    persistRoom(room);
  }
  if (!result) return;
  if (result.status === 'finished' && room.status === 'playing') {
    for (const s of result.seats) {
      send(s.token, { type: 'event', kind: 'warning', message: `${client.name} left the game.` });
      send(s.token, { type: 'left' });
    }
  } else {
    sync(result);
    broadcastEvent(result, 'info', `${client.name} left the room.`);
  }
}

async function sendStats(client: Client) {
  if (!client.user) return send(client.token, { type: 'stats', entries: [] });
  send(client.token, { type: 'stats', entries: await auth.statsFor(client.user.id) });
}

/** Send whatever the client should currently be looking at (used after reconnects). */
function resync(client: Client) {
  const room = manager.roomOf(client.token);
  if (room) flush(manager.broadcastRoom(room));
  else send(client.token, { type: 'left' });
}

async function handle(client: Client, msg: ClientMessage) {
  const { token } = client;
  const userId = client.user?.id ?? null;
  switch (msg.type) {
    case 'hello':
      return; // handled on connect
    case 'ping':
      send(token, { type: 'pong' });
      return;
    case 'resync':
      resync(client);
      return;
    case 'set_name': {
      if (client.user) return; // logged-in players are named after their account
      client.name = cleanName(msg.name);
      persistClient(client);
      return;
    }
    case 'register':
    case 'login': {
      const result = msg.type === 'register' ? await auth.register(msg.username, msg.password) : await auth.login(msg.username, msg.password);
      client.user = result.user;
      client.name = result.user.username;
      persistClient(client);
      send(token, { type: 'auth', user: result.user, session: result.session });
      await sendStats(client);
      return;
    }
    case 'logout': {
      client.user = null;
      persistClient(client);
      send(token, { type: 'auth', user: null, session: null });
      return;
    }
    case 'stats':
      await sendStats(client);
      return;
    case 'create_room': {
      const room = manager.createRoom(token, client.name, Number(msg.playerCount), Number(msg.teamCount), true, msg.name, msg.options ?? {}, userId);
      sync(room);
      return;
    }
    case 'join_room': {
      const code = String(msg.code ?? '')
        .toUpperCase()
        .trim();
      const previous = manager.roomOf(token);
      if (previous && previous.code !== code) leaveCurrentRoom(client); // invite link wins over a stale room
      const room = manager.joinRoom(token, client.name, code, userId);
      sync(room);
      broadcastEvent(room, 'info', `${client.name} joined the room.`, token);
      return;
    }
    case 'leave_room': {
      manager.dequeue(token);
      leaveCurrentRoom(client);
      return;
    }
    case 'quick_match': {
      const room = manager.enqueue(token, client.name, userId);
      if (room) {
        for (const s of room.seats) send(s.token, { type: 'queue', searching: false, waiting: 0 });
        sync(room);
        broadcastEvent(room, 'info', 'Opponent found — good luck!');
        scheduleTurnTimer(room);
      } else {
        send(token, { type: 'queue', searching: true, waiting: manager.queue.length });
      }
      return;
    }
    case 'cancel_quick_match': {
      manager.dequeue(token);
      send(token, { type: 'queue', searching: false, waiting: 0 });
      return;
    }
    case 'start_game': {
      const room = manager.startGame(token);
      sync(room);
      scheduleTurnTimer(room);
      return;
    }
    case 'action': {
      const room = manager.applyAction(token, msg.action);
      sync(room);
      announceMove(room, token);
      scheduleTurnTimer(room);
      return;
    }
    case 'pass': {
      const room = manager.pass(token);
      sync(room);
      broadcastEvent(room, 'info', `${client.name} had no legal move and passed.`, token);
      scheduleTurnTimer(room);
      return;
    }
    case 'rematch': {
      const { room, restarted } = manager.voteRematch(token);
      sync(room);
      if (restarted) {
        broadcastEvent(room, 'info', 'Rematch! New game started.');
        scheduleTurnTimer(room);
      } else {
        broadcastEvent(room, 'info', `${client.name} wants a rematch (${room.rematchVotes.size}/${room.seats.length}).`, token);
      }
      return;
    }
  }
}

const http = createServer(serveStatic);
const wss = new WebSocketServer({ server: http, path: '/ws' });

wss.on('connection', (ws) => {
  let client: Client | null = null;
  ws.on('pong', () => {
    if (client) client.alive = true;
  });

  ws.on('message', async (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    try {
      if (!client) {
        if (msg.type !== 'hello') return;
        const existing = msg.token ? clients.get(msg.token) : undefined;
        if (existing) {
          if (existing.ws && existing.ws !== ws) existing.ws.close();
          existing.ws = ws;
          existing.alive = true;
          client = existing;
        } else {
          client = { token: msg.token && /^[0-9a-f-]{36}$/.test(msg.token) ? msg.token : randomUUID(), name: cleanName(msg.name), user: null, ws, alive: true };
          clients.set(client.token, client);
        }
        if (msg.session) {
          const user = await auth.resume(String(msg.session)).catch(() => null);
          if (user) {
            client.user = user;
            client.name = user.username;
          } else {
            send(client.token, { type: 'auth', user: null, session: null, message: 'Your login expired. Please sign in again.' });
          }
        } else if (!client.user) {
          client.name = cleanName(msg.name) || client.name;
        }
        persistClient(client);
        ws.send(JSON.stringify({ type: 'welcome', token: client.token, name: client.name, online: onlineCount(), user: client.user } satisfies ServerMessage));
        const room = manager.setConnected(client.token, true);
        if (room) {
          sync(room);
          broadcastEvent(room, 'info', `${client.name} reconnected.`, client.token);
          scheduleTurnTimer(room);
        } else {
          send(client.token, { type: 'left' });
        }
        if (client.user) await sendStats(client);
        return;
      }
      await handle(client, msg);
    } catch (e) {
      const message = e instanceof IllegalMoveError || e instanceof Error ? e.message : 'Something went wrong.';
      if (client) send(client.token, { type: 'error', message });
    }
  });

  ws.on('close', () => {
    if (!client) return;
    if (client.ws === ws) client.ws = null;
    else return; // superseded by a newer socket for the same player
    manager.dequeue(client.token);
    const room = manager.setConnected(client.token, false);
    if (room) {
      sync(room);
      broadcastEvent(room, 'warning', `${client.name} lost connection. Waiting for them to return…`, client.token);
    }
  });
});

// Heartbeat: drop sockets that stopped answering pings (mobile browsers in the background, lost Wi-Fi).
setInterval(() => {
  for (const c of clients.values()) {
    if (!c.ws) continue;
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, HEARTBEAT_MS).unref();

// Reap rooms nobody has touched for a long time, and forgotten clients.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of manager.rooms) {
    const idle = room.seats.every((s) => !s.connected);
    const stamp = room.game?.turnStartedAt ?? room.createdAt;
    if (idle && now - stamp > ROOM_TTL_MS) {
      manager.rooms.delete(code);
      clearTurnTimer(code);
      store.deleteRoom(code).catch(() => {});
    }
  }
  for (const [token, c] of clients) if (!c.ws && !manager.roomOf(token)) clients.delete(token);
}, 60_000).unref();

async function main() {
  await store.init();
  const [rooms, savedClients] = await Promise.all([store.loadRooms(), store.loadClients()]);
  const restored = manager.hydrate(rooms.map((r) => r.data));
  for (const c of savedClients) clients.set(c.token, { token: c.token, name: c.name, user: null, ws: null, alive: false });
  // Resolve stored user ids to names lazily on hello; rooms already carry names.
  for (const room of manager.rooms.values()) scheduleTurnTimer(room);
  http.listen(PORT, () => {
    console.log(
      `Sequence server listening on http://localhost:${PORT}  (WebSocket at /ws)${HAS_DIST ? ', serving dist/' : ''}; ` +
        `store=${process.env.MONGODB_URI ? 'mongodb' : 'file'}; restored ${restored} room(s)`,
    );
  });
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    store.close().finally(() => process.exit(0));
  });
}

main().catch((e) => {
  console.error('Server failed to start', e);
  process.exit(1);
});
