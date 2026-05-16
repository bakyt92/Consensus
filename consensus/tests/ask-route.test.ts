import { describe, it, expect, vi, beforeEach } from "vitest";

const findRoom = vi.fn();
const findMembership = vi.fn();
const findTargetUser = vi.fn();
const findTargetMembership = vi.fn();
const findMessages = vi.fn();

vi.mock("@/src/lib/prisma", () => {
  const deleteMany = () => Promise.resolve({});
  return {
    prisma: {
      room: { findUnique: (...a: unknown[]) => findRoom(...a), deleteMany },
      membership: {
        findUnique: (args: { where: { roomId_userId: { userId: string } } }) => {
          if (args.where.roomId_userId.userId === "target") {
            return findTargetMembership();
          }
          return findMembership();
        },
        deleteMany,
      },
      user: {
        findUnique: (...a: unknown[]) => findTargetUser(...a),
        deleteMany,
      },
      message: {
        findMany: (...a: unknown[]) => findMessages(...a),
        deleteMany,
      },
      consensusSnapshot: { deleteMany },
      summary: { deleteMany },
      magicLink: { deleteMany },
      session: { deleteMany },
      $disconnect: () => Promise.resolve(undefined),
    },
  };
});

vi.mock("@/src/lib/session", () => ({
  getSessionUser: () => Promise.resolve({ id: "asker", username: "carol" }),
}));

const answerStub = vi.fn();
vi.mock("@/src/server/openai", () => ({
  answerAsParticipant: (...a: unknown[]) => answerStub(...a),
}));

vi.mock("@/src/lib/prompts", () => ({
  loadPrompt: () => Promise.resolve("PROMPT {{username}}"),
}));

const synth = vi.fn();
vi.mock("@/src/server/integrations/gradium", () => ({
  synthesizeSpeech: (...a: unknown[]) => synth(...a),
  gradiumIsConfigured: () => true,
}));

import { POST } from "@/app/api/room/[code]/ask/route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/room/AAA/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  findRoom.mockReset();
  findMembership.mockReset();
  findTargetMembership.mockReset();
  findTargetUser.mockReset();
  findMessages.mockReset();
  answerStub.mockReset();
  synth.mockReset();
});

describe("POST /api/room/[code]/ask", () => {
  it("returns the empty-contribution answer when target has no messages", async () => {
    findRoom.mockResolvedValue({ id: "r1", code: "AAA", status: "CLOSED" });
    findMembership.mockResolvedValue({ id: "m_caller" });
    findTargetMembership.mockResolvedValue({ voiceId: null });
    findTargetUser.mockResolvedValue({ id: "target", username: "alice" });
    findMessages.mockResolvedValue([]);

    const res = await POST(makeReq({ aboutUserId: "target", question: "anything?" }), {
      params: Promise.resolve({ code: "AAA" }),
    });
    const json = await res.json();
    expect(json.audioUrl).toBeNull();
    expect(json.answer).toMatch(/didn't contribute/i);
    expect(answerStub).not.toHaveBeenCalled();
    expect(synth).not.toHaveBeenCalled();
  });

  it("rejects when the room isn't closed", async () => {
    findRoom.mockResolvedValue({ id: "r1", code: "AAA", status: "OPEN" });
    findMembership.mockResolvedValue({ id: "m_caller" });
    const res = await POST(makeReq({ aboutUserId: "target", question: "?" }), {
      params: Promise.resolve({ code: "AAA" }),
    });
    expect(res.status).toBe(409);
  });

  it("calls answerAsParticipant and TTS, returns a data URL", async () => {
    findRoom.mockResolvedValue({ id: "r1", code: "AAA", status: "CLOSED" });
    findMembership.mockResolvedValue({ id: "m_caller" });
    findTargetMembership.mockResolvedValue({ voiceId: "vx_a" });
    findTargetUser.mockResolvedValue({ id: "target", username: "alice" });
    findMessages.mockResolvedValue([{ seq: 4, text: "hold at $99" }]);
    answerStub.mockResolvedValue({ answer: "I said $99." });
    synth.mockResolvedValue({ audio: new Uint8Array([1, 2, 3]), mime: "audio/mpeg" });

    const res = await POST(makeReq({ aboutUserId: "target", question: "pricing?" }), {
      params: Promise.resolve({ code: "AAA" }),
    });
    const json = await res.json();
    expect(json.answer).toBe("I said $99.");
    expect(json.voiceCloned).toBe(true);
    expect(json.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
  });
});
