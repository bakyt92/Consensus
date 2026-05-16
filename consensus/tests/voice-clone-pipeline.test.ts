import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMembership = vi.fn().mockResolvedValue({});
const findMembership = vi.fn();

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    membership: {
      findUnique: (...args: unknown[]) => findMembership(...args),
      update: (...args: unknown[]) => updateMembership(...args),
    },
    room: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "r1", code: "AAA-BBBB" }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "u1", username: "alice" }),
    },
  },
}));

const createClone = vi.fn();
vi.mock("@/src/server/integrations/elevenlabs", () => ({
  createInstantVoiceClone: (...args: unknown[]) => createClone(...args),
  elevenLabsIsConfigured: () => true,
  ElevenLabsNotConfiguredError: class extends Error {},
}));

vi.mock("@/src/server/wsHub", () => ({
  broadcast: vi.fn(),
}));

import {
  accumulate,
  __resetForTests,
  VOICE_CLONE_BYTE_THRESHOLD,
} from "@/src/server/voiceClonePipeline";

beforeEach(() => {
  __resetForTests();
  findMembership.mockReset();
  updateMembership.mockReset().mockResolvedValue({});
  createClone.mockReset().mockResolvedValue({ voiceId: "vx_123" });
});

describe("voiceClonePipeline.accumulate", () => {
  it("does nothing when membership has opted out", async () => {
    findMembership.mockResolvedValue({
      id: "m1",
      voiceOptOut: true,
      voiceId: null,
    });
    await accumulate({
      roomId: "r1",
      userId: "u1",
      audio: new Uint8Array(VOICE_CLONE_BYTE_THRESHOLD + 1),
      mime: "audio/webm",
    });
    expect(createClone).not.toHaveBeenCalled();
    expect(updateMembership).not.toHaveBeenCalled();
  });

  it("does nothing when voiceId is already set", async () => {
    findMembership.mockResolvedValue({
      id: "m1",
      voiceOptOut: false,
      voiceId: "vx_existing",
    });
    await accumulate({
      roomId: "r1",
      userId: "u1",
      audio: new Uint8Array(VOICE_CLONE_BYTE_THRESHOLD + 1),
      mime: "audio/webm",
    });
    expect(createClone).not.toHaveBeenCalled();
  });

  it("does not fire clone until threshold crossed", async () => {
    findMembership.mockResolvedValue({
      id: "m1",
      voiceOptOut: false,
      voiceId: null,
    });
    await accumulate({
      roomId: "r1",
      userId: "u1",
      audio: new Uint8Array(1000),
      mime: "audio/webm",
    });
    await Promise.resolve();
    expect(createClone).not.toHaveBeenCalled();
  });

  it("fires clone exactly once when threshold is crossed across two chunks", async () => {
    findMembership.mockResolvedValue({
      id: "m1",
      voiceOptOut: false,
      voiceId: null,
    });
    const half = Math.ceil(VOICE_CLONE_BYTE_THRESHOLD / 2) + 100;
    await accumulate({
      roomId: "r1",
      userId: "u1",
      audio: new Uint8Array(half),
      mime: "audio/webm",
    });
    await accumulate({
      roomId: "r1",
      userId: "u1",
      audio: new Uint8Array(half),
      mime: "audio/webm",
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(createClone).toHaveBeenCalledTimes(1);
    expect(updateMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ voiceId: "vx_123" }),
      }),
    );
  });
});
