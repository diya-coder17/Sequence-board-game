import { describe, expect, it } from 'vitest';
import { RoomManager } from '../rooms';
import { legalTargets } from '../../src/engine';

describe('RoomManager', () => {
  it('creates and joins a private room, host starts when full', () => {
    const m = new RoomManager(() => 0.5);
    const room = m.createRoom('a', 'Ann', 2, 2);
    expect(room.code).toHaveLength(6);
    expect(() => m.startGame('a')).toThrow(/Waiting/);
    m.joinRoom('b', 'Bob', room.code.toLowerCase());
    expect(() => m.startGame('b')).toThrow(/host/);
    m.startGame('a', 7);
    expect(room.status).toBe('playing');
    expect(room.game?.players.map((p) => p.team)).toEqual([0, 1]);
    expect(() => m.joinRoom('c', 'Cat', room.code)).toThrow(/started/);
  });

  it('strips other hands from client state', () => {
    const m = new RoomManager();
    const room = m.createRoom('a', 'Ann', 2, 2);
    m.joinRoom('b', 'Bob', room.code);
    m.startGame('a', 1);
    const out = m.broadcastRoom(room);
    const stateForB = out.find((o) => o.token === 'b' && o.message.type === 'state')!.message;
    if (stateForB.type !== 'state') throw new Error();
    expect(stateForB.state.players[0].hand).toEqual([]);
    expect(stateForB.state.players[1].hand).toHaveLength(7);
    expect(stateForB.state.handCounts).toEqual([7, 7]);
    expect(stateForB.state.drawPile).toEqual([]);
    expect(stateForB.state.drawCount).toBe(90);
  });

  it('only lets a player act for their own seat and on their turn', () => {
    const m = new RoomManager();
    const room = m.createRoom('a', 'Ann', 2, 2);
    m.joinRoom('b', 'Bob', room.code);
    m.startGame('a', 1);
    const g = room.game!;
    const card = g.players[0].hand.find((c) => legalTargets(g, 0, c).length)!;
    const pos = legalTargets(g, 0, card)[0].pos;
    expect(() => m.applyAction('b', { type: 'PLACE', playerId: 0, card, pos })).toThrow(/own cards/);
    expect(() => m.applyAction('b', { type: 'PLACE', playerId: 1, card, pos })).toThrow(/not your turn/);
    m.applyAction('a', { type: 'PLACE', playerId: 0, card, pos });
    expect(room.game!.currentPlayer).toBe(1);
  });

  it('pairs two quick-match players into a started game', () => {
    const m = new RoomManager();
    expect(m.enqueue('a', 'Ann')).toBeNull();
    const room = m.enqueue('b', 'Bob');
    expect(room?.status).toBe('playing');
    expect(room?.isPrivate).toBe(false);
    expect(m.queue).toHaveLength(0);
  });

  it('ends a live game when someone leaves, and reseats a waiting room', () => {
    const m = new RoomManager();
    const room = m.createRoom('a', 'Ann', 3, 3);
    m.joinRoom('b', 'Bob', room.code);
    m.joinRoom('c', 'Cat', room.code);
    const after = m.leaveRoom('a')!;
    expect(after.seats.map((s) => [s.name, s.team, s.isHost])).toEqual([
      ['Bob', 0, true],
      ['Cat', 1, false],
    ]);
    m.joinRoom('d', 'Dan', room.code);
    m.startGame('b');
    expect(m.leaveRoom('c')?.status).toBe('finished');
    expect(m.rooms.has(room.code)).toBe(false);
  });

  it('stores a room name and options, and applies them to the game', () => {
    const m = new RoomManager();
    const room = m.createRoom('a', 'Ann', 2, 2, true, "Ann's Theatre <script>", { teamColors: ['red', 'green'], sequencesToWin: 1, turnSeconds: 45 });
    expect(room.name).toBe("Ann's Theatre script");
    expect(m.createRoom('z', 'Zed', 2, 2).name).toBe("Zed's room");
    m.joinRoom('b', 'Bob', room.code);
    m.startGame('a', 3);
    expect(room.game?.teamColors).toEqual(['red', 'green']);
    expect(room.game?.targetSequences).toBe(1);
    expect(room.game?.turnSeconds).toBe(45);
    expect(m.roomInfo(room, 'b').options.sequencesToWin).toBe(1);
    expect(() => m.createRoom('c', 'Cat', 2, 2, true, '', { teamColors: ['red', 'red'] })).toThrow(/different/);
  });

  it('auto-plays for a player whose turn timer expired', () => {
    const m = new RoomManager();
    const room = m.createRoom('a', 'Ann', 2, 2, true, '', { turnSeconds: 30 });
    m.joinRoom('b', 'Bob', room.code);
    m.startGame('a', 3);
    const start = room.game!.turnStartedAt;
    expect(m.autoPlay(room.code, start + 10_000)).toBeNull();
    const result = m.autoPlay(room.code, start + 31_000);
    expect(result?.playerName).toBe('Ann');
    expect(room.game!.currentPlayer).toBe(1);
    expect(room.game!.turnStartedAt).toBe(start + 31_000);
    expect(room.game!.players[0].hand).toHaveLength(7);
  });

  it('requires everyone to agree to a rematch', () => {
    const m = new RoomManager();
    const room = m.createRoom('a', 'Ann', 2, 2);
    m.joinRoom('b', 'Bob', room.code);
    m.startGame('a');
    room.status = 'finished';
    expect(m.voteRematch('a').restarted).toBe(false);
    expect(m.voteRematch('b').restarted).toBe(true);
    expect(room.status).toBe('playing');
  });
});
