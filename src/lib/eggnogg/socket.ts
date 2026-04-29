/**
 * WebSocket client wrapper for /ws/eggnogg.
 * Mirrors the shape of GameSocket in $lib/ws.ts but routes to the Eggnogg DO.
 */

import { getGuestId } from '$lib/guest';

type MessageHandler = (msg: unknown) => void;

function getWsUrl(roomCode: string): string {
  const guestParam = `&guestId=${getGuestId()}`;

  if (typeof window === 'undefined') {
    return `ws://localhost:8787/ws/eggnogg?room=${roomCode}${guestParam}`;
  }

  const envUrl = import.meta.env.PUBLIC_WS_URL;
  if (envUrl) return `${envUrl}/ws/eggnogg?room=${roomCode}${guestParam}`;

  if (window.location.hostname !== 'localhost') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/eggnogg?room=${roomCode}${guestParam}`;
  }

  return `ws://localhost:8787/ws/eggnogg?room=${roomCode}${guestParam}`;
}

export class EggnoggSocket {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private currentRoom: string | null = null;

  connect(roomCode: string): Promise<void> {
    this.currentRoom = roomCode;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    return new Promise((resolve, reject) => {
      const url = getWsUrl(roomCode);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.startPing();
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: unknown = JSON.parse(event.data as string);
          if (typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).type === 'pong') return;
          for (const handler of this.handlers) {
            handler(msg);
          }
        } catch {
          // Ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        this.stopPing();
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        reject(new Error('EggnoggSocket connection failed'));
      };
    });
  }

  send(msg: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
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
        this.connect(this.currentRoom).catch(() => {});
      }
    }, 2000);
  }
}
