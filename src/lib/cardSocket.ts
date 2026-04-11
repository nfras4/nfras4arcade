/**
 * WebSocket client for card games. Reuses the same pattern as the Impostor socket
 * but allows specifying the WS path per game type.
 */
import { getGuestId } from './guest';

type MessageHandler = (msg: any) => void;

function getWsUrl(roomCode: string, wsPath: string): string {
  // Always include guestId — logged-in users' session cookie takes priority
  // in the worker, so this is harmless for authenticated users but ensures
  // guests can always connect.
  const guestParam = `&guestId=${getGuestId()}`;

  if (typeof window === 'undefined') return `ws://localhost:8787${wsPath}?room=${roomCode}${guestParam}`;

  if (window.location.hostname !== 'localhost') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${wsPath}?room=${roomCode}${guestParam}`;
  }

  return `ws://localhost:8787${wsPath}?room=${roomCode}${guestParam}`;
}

export class CardGameSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pendingJoin: boolean = false;
  private currentRoom: string | null = null;
  private wsPath: string;

  constructor(wsPath: string) {
    this.wsPath = wsPath;
  }

  connect(roomCode: string, _isGuest?: boolean): Promise<void> {
    this.currentRoom = roomCode;
    // Close any existing WebSocket before creating a new one
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    return new Promise((resolve, reject) => {
      const url = getWsUrl(roomCode, this.wsPath);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.startPing();
        if (this.pendingJoin) {
          this.send({ type: 'join', code: roomCode });
          this.pendingJoin = false;
        }
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong') return;
          for (const handler of this.handlers) {
            handler(msg);
          }
        } catch {}
      };

      this.ws.onclose = () => {
        this.stopPing();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        reject(new Error('WebSocket connection failed'));
      };
    });
  }

  send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  joinRoom(code: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'join', code });
    } else {
      this.pendingJoin = true;
      this.connect(code).catch(() => {});
    }
  }

  disconnect(): void {
    this.currentRoom = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    this.ws?.close();
    this.ws = null;
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

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.currentRoom) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.currentRoom) {
        this.pendingJoin = true;
        this.connect(this.currentRoom).catch(() => {});
      }
    }, 2000);
  }
}
