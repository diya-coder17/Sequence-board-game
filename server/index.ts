/**
 * Sequence game server: WebSocket for play, plus static hosting of the built client
 * so one process can host friends over a shared link.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { IllegalMoveError, cardLabel, BOARD_LAYOUT } from '../src/engine';
import type { ClientMessage, ServerMessage } from '../src/net/protocol';
import { RoomManager, type Outbound, type Room } from './rooms';

// SEQUENCE_PORT wins in development (Vite owns PORT there); hosts like Render/Heroku set PORT in production.
const PORT = Number(process.env.SEQUENCE_PORT ?? process.env.PORT ?? 3001);
const DIST = resolve(process.cwd(), 'dist');
const HAS_DIST = existsSync(join(DIST, 'index.html'));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (!HAS_DIST) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Sequence game server is running. In development, open the Vite dev server instead.');
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
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
  ws: WebSocket | null;
}

const manager = new RoomManager();
const clients = new Map<string, Client>();

function send(token: string, message: ServerMessage) {
  const ws = clients.get(token)?.ws;
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}
function flush(out: Outbound[]) {
  for (const o of out) send(o.token, o.message);
}
function broadcastEvent(room: Room, kind: 'info' | 'wild' | 'remove' | 'sequence' | 'warning' | 'timeout', message: string, except?: string) {
  for (const s of room.seats) if (s.token !== except) send(s.token, { type: 'event', kind, message });
}
function onlineCount() {
  let n = 0;
  for (const c of clients.values()) if (c.ws && c.ws.readyState === c.ws.OPEN) n++;
  return n;
}
function cleanName(name: unknown): string {
  const n = String(name ?? '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 16);
  return n || 'Player';
}

/** One pending timer per room; re-armed after every state change. */
const turnTimers = new Map<string, NodeJS.Timeout>();
const TIMER_GRACE_MS = 1500; // network slack before the server plays for someone

function scheduleTurnTimer(room: Room) {
  const existing = turnTimers.get(room.code);
  if (existing) clearTimeout(existing);
  turnTimers.delete(room.code);
  const g = room.game;
  if (!g || room.status !== 'playing' || g.turnSeconds <= 0) return;
  const due = g.turnStartedAt + g.turnSeconds * 1000 + TIMER_GRACE_MS - Date.now();
  const t = setTimeout(() => {
    turnTimers.delete(room.code);
    const result = manager.autoPlay(room.code);
    if (!result) return;
    flush(manager.broadcastRoom(result.room));
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
  if (room && !manager.rooms.has(room.code)) {
    const t = turnTimers.get(room.code);
    if (t) clearTimeout(t);
    turnTimers.delete(room.code);
  }
  if (!room || !result) return;
  if (result.status === 'finished' && room.status === 'playing') {
    for (const s of result.seats) {
      send(s.token, { type: 'event', kind: 'warning', message: `${client.name} left the game.` });
      send(s.token, { type: 'left' });
    }
  } else {
    flush(manager.broadcastRoom(result));
    broadcastEvent(result, 'info', `${client.name} left the room.`);
  }
}

function handle(client: Client, msg: ClientMessage) {
  const { token } = client;
  switch (msg.type) {
    case 'hello':
      return; // handled on connect
    case 'set_name': {
      client.name = cleanName(msg.name);
      return;
    }
    case 'create_room': {
      const room = manager.createRoom(token, client.name, Number(msg.playerCount), Number(msg.teamCount), true, msg.name, msg.options ?? {});
      flush(manager.broadcastRoom(room));
      return;
    }
    case 'join_room': {
      const code = String(msg.code ?? '').toUpperCase().trim();
      const previous = manager.roomOf(token);
      if (previous && previous.code !== code) leaveCurrentRoom(client); // invite link wins over a stale room
      const room = manager.joinRoom(token, client.name, code);
      flush(manager.broadcastRoom(room));
      broadcastEvent(room, 'info', `${client.name} joined the room.`, token);
      return;
    }
    case 'leave_room': {
      manager.dequeue(token);
      leaveCurrentRoom(client);
      return;
    }
    case 'quick_match': {
      const room = manager.enqueue(token, client.name);
      if (room) {
        for (const s of room.seats) send(s.token, { type: 'queue', searching: false, waiting: 0 });
        flush(manager.broadcastRoom(room));
        broadcastEvent(room, 'info', 'Opponent found — good luck!');
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
      flush(manager.broadcastRoom(room));
      scheduleTurnTimer(room);
      return;
    }
    case 'action': {
      const room = manager.applyAction(token, msg.action);
      flush(manager.broadcastRoom(room));
      announceMove(room, token);
      scheduleTurnTimer(room);
      return;
    }
    case 'pass': {
      const room = manager.pass(token);
      flush(manager.broadcastRoom(room));
      broadcastEvent(room, 'info', `${client.name} had no legal move and passed.`, token);
      scheduleTurnTimer(room);
      return;
    }
    case 'rematch': {
      const { room, restarted } = manager.voteRematch(token);
      if (restarted) {
        flush(manager.broadcastRoom(room));
        broadcastEvent(room, 'info', 'Rematch! New game started.');
        scheduleTurnTimer(room);
      } else {
        broadcastEvent(room, 'info', `${client.name} wants a rematch (${room.rematchVotes.size}/${room.seats.length}).`);
      }
      return;
    }
  }
}

const http = createServer(serveStatic);
const wss = new WebSocketServer({ server: http, path: '/ws' });

wss.on('connection', (ws) => {
  let client: Client | null = null;

  ws.on('message', (raw) => {
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
          existing.ws?.close();
          existing.ws = ws;
          existing.name = cleanName(msg.name) || existing.name;
          client = existing;
        } else {
          client = { token: randomUUID(), name: cleanName(msg.name), ws };
          clients.set(client.token, client);
        }
        ws.send(JSON.stringify({ type: 'welcome', token: client.token, name: client.name, online: onlineCount() } satisfies ServerMessage));
        const room = manager.setConnected(client.token, true);
        if (room) {
          flush(manager.broadcastRoom(room));
          broadcastEvent(room, 'info', `${client.name} reconnected.`, client.token);
        }
        return;
      }
      handle(client, msg);
    } catch (e) {
      const message = e instanceof IllegalMoveError || e instanceof Error ? e.message : 'Something went wrong.';
      if (client) send(client.token, { type: 'error', message });
    }
  });

  ws.on('close', () => {
    if (!client) return;
    if (client.ws === ws) client.ws = null;
    manager.dequeue(client.token);
    const room = manager.setConnected(client.token, false);
    if (room) {
      flush(manager.broadcastRoom(room));
      broadcastEvent(room, 'warning', `${client.name} disconnected. Waiting for them to return…`, client.token);
    }
  });
});

// Reap rooms nobody has been connected to, and forgotten clients.
setInterval(() => {
  for (const code of manager.sweepAbandoned()) {
    const t = turnTimers.get(code);
    if (t) clearTimeout(t);
    turnTimers.delete(code);
  }
  for (const [token, c] of clients) if (!c.ws && !manager.roomOf(token)) clients.delete(token);
}, 60_000).unref();

http.listen(PORT, () => {
  console.log(`Sequence server listening on http://localhost:${PORT}  (WebSocket at /ws)${HAS_DIST ? ', serving dist/' : ''}`);
});
