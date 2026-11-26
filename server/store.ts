/**
 * Durable storage so games survive server restarts and page refreshes.
 * - MongoStore when MONGODB_URI is set (Atlas free tier works).
 * - FileStore otherwise: a JSON file under DATA_DIR (default ./data). Fine for local play and
 *   for hosts with a persistent disk; ephemeral on Render's free tier.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MongoClient, type Collection, type Db } from 'mongodb';

export interface StoredRoom {
  code: string;
  data: unknown; // serialised Room (sets converted to arrays)
  updatedAt: number;
}
export interface StoredClient {
  token: string;
  name: string;
  userId: string | null;
  updatedAt: number;
}
export interface UserRecord {
  id: string;
  username: string; // display form
  usernameLower: string;
  passwordHash: string; // scrypt: salt:hash (hex)
  createdAt: number;
}
export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: number;
}
/** Head-to-head record between two accounts, keyed by sorted pair. */
export interface PairStats {
  key: string; // `${idA}|${idB}` with idA < idB
  users: [string, string];
  names: Record<string, string>;
  games: number;
  wins: Record<string, number>;
  lastPlayedAt: number;
}

export interface Store {
  init(): Promise<void>;
  loadRooms(): Promise<StoredRoom[]>;
  saveRoom(room: StoredRoom): Promise<void>;
  deleteRoom(code: string): Promise<void>;
  loadClients(): Promise<StoredClient[]>;
  saveClient(client: StoredClient): Promise<void>;
  findUserByName(usernameLower: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  createUser(user: UserRecord): Promise<void>;
  createSession(session: SessionRecord): Promise<void>;
  findSession(token: string): Promise<SessionRecord | null>;
  deleteSession(token: string): Promise<void>;
  getPairStats(key: string): Promise<PairStats | null>;
  savePairStats(stats: PairStats): Promise<void>;
  listPairStatsFor(userId: string): Promise<PairStats[]>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------- File store

interface FileShape {
  rooms: Record<string, StoredRoom>;
  clients: Record<string, StoredClient>;
  users: Record<string, UserRecord>;
  sessions: Record<string, SessionRecord>;
  pairs: Record<string, PairStats>;
}

export class FileStore implements Store {
  private data: FileShape = { rooms: {}, clients: {}, users: {}, sessions: {}, pairs: {} };
  private path: string;
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(dir = process.env.DATA_DIR ?? join(process.cwd(), 'data'), file = 'sequence-state.json') {
    mkdirSync(dir, { recursive: true });
    this.path = join(dir, file);
  }

  async init() {
    if (existsSync(this.path)) {
      try {
        this.data = { ...this.data, ...JSON.parse(readFileSync(this.path, 'utf8')) };
      } catch {
        /* corrupt file: start fresh */
      }
    }
  }
  private schedule() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 150);
    this.timer.unref?.();
  }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.path);
  }
  async loadRooms() {
    return Object.values(this.data.rooms);
  }
  async saveRoom(room: StoredRoom) {
    this.data.rooms[room.code] = room;
    this.schedule();
  }
  async deleteRoom(code: string) {
    delete this.data.rooms[code];
    this.schedule();
  }
  async loadClients() {
    return Object.values(this.data.clients);
  }
  async saveClient(client: StoredClient) {
    this.data.clients[client.token] = client;
    this.schedule();
  }
  async findUserByName(usernameLower: string) {
    return Object.values(this.data.users).find((u) => u.usernameLower === usernameLower) ?? null;
  }
  async findUserById(id: string) {
    return this.data.users[id] ?? null;
  }
  async createUser(user: UserRecord) {
    this.data.users[user.id] = user;
    this.schedule();
  }
  async createSession(session: SessionRecord) {
    this.data.sessions[session.token] = session;
    this.schedule();
  }
  async findSession(token: string) {
    return this.data.sessions[token] ?? null;
  }
  async deleteSession(token: string) {
    delete this.data.sessions[token];
    this.schedule();
  }
  async getPairStats(key: string) {
    return this.data.pairs[key] ?? null;
  }
  async savePairStats(stats: PairStats) {
    this.data.pairs[stats.key] = stats;
    this.schedule();
  }
  async listPairStatsFor(userId: string) {
    return Object.values(this.data.pairs)
      .filter((p) => p.users.includes(userId))
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
  }
  async close() {
    if (this.timer) clearTimeout(this.timer);
    this.flush();
  }
}

// --------------------------------------------------------------- Mongo store

export class MongoStore implements Store {
  private client: MongoClient;
  private db!: Db;
  private rooms!: Collection<StoredRoom>;
  private clients!: Collection<StoredClient>;
  private users!: Collection<UserRecord>;
  private sessions!: Collection<SessionRecord>;
  private pairs!: Collection<PairStats>;

  constructor(uri: string, private dbName = process.env.MONGODB_DB ?? 'sequence') {
    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  }
  async init() {
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.rooms = this.db.collection('rooms');
    this.clients = this.db.collection('clients');
    this.users = this.db.collection('users');
    this.sessions = this.db.collection('sessions');
    this.pairs = this.db.collection('pairs');
    await Promise.all([
      this.rooms.createIndex({ code: 1 }, { unique: true }),
      this.clients.createIndex({ token: 1 }, { unique: true }),
      this.clients.createIndex({ updatedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }),
      this.users.createIndex({ usernameLower: 1 }, { unique: true }),
      this.users.createIndex({ id: 1 }, { unique: true }),
      this.sessions.createIndex({ token: 1 }, { unique: true }),
      this.pairs.createIndex({ key: 1 }, { unique: true }),
      this.pairs.createIndex({ users: 1 }),
    ]);
  }
  async loadRooms() {
    return this.rooms.find({}, { projection: { _id: 0 } }).toArray();
  }
  async saveRoom(room: StoredRoom) {
    await this.rooms.replaceOne({ code: room.code }, room, { upsert: true });
  }
  async deleteRoom(code: string) {
    await this.rooms.deleteOne({ code });
  }
  async loadClients() {
    return this.clients.find({}, { projection: { _id: 0 } }).toArray();
  }
  async saveClient(client: StoredClient) {
    await this.clients.replaceOne({ token: client.token }, client, { upsert: true });
  }
  async findUserByName(usernameLower: string) {
    return this.users.findOne({ usernameLower }, { projection: { _id: 0 } });
  }
  async findUserById(id: string) {
    return this.users.findOne({ id }, { projection: { _id: 0 } });
  }
  async createUser(user: UserRecord) {
    await this.users.insertOne({ ...user });
  }
  async createSession(session: SessionRecord) {
    await this.sessions.insertOne({ ...session });
  }
  async findSession(token: string) {
    return this.sessions.findOne({ token }, { projection: { _id: 0 } });
  }
  async deleteSession(token: string) {
    await this.sessions.deleteOne({ token });
  }
  async getPairStats(key: string) {
    return this.pairs.findOne({ key }, { projection: { _id: 0 } });
  }
  async savePairStats(stats: PairStats) {
    await this.pairs.replaceOne({ key: stats.key }, stats, { upsert: true });
  }
  async listPairStatsFor(userId: string) {
    return this.pairs.find({ users: userId }, { projection: { _id: 0 } }).sort({ lastPlayedAt: -1 }).limit(50).toArray();
  }
  async close() {
    await this.client.close();
  }
}

export function createStore(): Store {
  const uri = process.env.MONGODB_URI;
  return uri ? new MongoStore(uri) : new FileStore();
}
