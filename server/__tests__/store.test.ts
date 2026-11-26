import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { AuthService, hashPassword, verifyPassword } from '../auth';
import { RoomManager } from '../rooms';
import { FileStore } from '../store';

describe('FileStore + persistence', () => {
  it('round-trips rooms through serialize/hydrate so games survive a restart', async () => {
    const dir = mkdtempSync(`${tmpdir()}/seq-`);
    const store = new FileStore(dir);
    await store.init();
    const m = new RoomManager();
    const room = m.createRoom('a', 'Ann', 2, 2, true, 'Theatre', { turnSeconds: 30 }, 'user-a');
    m.joinRoom('b', 'Bob', room.code);
    m.startGame('a', 11);
    await store.saveRoom({ code: room.code, data: RoomManager.serialize(room), updatedAt: Date.now() });
    await store.close();

    const store2 = new FileStore(dir);
    await store2.init();
    const m2 = new RoomManager();
    expect(m2.hydrate((await store2.loadRooms()).map((r) => r.data))).toBe(1);
    const restored = m2.rooms.get(room.code)!;
    expect(restored.name).toBe('Theatre');
    expect(restored.game?.players[1].hand).toEqual(room.game?.players[1].hand);
    expect(restored.seats.every((s) => !s.connected)).toBe(true);
    expect(restored.seats[0].userId).toBe('user-a');
    expect(restored.rematchVotes).toBeInstanceOf(Set);
    // the restored game is playable
    expect(() => m2.setConnected('a', true)).not.toThrow();
  });
});

describe('accounts and head-to-head stats', () => {
  it('hashes and verifies passwords', () => {
    const h = hashPassword('secret123');
    expect(verifyPassword('secret123', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
  });

  it('registers, logs in, resumes sessions and tracks results per opponent', async () => {
    const store = new FileStore(mkdtempSync(`${tmpdir()}/seq-`));
    await store.init();
    const auth = new AuthService(store);
    const ann = await auth.register('Ann', 'password1');
    await expect(auth.register('ann', 'password2')).rejects.toThrow(/taken/);
    await expect(auth.register('a', 'password2')).rejects.toThrow(/3-16/);
    const bob = await auth.register('Bob', 'password1');
    await expect(auth.login('Ann', 'nope')).rejects.toThrow(/Wrong/);
    expect((await auth.login('ann', 'password1')).user.id).toBe(ann.user.id);
    expect(await auth.resume(ann.session)).toEqual(ann.user);
    await auth.logout(ann.session);
    expect(await auth.resume(ann.session)).toBeNull();

    const players = [
      { userId: ann.user.id, username: 'Ann' },
      { userId: bob.user.id, username: 'Bob' },
    ];
    await auth.recordGame(players, new Set([ann.user.id]));
    await auth.recordGame(players, new Set([ann.user.id]));
    await auth.recordGame(players, new Set([bob.user.id]));
    const annStats = await auth.statsFor(ann.user.id);
    expect(annStats).toHaveLength(1);
    expect(annStats[0]).toMatchObject({ opponent: 'Bob', games: 3, wins: 2, losses: 1 });
    const bobStats = await auth.statsFor(bob.user.id);
    expect(bobStats[0]).toMatchObject({ opponent: 'Ann', games: 3, wins: 1, losses: 2 });
  });
});
