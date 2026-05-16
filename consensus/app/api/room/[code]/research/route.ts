/**
 * POST /api/room/[code]/research
 *
 * Triggered by the 🔎 chip on a participant message. Sends the message
 * text to Tavily, formats the answer + sources as a Markdown body, and
 * appends a new Message row with role="research". The next mediator
 * turn will see the note in its transcript and can fold facts into the
 * live summary.
 *
 * Body:  { messageId: string }
 * Reply: { ok: true, messageId: string } | { ok: false, error: string }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getSessionUser } from "@/src/lib/session";
import {
  webSearch,
  tavilyIsConfigured,
  TavilyNotConfiguredError,
  type WebSearchSource,
} from "@/src/server/integrations/tavily";
import {
  broadcastMessage,
  nextSeqExternal,
} from "@/src/server/pipeline";

export const runtime = "nodejs";

const MAX_QUERY_LEN = 800;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let body: { messageId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const messageId =
    typeof body.messageId === "string" ? body.messageId : "";
  if (!messageId) {
    return NextResponse.json(
      { ok: false, error: "messageId is required." },
      { status: 400 },
    );
  }

  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return new NextResponse("Not found", { status: 404 });

  const membership = await prisma.membership.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
  });
  if (!membership) return new NextResponse("Forbidden", { status: 403 });

  if (room.status === "CLOSED") {
    return NextResponse.json(
      { ok: false, error: "Room is closed." },
      { status: 409 },
    );
  }

  const sourceMsg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { user: { select: { username: true } } },
  });
  if (!sourceMsg || sourceMsg.roomId !== room.id) {
    return NextResponse.json(
      { ok: false, error: "Source message not found in this room." },
      { status: 404 },
    );
  }
  if (sourceMsg.role !== "user") {
    return NextResponse.json(
      { ok: false, error: "Only participant messages can be researched." },
      { status: 400 },
    );
  }

  if (!tavilyIsConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Research is unavailable (TAVILY_API_KEY not set)." },
      { status: 503 },
    );
  }

  const query = sourceMsg.text.trim().slice(0, MAX_QUERY_LEN);
  if (!query) {
    return NextResponse.json(
      { ok: false, error: "Empty message — nothing to research." },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await webSearch({ query });
  } catch (err) {
    if (err instanceof TavilyNotConfiguredError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 503 },
      );
    }
    console.error("[research] tavily failed", err);
    return NextResponse.json(
      { ok: false, error: "Web search failed." },
      { status: 502 },
    );
  }

  const markdown = formatResearchMarkdown({
    askedBy: sourceMsg.user?.username ?? "a participant",
    query,
    answer: result.answer,
    sources: result.sources,
  });

  const seq = await nextSeqExternal(room.id);
  const msg = await prisma.message.create({
    data: {
      roomId: room.id,
      role: "research",
      text: markdown,
      seq,
    },
  });
  await broadcastMessage(room.id, msg.id);

  return NextResponse.json({ ok: true, messageId: msg.id });
}

function formatResearchMarkdown(args: {
  askedBy: string;
  query: string;
  answer: string;
  sources: WebSearchSource[];
}): string {
  const head = `🔎 **Research** · from a question by ${args.askedBy}`;
  const quoted = `> ${args.query.split("\n").join("\n> ")}`;
  const body = args.answer.trim();
  const sourcesBlock =
    args.sources.length === 0
      ? ""
      : "\n\n**Sources:** " +
        args.sources
          .slice(0, 5)
          .map((s) => `[${s.title}](${s.url})`)
          .join(" · ");
  return `${head}\n\n${quoted}\n\n${body}${sourcesBlock}`;
}
