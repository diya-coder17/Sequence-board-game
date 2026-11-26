import type { ClientMessage, ServerMessage } from './protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

const TOKEN_KEY = 'sequence.token';
const NAME_KEY = 'sequence.name';
const SESSION_KEY = 'sequence.session';
const PING_MS = 20_000;
const WATCHDOG_MS = 50_000;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Reconnecting WebSocket wrapper.
 * - A per-browser player token (localStorage) so refreshes and new tabs rejoin the same seat.
 * - Heartbeat pings plus a watchdog: if the server goes quiet the socket is recycled.
 * - Reconnects immediately when the tab becomes visible or the network comes back.
 */
export class GameClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<(m: ServerMessage) => void>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private retry = 0;
  private closedByUser = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  status: ConnectionStatus = 'closed';
  name: string;

  constructor(name?: string) {
    this.name = name ?? GameClient.savedName();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onWake);
      window.addEventListener('online', this.onWake);
      window.addEventListener('focus', this.onWake);
    }
  }

  static savedName(): string {
    return read(NAME_KEY) ?? '';
  }
  static saveName(name: string) {
    write(NAME_KEY, name);
  }
  get session(): string | null {
    return read(SESSION_KEY);
  }
  set session(v: string | null) {
    write(SESSION_KEY, v);
  }
  private get token(): string | null {
    return read(TOKEN_KEY);
  }
  private set token(v: string | null) {
    write(TOKEN_KEY, v);
  }

  /**
   * Game-server address. When the client is hosted separately (e.g. Vercel) set VITE_WS_URL at
   * build time to the server's origin, such as https://sequence-online.onrender.com.
   * Otherwise the same host serves the WebSocket at /ws.
   */
  static url(): string {
    const configured = import.meta.env.VITE_WS_URL as string | undefined;
    if (configured) {
      const base = configured.replace(/^http/, 'ws').replace(/\/+$/, '');
      return base.endsWith('/ws') ? base : `${base}/ws`;
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/ws`;
  }

  private onWake = () => {
    if (this.closedByUser) return;
    if (document.visibilityState === 'hidden') return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'ping' });
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) this.connect();
  };

  connect() {
    this.closedByUser = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.setStatus(this.retry ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(GameClient.url());
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
      ws.send(JSON.stringify({ type: 'hello', token: this.token, name: this.name, session: this.session } satisfies ClientMessage));
      this.startHeartbeat();
    };
    ws.onmessage = (ev) => {
      this.feedWatchdog();
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'welcome') {
        this.token = msg.token;
        this.name = msg.name;
      }
      if (msg.type === 'auth') this.session = msg.session;
      if (msg.type === 'pong') return;
      for (const l of this.listeners) l(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopHeartbeat();
      if (this.closedByUser) return this.setStatus('closed');
      this.setStatus('reconnecting');
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.closedByUser) this.connect();
      }, delay);
    };
    ws.onerror = () => ws.close();
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_MS);
    this.feedWatchdog();
  }
  private stopHeartbeat() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.watchdog) clearTimeout(this.watchdog);
    this.pingTimer = null;
    this.watchdog = null;
  }
  private feedWatchdog() {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      // Server went silent: recycle the socket so the reconnect logic takes over.
      this.ws?.close();
    }, WATCHDOG_MS);
  }

  close() {
    this.closedByUser = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    document.removeEventListener('visibilitychange', this.onWake);
    window.removeEventListener('online', this.onWake);
    window.removeEventListener('focus', this.onWake);
    this.ws?.close();
    this.ws = null;
    this.setStatus('closed');
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  /** Forget the saved login (used on sign-out). */
  clearSession() {
    this.session = null;
  }

  setName(name: string) {
    this.name = name;
    GameClient.saveName(name);
    this.send({ type: 'set_name', name });
  }

  onMessage(fn: (m: ServerMessage) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  onStatus(fn: (s: ConnectionStatus) => void) {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => void this.statusListeners.delete(fn);
  }
  private setStatus(s: ConnectionStatus) {
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }
}
