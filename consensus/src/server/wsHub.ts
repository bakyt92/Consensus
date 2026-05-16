/**
 * In-process WebSocket hub. The custom server (server.ts) holds the actual
 * ws.Server; this module exposes `register` / `unregister` / `broadcast`
 * helpers other parts of the app (pipeline, server actions) can call without
 * dragging in `ws` directly.
 *
 * Layout: roomId -> Set<{send: (msg) => void; userId}>.
 *
 * Keep this module pure (no top-level side effects) so it can be imported
 * from Next route handlers, server actions, etc.
 */

export type WsClient = {
  userId: string;
  send: (data: string) => void;
};

export type WsEvent =
  | { type: "message"; message: WsMessage }
  | { type: "summary"; markdown: string }
  | {
      type: "consensus";
      status: "PENDING" | "STALLED" | "REACHED";
      percent: number;
    }
  | { type: "status"; status: "PENDING" | "OPEN" | "LOCKED" | "STOPPING" | "CLOSED" }
  | { type: "participants"; participants: Participant[] }
  | { type: "voiceCloned"; userId: string; voiceId: string }
  | { type: "closed"; redirectTo: string };

export type WsSpan = {
  label: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
};

export type WsMessage = {
  id: string;
  role: "system" | "user" | "mediator" | "research";
  text: string;
  filtered: boolean;
  userId: string | null;
  username: string | null;
  sentAt: string;
  seq: number;
  // GLiNER classification — null until classified (or always null for stub mode + system/mediator messages).
  category: string | null;
  categoryConfidence: number | null;
  sentiment: string | null; // "positive" | "negative" | "neutral"
  sentimentConfidence: number | null;
  spans: WsSpan[] | null;
};

export type Participant = {
  userId: string;
  username: string;
  role: "admin" | "participant";
};

declare global {
  // eslint-disable-next-line no-var
  var __consensusWsHub: Map<string, Set<WsClient>> | undefined;
}

const channels: Map<string, Set<WsClient>> =
  global.__consensusWsHub ?? new Map();

if (process.env.NODE_ENV !== "production") {
  global.__consensusWsHub = channels;
}

export function register(roomId: string, client: WsClient) {
  let set = channels.get(roomId);
  if (!set) {
    set = new Set();
    channels.set(roomId, set);
  }
  set.add(client);
}

export function unregister(roomId: string, client: WsClient) {
  const set = channels.get(roomId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) channels.delete(roomId);
}

export function broadcast(roomId: string, ev: WsEvent) {
  const set = channels.get(roomId);
  if (!set) return;
  const payload = JSON.stringify(ev);
  for (const client of set) {
    try {
      client.send(payload);
    } catch {
      // ignore — bad sockets will be cleaned up on close
    }
  }
}

export function clientCount(roomId: string): number {
  return channels.get(roomId)?.size ?? 0;
}
