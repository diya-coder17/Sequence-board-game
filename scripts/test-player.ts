/**
 * Scripted test player for trying online play alone.
 *   npx tsx scripts/test-player.ts host          -> creates a room, prints its code, starts when full
 *   npx tsx scripts/test-player.ts join <CODE>   -> joins your room and auto-plays (prefers wild Jacks)
 *   npx tsx scripts/test-player.ts quick         -> enters the quick-match queue
 *   USER=name:password ...                       -> signs in first (registers if new) so results are recorded
 *   NAME=Friend ...                              -> guest display name
 * Needs the game server running (npm run server or npm run dev:all), or set WS_URL for a deployed one.
 */
import WebSocket from 'ws';
import { legalTargets, isTwoEyedJack } from '../src/engine';
const mode = process.argv[2];
const code = process.argv[3];
// Point at a deployed server with WS_URL=wss://your-server.example.com/ws
const ws = new WebSocket(process.env.WS_URL ?? 'ws://localhost:3001/ws');
let seat = -1;
let started = false;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const account = process.env.USER_LOGIN ? process.env.USER_LOGIN.split(':') : null;
let begun = false;
function begin() {
  if (begun) return;
  begun = true;
  if (mode === 'join') ws.send(JSON.stringify({ type: 'join_room', code }));
  else if (mode === 'quick') ws.send(JSON.stringify({ type: 'quick_match' }));
  else ws.send(JSON.stringify({ type: 'create_room', name: '', playerCount: 2, teamCount: 2, options: {} }));
}
ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', token: null, name: process.env.NAME ?? 'Friend', session: null })));
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.type === 'welcome') {
    if (account) ws.send(JSON.stringify({ type: 'register', username: account[0], password: account[1] }));
    else begin();
  }
  if (m.type === 'auth') {
    log('auth', m.user ? `signed in as ${m.user.username}` : 'signed out');
    begin();
  }
  if (m.type === 'error' && account && /taken/.test(m.message)) {
    ws.send(JSON.stringify({ type: 'login', username: account[0], password: account[1] }));
  }
  if (m.type === 'stats') log('stats', JSON.stringify(m.entries.map((e: any) => `${e.opponent}:${e.wins}-${e.losses}/${e.games}`)));
  if (m.type === 'room') {
    log('room', m.room.code, m.room.status, m.room.seats.map((s: any) => s.name + (s.connected ? '' : '(offline)')).join(','));
    if (mode === 'host' && m.room.status === 'waiting' && m.room.seats.length === m.room.playerCount && !started) {
      started = true;
      setTimeout(() => ws.send(JSON.stringify({ type: 'start_game' })), 500);
    }
  }
  if (m.type === 'queue') log('queue', m.searching ? 'searching' : 'matched');
  if (m.type === 'error') log('error', m.message);
  if (m.type === 'event') log('event', m.kind, m.message);
  if (m.type === 'state') {
    seat = m.mySeat;
    const st = m.state;
    if (st.winner !== null || st.currentPlayer !== seat) return;
    const hand: string[] = st.players[seat].hand;
    const ordered = [...hand].sort((a, b) => Number(isTwoEyedJack(b as any)) - Number(isTwoEyedJack(a as any)));
    for (const card of ordered) {
      const t = legalTargets(st, seat, card as any);
      if (t.length) {
        log('playing', card, t[0].kind, JSON.stringify(t[0].pos));
        setTimeout(() => ws.send(JSON.stringify({ type: 'action', action: { type: t[0].kind === 'place' ? 'PLACE' : 'REMOVE', playerId: seat, card, pos: t[0].pos } })), 800);
        return;
      }
    }
    ws.send(JSON.stringify({ type: 'pass' }));
  }
});
setTimeout(() => { log('bot exiting'); ws.close(); process.exit(0); }, 20 * 60_000);
