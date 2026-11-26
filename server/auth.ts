/** Optional accounts: username + password (scrypt), opaque session tokens, head-to-head stats. */
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { PairStats, Store, UserRecord } from './store';

export interface PublicUser {
  id: string;
  username: string;
}

const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,16}$/u;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export class AuthService {
  constructor(private store: Store) {}

  async register(username: string, password: string): Promise<{ user: PublicUser; session: string }> {
    const name = String(username ?? '').trim();
    if (!USERNAME_RE.test(name)) throw new Error('Username must be 3-16 letters, numbers, dots, dashes or underscores.');
    if (typeof password !== 'string' || password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (await this.store.findUserByName(name.toLowerCase())) throw new Error('That username is taken.');
    const user: UserRecord = { id: randomUUID(), username: name, usernameLower: name.toLowerCase(), passwordHash: hashPassword(password), createdAt: Date.now() };
    await this.store.createUser(user);
    return { user: { id: user.id, username: user.username }, session: await this.newSession(user.id) };
  }

  async login(username: string, password: string): Promise<{ user: PublicUser; session: string }> {
    const user = await this.store.findUserByName(String(username ?? '').trim().toLowerCase());
    if (!user || !verifyPassword(String(password ?? ''), user.passwordHash)) throw new Error('Wrong username or password.');
    return { user: { id: user.id, username: user.username }, session: await this.newSession(user.id) };
  }

  async resume(sessionToken: string): Promise<PublicUser | null> {
    const session = await this.store.findSession(sessionToken);
    if (!session) return null;
    const user = await this.store.findUserById(session.userId);
    return user ? { id: user.id, username: user.username } : null;
  }

  async logout(sessionToken: string) {
    await this.store.deleteSession(sessionToken);
  }

  private async newSession(userId: string) {
    const token = randomBytes(32).toString('hex');
    await this.store.createSession({ token, userId, createdAt: Date.now() });
    return token;
  }

  // ---- Head-to-head stats ------------------------------------------------

  static pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  /** Record a finished game between logged-in players. `winners` = user ids on the winning team. */
  async recordGame(players: { userId: string; username: string }[], winners: Set<string>) {
    const now = Date.now();
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        if (a.userId === b.userId) continue;
        const key = AuthService.pairKey(a.userId, b.userId);
        const existing = (await this.store.getPairStats(key)) ?? {
          key,
          users: a.userId < b.userId ? [a.userId, b.userId] : [b.userId, a.userId],
          names: {},
          games: 0,
          wins: { [a.userId]: 0, [b.userId]: 0 },
          lastPlayedAt: now,
        };
        existing.names[a.userId] = a.username;
        existing.names[b.userId] = b.username;
        existing.games += 1;
        if (winners.has(a.userId) && !winners.has(b.userId)) existing.wins[a.userId] = (existing.wins[a.userId] ?? 0) + 1;
        if (winners.has(b.userId) && !winners.has(a.userId)) existing.wins[b.userId] = (existing.wins[b.userId] ?? 0) + 1;
        existing.lastPlayedAt = now;
        await this.store.savePairStats(existing as PairStats);
      }
    }
  }

  async statsFor(userId: string) {
    const pairs = await this.store.listPairStatsFor(userId);
    return pairs.map((p) => {
      const other = p.users[0] === userId ? p.users[1] : p.users[0];
      return {
        opponentId: other,
        opponent: p.names[other] ?? 'Unknown',
        games: p.games,
        wins: p.wins[userId] ?? 0,
        losses: p.wins[other] ?? 0,
        lastPlayedAt: p.lastPlayedAt,
      };
    });
  }
}
