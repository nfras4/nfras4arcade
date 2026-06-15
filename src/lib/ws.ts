import type { ClientMessage, ServerMessage } from './types';
import { getGuestId } from './guest';
import { shouldReconnect, reconnectDelay } from './reconnect';

type MessageHandler = (msg: ServerMessage) => void;

function getWsUrl(roomCode: string): string {
  // Always include guestId — logged-in users' session cookie takes priority
  // in the worker, so this is harmless for authenticated users but ensures
  // guests can always connect.
  const guestParam = `&guestId=${getGuestId()}`;

  if (typeof window === 'undefined') return `ws://localhost:8787/ws?room=${roomCode}${guestParam}`;

  const envUrl = import.meta.env.PUBLIC_WS_URL;
  if (envUrl) return `${envUrl}/ws?room=${roomCode}${guestParam}`;

  if (window.location.hostname !== 'localhost') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws?room=${roomCode}${guestParam}`;
  }

  return `ws://localhost:8787/ws?room=${roomCode}${guestParam}`;
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pendingJoin: ClientMessage | null = null;
  private currentRoom: string | null = null;
  private reconnectAttempts = 0;

  connect(roomCode: string, _isGuest?: boolean): Promise<void> {
    this.currentRoom = roomCode;
    // Close any existing WebSocket before creating a new one
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    return new Promise((resolve, reject) => {
      const url = getWsUrl(roomCode);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        // A clean open resets the backoff so the next genuine drop starts at 2s.
        this.reconnectAttempts = 0;
        this.startPing();
        if (this.pendingJoin) {
          this.send(this.pendingJoin);
          this.pendingJoin = null;
        }
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          if (msg.type === 'pong') return;
          for (const handler of this.handlers) {
            handler(msg);
          }
        } catch {}
      };

      this.ws.onclose = (event) => {
        this.stopPing();
        this.scheduleReconnect(event.code);
      };

      this.ws.onerror = () => {
        reject(new Error('WebSocket connection failed'));
      };
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  joinRoom(code: string, name?: string): void {
    const msg: ClientMessage = name
      ? { type: 'join', code, name }
      : { type: 'join', code, name: '' };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send(msg);
    } else {
      this.pendingJoin = msg;
      this.connect(code).catch(() => {});
    }
  }

  disconnect(): void {
    this.currentRoom = null;
    this.reconnectAttempts = 0;
    this.pendingJoin = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    if (this.ws) {
      // Drop the close handler first so tearing down does not schedule a reconnect.
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(closeCode = 1006): void {
    if (this.reconnectTimer || !this.currentRoom) return;
    // Never reconnect on a deliberate server close (1000/4001), and stop after
    // the ceiling so a dissolved/expired room can't trigger an endless 2s storm.
    if (!shouldReconnect(closeCode, this.reconnectAttempts)) {
      this.currentRoom = null;
      this.reconnectAttempts = 0;
      return;
    }
    const delay = reconnectDelay(this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.currentRoom) {
        // Re-send join on reconnect so the server knows we're back
        this.pendingJoin = { type: 'join', code: this.currentRoom, name: '' };
        this.connect(this.currentRoom).catch(() => {});
      }
    }, delay);
  }
}

export const socket = new GameSocket();
