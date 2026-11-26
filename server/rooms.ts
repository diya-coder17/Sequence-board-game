/**
 * Room and matchmaking logic, kept free of WebSocket details so it can be unit-tested.
 */
import {
  IllegalMoveError,
  applyAction,
  chooseAIMove,
  createGame,
  forcePass,
  hasAnyMove,
  isTurnExpired,
  resolveOptions,
  type Action,
  type GameOptions,
  type GameState,
} from '../src/engine';
import { roomPlayerConfigs, toClientState, type RoomInfo, type SeatInfo, type ServerMessage } from '../src/net/protocol';

export interface Seat extends SeatInfo {
  token: string;
}

export interface Room {
  code: string;
  name: string;
  /** Set once the finished game's result has been written to head-to-head stats. */
  statsRecorded: boolean;
  playerCount: number;
  teamCount: number;
  options: Required<GameOptions>;
  seats: Seat[];
  status: 'waiting' | 'playing' | 'finished';
  isPrivate: boolean;
  game: GameState | null;
  createdAt: number;
  rematchVotes: Set<string>;
}

export interface Outbound {
  token: string;
  message: ServerMessage;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  rooms = new Map<string, Room>();
  queue: { token: string; name: string; userId: string | null }[] = [];
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  private newCode(): string {
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(this.rng() * CODE_ALPHABET.length)];
    } while (this.rooms.has(code));
    return code;
  }

  roomOf(token: string): Room | undefined {
    for (const room of this.rooms.values()) if (room.seats.some((s) => s.token === token)) return room;
    return undefined;
  }

  createRoom(
    token: string,
    name: string,
    playerCount: number,
    teamCount: number,
    isPrivate = true,
    roomName = '',
    options: GameOptions = {},
    userId: string | null = null,
  ): Room {
    if (this.roomOf(token)) throw new Error('You are already in a room.');
    if (![2, 3, 4, 6].includes(playerCount)) throw new Error('Online rooms support 2, 3, 4 or 6 players.');
    if (![2, 3].includes(teamCount) || playerCount % teamCount !== 0) throw new Error('Invalid team setup.');
    const resolved = resolveOptions(teamCount, options);
    const cleanRoomName = String(roomName ?? '').replace(/[^\p{L}\p{N} _.'!&-]/gu, '').trim().slice(0, 32);
    const room: Room = {
      code: this.newCode(),
      name: cleanRoomName || `${name}'s room`,
      statsRecorded: false,
      playerCount,
      teamCount,
      options: resolved,
      seats: [{ token, name, team: 0, connected: true, isHost: true, userId }],
      status: 'waiting',
      isPrivate,
      game: null,
      createdAt: Date.now(),
      rematchVotes: new Set(),
    };
    this.rooms.set(room.code, room);
    return room;
  }

  /**
   * Join by code. Following an invite link is an explicit intent, so a stale membership in a
   * different room is dropped first; the caller gets that previous room back to notify it.
   */
  joinRoom(token: string, name: string, code: string, userId: string | null = null): Room {
    const room = this.rooms.get(code.toUpperCase().trim());
    if (!room) throw new Error('Room not found. Check the code and try again.');
    if (room.seats.some((s) => s.token === token)) return room;
    if (this.roomOf(token)) throw new Error('You are already in another room.');
    if (room.status !== 'waiting') throw new Error('That game has already started.');
    if (room.seats.length >= room.playerCount) throw new Error('That room is full.');
    const seatIndex = room.seats.length;
    room.seats.push({ token, name, team: seatIndex % room.teamCount, connected: true, isHost: false, userId });
    return room;
  }

  leaveRoom(token: string): Room | undefined {
    const room = this.roomOf(token);
    if (!room) return undefined;
    room.seats = room.seats.filter((s) => s.token !== token);
    room.rematchVotes.delete(token);
    if (room.seats.length === 0 || room.status === 'playing') {
      // A player abandoning a live game ends it for everyone.
      this.rooms.delete(room.code);
      return room.seats.length === 0 ? undefined : { ...room, status: 'finished' };
    }
    room.seats.forEach((s, i) => {
      s.team = i % room.teamCount;
      s.isHost = i === 0;
    });
    return room;
  }

  setConnected(token: string, connected: boolean): Room | undefined {
    const room = this.roomOf(token);
    const seat = room?.seats.find((s) => s.token === token);
    if (!room || !seat) return undefined;
    seat.connected = connected;
    return room;
  }

  /** Delete rooms where nobody has been connected (used by a periodic sweep). */
  sweepAbandoned(): string[] {
    const removed: string[] = [];
    for (const [code, room] of this.rooms) {
      if (room.seats.every((s) => !s.connected)) {
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }

  startGame(token: string, seed = Date.now()): Room {
    const room = this.roomOf(token);
    if (!room) throw new Error('You are not in a room.');
    const seat = room.seats.find((s) => s.token === token)!;
    if (!seat.isHost) throw new Error('Only the host can start the game.');
    if (room.seats.length !== room.playerCount) throw new Error('Waiting for more players to join.');
    room.game = createGame(roomPlayerConfigs(room.seats), seed, room.options);
    room.status = 'playing';
    room.statsRecorded = false;
    room.rematchVotes.clear();
    return room;
  }

  /**
   * Turn timer ran out: play for the current seat automatically (a sensible move, or a pass).
   * Returns null when nothing was due.
   */
  autoPlay(code: string, now = Date.now()): { room: Room; playerName: string } | null {
    const room = this.rooms.get(code);
    if (!room?.game || room.status !== 'playing' || !isTurnExpired(room.game, now)) return null;
    const seat = room.game.currentPlayer;
    const playerName = room.game.players[seat].name;
    const move = chooseAIMove(room.game);
    room.game = move ? applyAction(room.game, move, now) : forcePass(room.game, seat, now);
    if (room.game.winner !== null) room.status = 'finished';
    return { room, playerName };
  }

  applyAction(token: string, action: Action): Room {
    const room = this.roomOf(token);
    if (!room?.game) throw new IllegalMoveError('No game in progress.');
    const seat = room.seats.findIndex((s) => s.token === token);
    if (action.playerId !== seat) throw new IllegalMoveError('You can only play your own cards.');
    room.game = applyAction(room.game, action);
    if (room.game.winner !== null) room.status = 'finished';
    return room;
  }

  pass(token: string): Room {
    const room = this.roomOf(token);
    if (!room?.game) throw new IllegalMoveError('No game in progress.');
    const seat = room.seats.findIndex((s) => s.token === token);
    if (hasAnyMove(room.game, seat)) throw new IllegalMoveError('You still have a legal move.');
    room.game = forcePass(room.game, seat);
    return room;
  }

  /** Everyone must agree to a rematch; returns the room and whether it restarted. */
  voteRematch(token: string, seed = Date.now()): { room: Room; restarted: boolean } {
    const room = this.roomOf(token);
    if (!room) throw new Error('You are not in a room.');
    if (room.status !== 'finished') throw new Error('The game is still running.');
    room.rematchVotes.add(token);
    if (room.rematchVotes.size === room.seats.length) {
      room.game = createGame(roomPlayerConfigs(room.seats), seed, room.options);
      room.status = 'playing';
      room.statsRecorded = false;
      room.rematchVotes.clear();
      return { room, restarted: true };
    }
    return { room, restarted: false };
  }

  // ---- Quick match -------------------------------------------------------

  enqueue(token: string, name: string, userId: string | null = null): Room | null {
    if (this.roomOf(token)) throw new Error('Leave your room before searching.');
    if (!this.queue.some((q) => q.token === token)) this.queue.push({ token, name, userId });
    if (this.queue.length >= 2) {
      const [a, b] = this.queue.splice(0, 2);
      const room = this.createRoom(a.token, a.name, 2, 2, false, '', {}, a.userId);
      this.joinRoom(b.token, b.name, room.code, b.userId);
      this.startGame(a.token);
      return room;
    }
    return null;
  }

  dequeue(token: string): void {
    this.queue = this.queue.filter((q) => q.token !== token);
  }

  // ---- Serialisation -----------------------------------------------------

  roomInfo(room: Room, token: string): RoomInfo {
    return {
      code: room.code,
      name: room.name,
      playerCount: room.playerCount,
      teamCount: room.teamCount,
      options: room.options,
      seats: room.seats.map(({ name, team, connected, isHost, userId }) => ({ name, team, connected, isHost, userId })),
      status: room.status,
      isPrivate: room.isPrivate,
      mySeat: room.seats.findIndex((s) => s.token === token),
      rematchWanted: room.seats.filter((s) => room.rematchVotes.has(s.token)).map((s) => s.name),
    };
  }

  // ---- Persistence ----------------------------------------------------------

  /** Plain-JSON form of a room (Sets become arrays). */
  static serialize(room: Room): unknown {
    return { ...room, rematchVotes: [...room.rematchVotes], seats: room.seats.map((s) => ({ ...s, connected: false })) };
  }

  /** Restore rooms saved by `serialize`. Everyone starts disconnected until they say hello again. */
  hydrate(rooms: unknown[]): number {
    let n = 0;
    for (const raw of rooms) {
      const r = raw as Room & { rematchVotes: string[] | Set<string> };
      if (!r?.code || !Array.isArray(r.seats)) continue;
      this.rooms.set(r.code, { ...r, statsRecorded: r.statsRecorded ?? false, rematchVotes: new Set(r.rematchVotes ?? []) });
      n++;
    }
    return n;
  }

  /** Messages that bring every seat in the room up to date. */
  broadcastRoom(room: Room): Outbound[] {
    const out: Outbound[] = [];
    for (const seat of room.seats) {
      out.push({ token: seat.token, message: { type: 'room', room: this.roomInfo(room, seat.token) } });
      if (room.game) {
        const mySeat = room.seats.indexOf(seat);
        out.push({ token: seat.token, message: { type: 'state', state: toClientState(room.game, mySeat), mySeat } });
      }
    }
    return out;
  }
}
