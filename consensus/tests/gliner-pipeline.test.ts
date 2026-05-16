/**
 * Pipeline integration: with GLiNER in stub mode, posting a user message
 * persists category + sentiment on the Message row.
 *
 * Uses tests/setup.ts's harness (per-test temp SQLite DB + per-test wipe) so
 * the prisma singleton, the pipeline, and our reads all hit the same file.
 * No spawned server — the pipeline runs in-process here, which is enough to
 * verify the wiring between runTurn → glinerClassify → prisma.message.update.
 */

import { describe, it, expect, beforeAll } from "vitest";

describe("pipeline + GLiNER (in-process)", () => {
  beforeAll(() => {
    // Force the stub path so we don't depend on a real Pioneer endpoint or key.
    process.env.GLINER_STUB = "1";
    process.env.PIONEER_API_KEY = "";
    // OPENAI is unset by setup.ts — the mediator call after gliner will throw,
    // but that's fine for this test: gliner runs before the mediator and
    // commits to the DB.
  });

  it("writes category + sentiment after the on-topic gate", async () => {
    const { prisma } = await import("@/src/lib/prisma");
    const { enqueueMessage } = await import("@/src/server/pipeline");

    const user = await prisma.user.create({
      data: {
        email: `pipe-${Date.now()}@example.com`,
        username: `pipe_${Date.now()}`,
      },
    });
    const room = await prisma.room.create({
      data: {
        code: `PIP-${Math.random().toString(36).slice(-4).toUpperCase()}`,
        agenda: "Ship v3 in Q3 or hold for Q4?",
        agendaTitle: "Ship v3 in Q3 vs Q4",
        criteria: "Explicit yes/no with trial duration.",
        template: "debate",
        status: "OPEN",
        adminId: user.id,
        memberships: { create: [{ userId: user.id, role: "admin" }] },
      },
    });

    await enqueueMessage({
      roomId: room.id,
      userId: user.id,
      text: "We should ship in Q3 — the retention data is decisive.",
    });

    let row: Awaited<ReturnType<typeof prisma.message.findFirst>> = null;
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 150));
      row = await prisma.message.findFirst({
        where: { roomId: room.id, role: "user" },
      });
      if (row?.category || row?.sentiment) break;
    }
    expect(row).toBeTruthy();
    // Stub mode picks labels[0]; for debate that's "pro".
    expect(row!.category).toBe("pro");
    expect(row!.sentiment).toBe("neutral");
    expect(row!.categoryConfidence).toBeNull();
    expect(row!.sentimentConfidence).toBeNull();
    expect(row!.spans).toBeNull();
  }, 15000);

  it("skips classification when the room template is 'none'", async () => {
    const { prisma } = await import("@/src/lib/prisma");
    const { enqueueMessage } = await import("@/src/server/pipeline");

    const user = await prisma.user.create({
      data: {
        email: `none-${Date.now()}@example.com`,
        username: `none_${Date.now()}`,
      },
    });
    const room = await prisma.room.create({
      data: {
        code: `NON-${Math.random().toString(36).slice(-4).toUpperCase()}`,
        agenda: "Free-form agenda.",
        agendaTitle: "Free-form agenda",
        criteria: "Anything.",
        template: "none",
        status: "OPEN",
        adminId: user.id,
        memberships: { create: [{ userId: user.id, role: "admin" }] },
      },
    });

    await enqueueMessage({
      roomId: room.id,
      userId: user.id,
      text: "An unclassified utterance.",
    });

    // Wait briefly; classification should NOT happen for template=none.
    await new Promise((r) => setTimeout(r, 1000));
    const row = await prisma.message.findFirst({
      where: { roomId: room.id, role: "user" },
    });
    expect(row).toBeTruthy();
    expect(row!.category).toBeNull();
    expect(row!.sentiment).toBeNull();
  });
});
