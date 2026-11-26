import type { ClientMessage, ServerMessage } from './protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

const TOKEN_KEY = 'sequence.token';
const NAME_KEY = 'sequence.name';

/** Thin reconnecting WebSocket wrapper. Keeps a per-tab token so refreshes rejoin the room. */
export class GameClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<(m: ServerMessage) => void>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private retry = 0;
  private closedByUser = false;
  status: ConnectionStatus = 'closed';
  name: string;

  constructor(name?: string) {
    this.name = name ?? GameClient.savedName();
  }

  static savedName(): string {
    try {
      return localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      return '';
    }
  }
  static saveName(name: string) {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* ignore */
    }
  }
  private get token(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }
  private set token(v: string | null) {
    try {
      if (v) sessionStorage.setItem(TOKEN_KEY, v);
    } catch {
      /* ignore */
    }
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

  connect() {
    this.closedByUser = false;
    this.setStatus(this.retry ? 'reconnecting' : 'connecting');
    const ws = new WebSocket(GameClient.url());
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
      ws.send(JSON.stringify({ type: 'hello', token: this.token, name: this.name } satisfies ClientMessage));
    };
    ws.onmessage = (ev) => {
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
      for (const l of this.listeners) l(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closedByUser) return this.setStatus('closed');
      this.setStatus('reconnecting');
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => !this.closedByUser && this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
    this.setStatus('closed');
  }

  send(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
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
