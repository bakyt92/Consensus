/**
 * Custom Next.js entrypoint that wires a ws.Server onto the same HTTP listener.
 *
 *   GET  /api/ws?room=<code>   --> upgrade to WebSocket
 *   *                          --> Next request handler
 *
 * Auth: we read the session cookie from the upgrade headers. The user must be
 * a member of the room (or its admin); otherwise we close immediately.
 */

// Loads .env.local into process.env. MUST be the first import — see the file
// header for why putting loadEnvConfig() in server.ts's body doesn't work.
import "./src/server/load-env.ts";

import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import { register, unregister, broadcast, type WsClient, type Participant } from "./src/server/wsHub.ts";
import { readSessionFromCookieHeader, verifySessionToken } from "./src/lib/session-core.ts";
import { prisma } from "./src/lib/prisma.ts";

const port = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true);
    void handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = parse(req.url ?? "/", true);
    if (url.pathname !== "/api/ws") {
      socket.destroy();
      return;
    }

    const token = readSessionFromCookieHeader(req.headers.cookie);
    const roomCode = String(url.query.room ?? "").trim();
    if (!token || !roomCode) {
      socket.destroy();
      return;
    }

    (async () => {
      const uid = await verifySessionToken(token);
      if (!uid) return socket.destroy();
      const room = await prisma.room.findUnique({ where: { code: roomCode } });
      if (!room) return socket.destroy();
      const member = await prisma.membership.findUnique({
        where: { roomId_userId: { roomId: room.id, userId: uid } },
      });
      if (!member) return socket.destroy();

      wss.handleUpgrade(req, socket, head, (ws) => {
        attach(ws, room.id, uid);
      });
    })().catch((err) => {
      console.error("WS upgrade failed", err);
      socket.destroy();
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Consensus ready on http://localhost:${port}`);
  });
}

async function attach(ws: WebSocket, roomId: string, userId: string) {
  const client: WsClient = {
    userId,
    send: (data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    },
  };
  register(roomId, client);

  // send initial snapshot (recent messages + last summary + status)
  void sendSnapshot(ws, roomId).catch((err) => {
    console.error("snapshot failed", err);
  });

  // and refresh participants for everyone
  void refreshParticipants(roomId).catch((err) => {
    console.error("participants refresh failed", err);
  });

  ws.on("close", () => {
    unregister(roomId, client);
    void refreshParticipants(roomId).catch(() => {});
  });
  ws.on("error", () => {
    unregister(roomId, client);
  });

  // We don't accept inbound WS messages for sending — clients hit a server
  // action / route. Keeps auth + validation in one place.
  ws.on("message", () => {});
}

async function sendSnapshot(ws: WebSocket, roomId: string) {
  const [room, msgs, lastSummary] = await Promise.all([
    prisma.room.findUnique({ where: { id: roomId } }),
    prisma.message.findMany({
      where: { roomId },
      orderBy: { seq: "asc" },
      include: { user: { select: { username: true } } },
      take: 500,
    }),
    prisma.summary.findFirst({
      where: { roomId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!room || ws.readyState !== ws.OPEN) return;

  for (const m of msgs) {
    ws.send(
      JSON.stringify({
        type: "message",
        message: {
          id: m.id,
          role: m.role,
          text: m.text,
          filtered: m.filtered,
          userId: m.userId,
          username: m.user?.username ?? null,
          sentAt: m.sentAt.toISOString(),
          seq: m.seq,
        },
      }),
    );
  }
  if (lastSummary) {
    ws.send(JSON.stringify({ type: "summary", markdown: lastSummary.markdown }));
  }
  ws.send(
    JSON.stringify({
      type: "consensus",
      status: room.consensus,
      percent: room.consensusPercent,
    }),
  );
  ws.send(JSON.stringify({ type: "status", status: room.status }));
}

async function refreshParticipants(roomId: string) {
  const members = await prisma.membership.findMany({
    where: { roomId },
    include: { user: { select: { username: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const participants: Participant[] = members.map((m) => ({
    userId: m.userId,
    username: m.user.username,
    role: m.role === "admin" ? "admin" : "participant",
  }));
  broadcast(roomId, { type: "participants", participants });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
