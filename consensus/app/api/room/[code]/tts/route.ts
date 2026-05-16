/**
 * POST { text } → Gradium TTS → audio bytes.
 *
 * Returns 204 No Content when Gradium isn't configured so the browser hook
 * can skip playback cleanly (no error banner — the mediator just stays
 * silent). Only room members may call this so we don't expose TTS as a
 * public oracle.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getSessionUser } from "@/src/lib/session";
import {
  synthesizeSpeech,
  gradiumIsConfigured,
} from "@/src/server/integrations/gradium";

export const runtime = "nodejs";

const MAX_TEXT = 4000;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return new NextResponse("Not found", { status: 404 });
  const membership = await prisma.membership.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
  });
  if (!membership) return new NextResponse("Forbidden", { status: 403 });

  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "Empty text." }, { status: 400 });
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT);

  if (!gradiumIsConfigured()) {
    return new NextResponse(null, { status: 204 });
  }

  let result;
  try {
    result = await synthesizeSpeech({ text, format: "mp3" });
  } catch (err) {
    console.error("[tts] synth failed", err);
    return NextResponse.json({ error: "Synth failed." }, { status: 502 });
  }
  if (!result) return new NextResponse(null, { status: 204 });

  return new NextResponse(result.audio as unknown as BodyInit, {
    headers: {
      "Content-Type": result.mime,
      "Cache-Control": "no-store",
    },
  });
}
