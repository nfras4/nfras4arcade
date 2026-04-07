import { createRoom, getRoom, deleteRoom } from './game';
import type { ClientMessage, ServerMessage } from '../src/lib/types';
import { existsSync } from 'fs';
import { join } from 'path';

const PORT = parseInt(process.env.PORT || '3001');
const IS_PROD = process.env.NODE_ENV === 'production';
const BUILD_DIR = join(import.meta.dir, '..', 'build');
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:5174'];

const MAX_MESSAGE_SIZE = 2048; // bytes
const MAX_TEXT_LENGTH = 200;   // chars for hints and chat
const MAX_NAME_LENGTH = 20;

// Map WebSocket → playerId + roomCode
const wsData = new WeakMap<any, { playerId: string; roomCode: string }>();

// Rate limiting: max 20 messages per 5 seconds per connection
const RATE_WINDOW_MS = 5000;
const RATE_MAX_MESSAGES = 20;
const wsRateLimit = new WeakMap<any, number[]>();

function isRateLimited(ws: any): boolean {
  const now = Date.now();
  let timestamps = wsRateLimit.get(ws);
  if (!timestamps) {
    timestamps = [];
    wsRateLimit.set(ws, timestamps);
  }
  // Remove timestamps outside window
  while (timestamps.length > 0 && timestamps[0] < now - RATE_WINDOW_MS) {
    timestamps.shift();
  }
  if (timestamps.length >= RATE_MAX_MESSAGES) return true;
  timestamps.push(now);
  return false;
}

function sanitizeText(text: string, maxLength: number): string {
  return text.replace(/<[^>]*>/g, '').trim().slice(0, maxLength);
}

function getCorsHeaders(origin?: string): Record<string, string> {
  const allowed = !IS_PROD || (origin && ALLOWED_ORIGINS.includes(origin));
  return {
    'Access-Control-Allow-Origin': allowed && origin ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function handleMessage(ws: any, raw: string) {
  // Rate limiting
  if (isRateLimited(ws)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Too many messages, slow down' }));
    return;
  }

  // Message size cap
  if (raw.length > MAX_MESSAGE_SIZE) {
    ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
    return;
  }

  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    return;
  }

  if (msg.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
    return;
  }

  if (msg.type === 'join') {
    const code = msg.code.toUpperCase();
    let room = getRoom(code);

    // If code is 'NEW', create a new room
    if (msg.code === 'NEW') {
      room = createRoom();
    }

    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room not found' } satisfies ServerMessage));
      return;
    }

    const name = sanitizeText(msg.name, MAX_NAME_LENGTH);
    if (!name) {
      ws.send(JSON.stringify({ type: 'error', message: 'Name is required' } satisfies ServerMessage));
      return;
    }

    room.touch();
    const playerId = crypto.randomUUID();
    const result = room.addPlayer(playerId, name, ws);

    if (!result.success) {
      ws.send(JSON.stringify({ type: 'error', message: result.error } satisfies ServerMessage));
      return;
    }

    wsData.set(ws, { playerId, roomCode: room.code });

    // Send join confirmation with full state
    const joinMsg: ServerMessage = {
      type: 'joined',
      playerId,
      state: room.getStateForPlayer(playerId)
    };
    ws.send(JSON.stringify(joinMsg));

    // Notify others
    room.broadcastState();
    return;
  }

  // All other messages require being in a room
  const data = wsData.get(ws);
  if (!data) {
    ws.send(JSON.stringify({ type: 'error', message: 'Not in a room' } satisfies ServerMessage));
    return;
  }

  const { playerId, roomCode } = data;
  const room = getRoom(roomCode);
  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room no longer exists' } satisfies ServerMessage));
    return;
  }

  room.touch();

  switch (msg.type) {
    case 'select_category': {
      if (playerId !== room.hostId) break;
      room.selectCategory(msg.category);
      room.broadcastState();
      break;
    }

    case 'select_mode': {
      if (playerId !== room.hostId) break;
      room.selectMode(msg.mode);
      room.broadcastState();
      break;
    }

    case 'start_game': {
      if (playerId !== room.hostId) {
        room.sendTo(playerId, { type: 'error', message: 'Only the host can start the game' });
        break;
      }
      const result = room.startGame();
      if (!result.success) {
        room.sendTo(playerId, { type: 'error', message: result.error! });
        break;
      }
      room.broadcastState();
      break;
    }

    case 'give_hint': {
      const text = sanitizeText(msg.text, MAX_TEXT_LENGTH);
      if (!text) {
        room.sendTo(playerId, { type: 'error', message: 'Hint cannot be empty' });
        break;
      }
      const result = room.giveHint(playerId, text);
      if (!result.success) {
        room.sendTo(playerId, { type: 'error', message: result.error! });
        break;
      }
      room.broadcastState();
      break;
    }

    case 'mark_done': {
      const result = room.markDone(playerId);
      if (!result.success) {
        room.sendTo(playerId, { type: 'error', message: result.error! });
        break;
      }
      room.broadcastState();
      break;
    }

    case 'chat': {
      const cp = room.players.get(playerId);
      if (!cp) break;
      room.broadcast({
        type: 'chat_message',
        playerId,
        name: cp.player.name,
        text: sanitizeText(msg.text, MAX_TEXT_LENGTH),
        timestamp: Date.now()
      });
      break;
    }

    case 'start_voting': {
      if (playerId !== room.hostId) {
        room.sendTo(playerId, { type: 'error', message: 'Only the host can start voting' });
        break;
      }
      const result = room.startVoting();
      if (!result.success) {
        room.sendTo(playerId, { type: 'error', message: result.error! });
        break;
      }
      room.broadcastState();
      break;
    }

    case 'vote': {
      const result = room.vote(playerId, msg.targetId);
      if (!result.success) {
        room.sendTo(playerId, { type: 'error', message: result.error! });
        break;
      }
      // Notify others that someone voted (without revealing who for)
      room.broadcast({ type: 'vote_cast', voterId: playerId });

      if (result.allVoted) {
        const roundResult = room.resolveVotes();
        room.broadcast({ type: 'round_result', result: roundResult });
        room.broadcastState();
      }
      break;
    }

    case 'next_hint_round': {
      if (playerId !== room.hostId) {
        room.sendTo(playerId, { type: 'error', message: 'Only the host can advance rounds' });
        break;
      }
      const result = room.nextHintRound();
      if (!result.success) {
        room.sendTo(playerId, { type: 'error', message: result.error! });
        break;
      }
      room.broadcastState();
      break;
    }

    case 'play_again': {
      if (playerId !== room.hostId) break;
      room.playAgain();
      room.broadcastState();
      break;
    }

    case 'end_game': {
      if (playerId !== room.hostId) break;
      room.endGame();
      room.broadcastState();
      break;
    }
  }
}

function handleClose(ws: any) {
  const data = wsData.get(ws);
  if (!data) return;

  const room = getRoom(data.roomCode);
  if (room) {
    const empty = room.removePlayer(data.playerId);
    if (empty) {
      deleteRoom(data.roomCode);
    } else {
      room.broadcastState();
    }
  }
}

// Serve static files in production
function serveStatic(path: string): Response | null {
  if (!IS_PROD) return null;

  let filePath = join(BUILD_DIR, path);

  // Try exact path first, then index.html for SPA routing
  if (existsSync(filePath) && !Bun.file(filePath).name?.endsWith('/')) {
    return new Response(Bun.file(filePath));
  }

  // SPA fallback
  const indexPath = join(BUILD_DIR, 'index.html');
  if (existsSync(indexPath)) {
    return new Response(Bun.file(indexPath), {
      headers: { 'content-type': 'text/html' }
    });
  }

  return null;
}

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === '/ws') {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined as any;
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // API: list categories
    if (url.pathname === '/api/categories') {
      const { getCategories } = require('./words');
      return Response.json(getCategories());
    }

    // API: create room (returns code)
    if (url.pathname === '/api/create' && req.method === 'POST') {
      const room = createRoom();
      return Response.json({ code: room.code });
    }

    // API: check room exists
    if (url.pathname.startsWith('/api/room/')) {
      const code = url.pathname.split('/').pop()?.toUpperCase();
      if (code) {
        const room = getRoom(code);
        if (room) {
          return Response.json({
            code: room.code,
            playerCount: room.players.size,
            phase: room.phase
          });
        }
      }
      return Response.json({ error: 'Room not found' }, { status: 404 });
    }

    // CORS preflight
    const origin = req.headers.get('origin') || undefined;
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: getCorsHeaders(origin) });
    }

    // Static files in production
    const staticResponse = serveStatic(url.pathname === '/' ? '/index.html' : url.pathname);
    if (staticResponse) {
      for (const [k, v] of Object.entries(getCorsHeaders(origin))) {
        staticResponse.headers.set(k, v);
      }
      return staticResponse;
    }

    return new Response('Not found', { status: 404 });
  },

  websocket: {
    maxPayloadLength: MAX_MESSAGE_SIZE,
    message(ws, message) {
      handleMessage(ws, typeof message === 'string' ? message : new TextDecoder().decode(message));
    },
    close(ws) {
      handleClose(ws);
    },
    open(ws) {
      // Connection opened, waiting for join message
    }
  }
});

console.log(`🎭 Impostor server running on http://localhost:${PORT}`);
if (IS_PROD) {
  console.log(`   Serving static files from ${BUILD_DIR}`);
}
