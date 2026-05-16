/**
 * POST audio blob → SLNG STT → enqueue as a normal user message.
 *
 * Body: raw audio bytes (Content-Type set by MediaRecorder, e.g.
 * audio/webm;codecs=opus). We trust the membership check; the audio itself
 * is never persisted — only the resulting transcript becomes a Message row.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getSessionUser } from "@/src/lib/session";
import { transcribeAudio } from "@/src/server/integrations/slng";
import { enqueueMessage } from "@/src/server/pipeline";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return new NextResponse("Not found", { status: 404 });
  if (room.status === "STOPPING" || room.status === "CLOSED") {
    return NextResponse.json(
      { ok: false, error: "Meeting is closing or closed." },
      { status: 409 },
    );
  }
  const membership = await prisma.membership.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
  });
  if (!membership) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength === 0) {
    return NextResponse.json(
      { ok: false, error: "Empty audio." },
      { status: 400 },
    );
  }
  if (buf.byteLength > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Audio too large." },
      { status: 413 },
    );
  }

  const mime = req.headers.get("content-type") ?? "audio/webm";

  let transcript;
  try {
    transcript = await transcribeAudio({
      audio: buf,
      mime,
      userId: user.id,
      roomId: room.id,
    });
  } catch (err) {
    console.error("[voice] transcribe failed", err);
    return NextResponse.json(
      { ok: false, error: "Transcription failed." },
      { status: 502 },
    );
  }

  const text = transcript.text.trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "Empty transcript." });
  }

  await enqueueMessage({ roomId: room.id, userId: user.id, text });

  return NextResponse.json({
    ok: true,
    text,
    stubbed: transcript.stubbed,
  });
}
