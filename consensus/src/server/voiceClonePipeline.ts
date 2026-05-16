/**
 * Per-room, per-user audio accumulator for ElevenLabs voice cloning.
 *
 * Why in-memory: the spec keeps raw biometric audio out of disk and DB
 * for the hackathon. Buffers are dropped immediately after the clone is
 * created or on any terminal failure.
 *
 * Threshold: 80 KB ≈ 20 s of Opus at 32 kbps. Avoids decoding audio on
 * the server.
 */

import { prisma } from "@/src/lib/prisma";
import { broadcast } from "./wsHub";
import {
  createInstantVoiceClone,
  ElevenLabsNotConfiguredError,
  elevenLabsIsConfigured,
} from "./integrations/elevenlabs";

export const VOICE_CLONE_BYTE_THRESHOLD = 80 * 1024;

type AccumState = {
  chunks: Uint8Array[];
  totalBytes: number;
  cloning: boolean;
};
const buffers = new Map<string, AccumState>();
const stubWarned = new Set<string>();

function keyOf(roomId: string, userId: string): string {
  return `${roomId}:${userId}`;
}

export function __resetForTests(): void {
  buffers.clear();
  stubWarned.clear();
}

export async function accumulate(args: {
  roomId: string;
  userId: string;
  audio: Uint8Array;
  mime: string;
}): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { roomId_userId: { roomId: args.roomId, userId: args.userId } },
    select: { id: true, voiceOptOut: true, voiceId: true },
  });
  if (!membership) return;
  if (membership.voiceOptOut) return;
  if (membership.voiceId) return;

  await prisma.membership.update({
    where: { id: membership.id },
    data: { voiceBytes: { increment: args.audio.byteLength } },
  });

  const key = keyOf(args.roomId, args.userId);
  const s = buffers.get(key) ?? {
    chunks: [],
    totalBytes: 0,
    cloning: false,
  };
  s.chunks.push(args.audio);
  s.totalBytes += args.audio.byteLength;
  buffers.set(key, s);

  if (s.cloning) return;
  if (s.totalBytes < VOICE_CLONE_BYTE_THRESHOLD) return;

  if (!elevenLabsIsConfigured()) {
    if (!stubWarned.has(key)) {
      console.warn(
        "[voiceClonePipeline] ELEVENLABS_API_KEY not set — skipping clone for",
        key,
      );
      stubWarned.add(key);
    }
    buffers.delete(key);
    return;
  }

  s.cloning = true;
  void createCloneInBackground(args.roomId, args.userId, args.mime).finally(
    () => {
      buffers.delete(key);
    },
  );
}

async function createCloneInBackground(
  roomId: string,
  userId: string,
  mime: string,
): Promise<void> {
  const key = keyOf(roomId, userId);
  const s = buffers.get(key);
  if (!s) return;

  const [room, user] = await Promise.all([
    prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true, code: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    }),
  ]);
  if (!room || !user) return;

  try {
    const { voiceId } = await createInstantVoiceClone({
      name: `Consensus · ${user.username} · ${room.code}`,
      audio: s.chunks,
      mime,
      roomCode: room.code,
    });
    await prisma.membership.update({
      where: { roomId_userId: { roomId, userId } },
      data: { voiceId, voiceClonedAt: new Date() },
    });
    broadcast(roomId, { type: "voiceCloned", userId, voiceId });
  } catch (err) {
    if (err instanceof ElevenLabsNotConfiguredError) {
      console.warn("[voiceClonePipeline]", err.message);
      return;
    }
    console.error("[voiceClonePipeline] clone failed for", key, err);
  }
}
