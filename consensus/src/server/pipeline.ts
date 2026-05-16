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
import { broadcast, type WsSpan } from "./wsHub";
import { callMediator, type ConversationItem } from "./openai";
import { classify as glinerClassify } from "./integrations/gliner";
import { getTemplate } from "@/src/lib/templates";

type QueueState = {
  tail: Promise<void>;
  closing: boolean;
  pendingCount: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __consensusQueues: Map<string, QueueState> | undefined;
}

// Pin to globalThis in all environments (see wsHub.ts for the full
// explanation). Without this, parallel server-action invocations imported
// through Next's bundle could each see a fresh queue Map and process two
// messages for the same room concurrently — which violates the serial-
// pipeline guarantee that the LLM always sees the full ordered transcript.
const queues: Map<string, QueueState> =
  global.__consensusQueues ?? new Map();
global.__consensusQueues = queues;

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

export async function broadcastMessage(roomId: string, messageId: string) {
  const m = await prisma.message.findUnique({
    where: { id: messageId },
    include: { user: { select: { username: true } } },
  });
  if (!m) return;
  broadcast(roomId, {
    type: "message",
    message: {
      id: m.id,
      role: m.role as "system" | "user" | "mediator" | "research",
      text: m.text,
      filtered: m.filtered,
      userId: m.userId,
      username: m.user?.username ?? null,
      sentAt: m.sentAt.toISOString(),
      seq: m.seq,
      category: m.category,
      categoryConfidence: m.categoryConfidence,
      sentiment: m.sentiment,
      sentimentConfidence: m.sentimentConfidence,
      // Persisted as JSON string; re-parse for the wire so clients see structured spans.
      spans: parseSpans(m.spans),
    },
  });
}

export async function nextSeqExternal(roomId: string): Promise<number> {
  return nextSeq(roomId);
}

function parseSpans(raw: string | null): WsSpan[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WsSpan[]) : null;
  } catch {
    return null;
  }
}

async function loadHistory(roomId: string): Promise<ConversationItem[]> {
  const rows = await prisma.message.findMany({
    where: { roomId },
    orderBy: { seq: "asc" },
    include: { user: { select: { username: true } } },
  });
  return rows.map((m) => ({
    role: m.role as "system" | "user" | "mediator" | "research",
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

  // Off-topic filtering disabled: every user message goes to the mediator and
  // stays visible in chat. Pioneer is skipped to avoid the wasted call.
  //
  // GLiNER classification (label + sentiment) still runs on each user message
  // so the side-panel histogram and message badges have data. Fail-soft:
  // any error leaves the message un-classified and the mediator turn continues.
  if (newMessageId && newMessage) {
    const template = getTemplate(room.template);
    if (template.labels.length > 0) {
      try {
        const cls = await glinerClassify({
          text: newMessage.text,
          labels: template.labels,
        });
        await prisma.message.update({
          where: { id: newMessageId },
          data: {
            category: cls.category,
            categoryConfidence: cls.categoryConfidence,
            sentiment: cls.sentiment,
            sentimentConfidence: cls.sentimentConfidence,
            spans: cls.spans.length > 0 ? JSON.stringify(cls.spans) : null,
          },
        });
        await broadcastMessage(roomId, newMessageId);
      } catch (err) {
        console.error("[pipeline] gliner classify failed, continuing un-classified", err);
      }
    }
  }

  const history = await loadHistory(roomId);
  const systemPrompt = await loadPrompt("system");
  const turnPrompt = await loadPrompt(newMessage ? "turn" : "kickoff");

  const memberships = await prisma.membership.findMany({
    where: { roomId },
    include: { user: { select: { username: true } } },
  });
  const participants = memberships
    .filter((m) => m.user)
    .map((m) => ({
      username: m.user!.username,
      role: (m.role === "admin" ? "admin" : "participant") as
        | "admin"
        | "participant",
    }));

  const out = await callMediator({
    systemPrompt,
    turnPrompt,
    agenda: room.agenda,
    criteria: room.criteria,
    history,
    newMessage,
    participants,
  });

  // Insert mediator reply only when the model chose to speak. Kickoff
  // (no newMessage) always speaks — that's the opening question.
  const isKickoff = !newMessage;
  const replyText = out.mediatorReply.trim();
  const willReply = (isKickoff || out.shouldReply) && replyText.length > 0;

  let summarySeq = await nextSeq(roomId);
  if (willReply) {
    const mediator = await prisma.message.create({
      data: {
        roomId,
        role: "mediator",
        text: replyText,
        seq: summarySeq,
      },
    });
    await broadcastMessage(roomId, mediator.id);
  } else {
    // No new message row, so the summary anchors to the most recent existing
    // message (typically the user message that just arrived).
    summarySeq = summarySeq - 1;
  }

  // Persist updated summary
  await prisma.summary.create({
    data: {
      roomId,
      markdown: out.updatedSummaryMarkdown,
      afterMessageSeq: summarySeq,
    },
  });
  broadcast(roomId, { type: "summary", markdown: out.updatedSummaryMarkdown });

  // Persist consensus snapshot
  await prisma.consensusSnapshot.create({
    data: {
      roomId,
      status: out.consensusStatus,
      percent: out.consensusPercent,
      afterMessageSeq: summarySeq,
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
