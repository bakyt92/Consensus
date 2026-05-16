/**
 * POST /api/room/[code]/ask
 *
 * Post-meeting Q&A. Composes a first-person answer from the target
 * participant's actual messages, then synthesizes audio in their cloned
 * voice (if one was created during the meeting).
 *
 * Body:  { aboutUserId: string, question: string }
 * Reply: { answer: string, audioUrl: string | null, voiceCloned: boolean }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getSessionUser } from "@/src/lib/session";
import { loadPrompt } from "@/src/lib/prompts";
import { answerAsParticipant } from "@/src/server/openai";
import {
  synthesizeSpeech,
  gradiumIsConfigured,
} from "@/src/server/integrations/gradium";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let body: { aboutUserId?: unknown; question?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const aboutUserId =
    typeof body.aboutUserId === "string" ? body.aboutUserId : "";
  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (!aboutUserId || !question) {
    return NextResponse.json(
      { error: "aboutUserId and question are required" },
      { status: 400 },
    );
  }

  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return new NextResponse("Not found", { status: 404 });

  const callerMembership = await prisma.membership.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
  });
  if (!callerMembership) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (room.status !== "CLOSED") {
    return NextResponse.json(
      { error: "Q&A is only available after the room is closed." },
      { status: 409 },
    );
  }

  const targetMembership = await prisma.membership.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: aboutUserId } },
    select: { voiceId: true },
  });
  const targetUser = await prisma.user.findUnique({
    where: { id: aboutUserId },
    select: { id: true, username: true },
  });
  if (!targetUser) {
    return NextResponse.json(
      { error: "Target participant not found." },
      { status: 404 },
    );
  }

  const messages = await prisma.message.findMany({
    where: {
      roomId: room.id,
      userId: aboutUserId,
      role: "user",
      filtered: false,
    },
    orderBy: { seq: "asc" },
    select: { seq: true, text: true },
  });

  if (messages.length === 0) {
    return NextResponse.json({
      answer: `${targetUser.username} didn't contribute messages in this meeting.`,
      audioUrl: null,
      voiceCloned: false,
    });
  }

  const systemPrompt = await loadPrompt("qa");

  let answer: string;
  try {
    const out = await answerAsParticipant({
      systemPrompt,
      username: targetUser.username,
      messages,
      question,
    });
    answer = out.answer;
  } catch (err) {
    console.error("[ask] answer synthesis failed", err);
    return NextResponse.json(
      { error: "Failed to generate answer." },
      { status: 502 },
    );
  }

  let audioUrl: string | null = null;
  if (targetMembership?.voiceId && gradiumIsConfigured()) {
    try {
      const synth = await synthesizeSpeech({
        text: answer,
        voiceId: targetMembership.voiceId,
      });
      if (synth) {
        const b64 = Buffer.from(synth.audio).toString("base64");
        audioUrl = `data:${synth.mime};base64,${b64}`;
      }
    } catch (err) {
      console.warn("[ask] TTS failed; returning text-only", err);
    }
  }

  return NextResponse.json({
    answer,
    audioUrl,
    voiceCloned: Boolean(targetMembership?.voiceId),
  });
}
