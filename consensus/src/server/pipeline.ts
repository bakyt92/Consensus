/**
 * Per-room serial processing queue.
 *
 * Why serial:
 *   The LLM call needs the full ordered transcript including the just-arrived
 *   message. If two arrive simultaneously, processing them in parallel would
 *   each see a stale transcript. So we keep one promise chain per roomId
 *   that processes messages strictly in arrival order.
 *
 * After requestClose():
 *   - No new enqueues accepted (returns silently — caller already checked
 *     room.status, this is just a safety net).
 *   - The current chain is allowed to drain.
 *   - When the chain settles, the room is marked CLOSED and a final summary
 *     is persisted. The end screen reads `room.finalSummary`.
 */

import { prisma } from "@/src/lib/prisma";
import { loadPrompt } from "@/src/lib/prompts";
import { broadcast } from "./wsHub";
import { callMediator, type ConversationItem } from "./openai";
import { classifyUtterance } from "./integrations/pioneer";

// If Pioneer is this confident the message is off-topic, skip the OpenAI turn
// entirely — just mark filtered and broadcast. Keeps GPT off the hot path.
const PIONEER_SKIP_THRESHOLD = 0.8;

type QueueState = {
  tail: Promise<void>;
  closing: boolean;
  pendingCount: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __consensusQueues: Map<string, QueueState> | undefined;
}

const queues: Map<string, QueueState> =
  global.__consensusQueues ?? new Map();

if (process.env.NODE_ENV !== "production") {
  global.__consensusQueues = queues;
}

function getQueue(roomId: string): QueueState {
  let q = queues.get(roomId);
  if (!q) {
    q = { tail: Promise.resolve(), closing: false, pendingCount: 0 };
    queues.set(roomId, q);
  }
  return q;
}

async function nextSeq(roomId: string): Promise<number> {
  const last = await prisma.message.findFirst({
    where: { roomId },
    orderBy: { seq: "desc" },
    select: { seq: true },
  });
  return (last?.seq ?? 0) + 1;
}

async function broadcastMessage(roomId: string, messageId: string) {
  const m = await prisma.message.findUnique({
    where: { id: messageId },
    include: { user: { select: { username: true } } },
  });
  if (!m) return;
  broadcast(roomId, {
    type: "message",
    message: {
      id: m.id,
      role: m.role as "system" | "user" | "mediator",
      text: m.text,
      filtered: m.filtered,
      userId: m.userId,
      username: m.user?.username ?? null,
      sentAt: m.sentAt.toISOString(),
      seq: m.seq,
    },
  });
}

async function loadHistory(roomId: string): Promise<ConversationItem[]> {
  const rows = await prisma.message.findMany({
    where: { roomId },
    orderBy: { seq: "asc" },
    include: { user: { select: { username: true } } },
  });
  return rows.map((m) => ({
    role: m.role as "system" | "user" | "mediator",
    username: m.user?.username ?? null,
    text: m.text,
    filtered: m.filtered,
    seq: m.seq,
  }));
}

/**
 * Run one mediator turn. Handles BOTH the kickoff (no user message) and a
 * normal turn (user message that we should mark on/off-topic + reply to).
 */
async function runTurn(
  roomId: string,
  newMessageId: string | null,
): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status === "CLOSED") return;

  let newMessage: { username: string; text: string } | null = null;
  if (newMessageId) {
    const m = await prisma.message.findUnique({
      where: { id: newMessageId },
      include: { user: { select: { username: true } } },
    });
    if (m && m.user) {
      newMessage = { username: m.user.username, text: m.text };
    }
  }

  // Two-tier inference: Pioneer first (fast), OpenAI only if message clears
  // the filter. Skipping OpenAI is the whole point — keeps cost + latency
  // low and lets the mediator stay quiet on noise.
  if (newMessageId && newMessage) {
    const verdict = await classifyUtterance({
      text: newMessage.text,
      agenda: room.agenda,
      criteria: room.criteria,
      username: newMessage.username,
    }).catch((err) => {
      console.error("[pipeline] pioneer classify failed, falling through", err);
      return null;
    });
    if (
      verdict &&
      !verdict.isOnTopic &&
      verdict.confidence >= PIONEER_SKIP_THRESHOLD
    ) {
      await prisma.message.update({
        where: { id: newMessageId },
        data: { filtered: true },
      });
      await broadcastMessage(roomId, newMessageId);
      return;
    }
  }

  const history = await loadHistory(roomId);
  const systemPrompt = await loadPrompt("system");
  const turnPrompt = await loadPrompt(newMessage ? "turn" : "kickoff");

  const out = await callMediator({
    systemPrompt,
    turnPrompt,
    agenda: room.agenda,
    criteria: room.criteria,
    history,
    newMessage,
  });

  // Mark filtered on the user message if the model said it was off-topic
  if (newMessageId && !out.isOnTopic) {
    await prisma.message.update({
      where: { id: newMessageId },
      data: { filtered: true },
    });
    await broadcastMessage(roomId, newMessageId);
  }

  // Insert mediator reply
  const seq = await nextSeq(roomId);
  const mediator = await prisma.message.create({
    data: {
      roomId,
      role: "mediator",
      text: out.mediatorReply,
      seq,
    },
  });
  await broadcastMessage(roomId, mediator.id);

  // Persist updated summary
  await prisma.summary.create({
    data: {
      roomId,
      markdown: out.updatedSummaryMarkdown,
      afterMessageSeq: seq,
    },
  });
  broadcast(roomId, { type: "summary", markdown: out.updatedSummaryMarkdown });

  // Persist consensus snapshot
  await prisma.consensusSnapshot.create({
    data: {
      roomId,
      status: out.consensusStatus,
      percent: out.consensusPercent,
      afterMessageSeq: seq,
    },
  });
  await prisma.room.update({
    where: { id: roomId },
    data: {
      consensus: out.consensusStatus,
      consensusPercent: out.consensusPercent,
      // first turn flips us from PENDING → OPEN
      status: room.status === "PENDING" ? "OPEN" : room.status,
    },
  });
  broadcast(roomId, {
    type: "consensus",
    status: out.consensusStatus,
    percent: out.consensusPercent,
  });
  if (room.status === "PENDING") {
    broadcast(roomId, { type: "status", status: "OPEN" });
  }
}

/**
 * Append a user message and enqueue its processing turn. Returns once the
 * message row is persisted; the LLM call happens asynchronously.
 */
export async function enqueueMessage(args: {
  roomId: string;
  userId: string;
  text: string;
}): Promise<void> {
  const q = getQueue(args.roomId);
  if (q.closing) return;

  const seq = await nextSeq(args.roomId);
  const msg = await prisma.message.create({
    data: {
      roomId: args.roomId,
      userId: args.userId,
      role: "user",
      text: args.text,
      seq,
    },
  });
  await broadcastMessage(args.roomId, msg.id);

  q.pendingCount += 1;
  q.tail = q.tail
    .then(() => runTurn(args.roomId, msg.id))
    .catch((err) => {
      console.error("[pipeline] turn failed", err);
    })
    .finally(() => {
      q.pendingCount -= 1;
      if (q.closing && q.pendingCount === 0) {
        void finalizeClose(args.roomId).catch((e) =>
          console.error("[pipeline] finalize close failed", e),
        );
      }
    });
}

/**
 * Generate the opening mediator question for a freshly-created room. Called
 * from createRoom() as fire-and-forget.
 */
export async function kickoffRoom(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return;
  await prisma.message.create({
    data: {
      roomId,
      role: "system",
      text: `Room ${room.code} opened. Mediator engaged.`,
      seq: await nextSeq(roomId),
    },
  });
  const q = getQueue(roomId);
  q.pendingCount += 1;
  q.tail = q.tail
    .then(() => runTurn(roomId, null))
    .catch((err) => console.error("[pipeline] kickoff failed", err))
    .finally(() => {
      q.pendingCount -= 1;
    });
}

/**
 * Admin asked to close the meeting. Mark STOPPING, stop accepting new
 * messages, let the queue drain, then finalize.
 */
export async function requestClose(roomId: string): Promise<void> {
  const q = getQueue(roomId);
  q.closing = true;
  await prisma.room.update({ where: { id: roomId }, data: { status: "STOPPING" } });
  broadcast(roomId, { type: "status", status: "STOPPING" });
  if (q.pendingCount === 0) {
    await finalizeClose(roomId);
  }
}

async function finalizeClose(roomId: string): Promise<void> {
  const [room, lastSummary] = await Promise.all([
    prisma.room.findUnique({ where: { id: roomId } }),
    prisma.summary.findFirst({
      where: { roomId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!room) return;
  await prisma.room.update({
    where: { id: roomId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      finalSummary: lastSummary?.markdown ?? "(no summary recorded)",
    },
  });
  broadcast(roomId, { type: "status", status: "CLOSED" });
  broadcast(roomId, { type: "closed", redirectTo: `/room/${room.code}/end` });
}
