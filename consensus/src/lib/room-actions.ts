"use server";

import { customAlphabet } from "nanoid";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "./prisma";
import { getSessionUser } from "./session";
import { kickoffRoom, enqueueMessage } from "@/src/server/pipeline";
import { TEMPLATE_KEYS, type TemplateKey } from "./templates";

const codeAlphabet = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 4);
const prefix = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ", 3);

function newCode() {
  return `${prefix()}-${codeAlphabet()}`;
}

const CreateInput = z.object({
  agenda: z.string().trim().min(10).max(2000),
  criteria: z.string().trim().min(10).max(2000),
  // No longer collected from UI — default to 8 (sweet spot). Schema column
  // kept for future "cap" UX; can drop in a later migration if unused.
  maxParticipants: z.number().int().min(2).max(64).optional().default(8),
  // Meeting template picked at room creation; gates the label set and
  // right-pane summary shape. Defaults to "debate" — the most common
  // decision-shaped meeting and aligned with the example agenda copy.
  template: z
    .enum(TEMPLATE_KEYS as [TemplateKey, ...TemplateKey[]])
    .optional()
    .default("debate"),
});

export type CreateRoomResult = { ok: false; error: string };

export async function createRoom(input: unknown): Promise<CreateRoomResult | never> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false as const, error: "Not signed in." };
  }
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Agenda and criteria are required (≥10 chars each)." };
  }
  const { agenda, criteria, maxParticipants, template } = parsed.data;
  const firstLine = agenda.split("\n").map((l) => l.trim()).find(Boolean) ?? agenda;
  const agendaTitle = firstLine.slice(0, 80);

  let code = newCode();
  // ensure unique
  for (let i = 0; i < 5; i++) {
    const dup = await prisma.room.findUnique({ where: { code } });
    if (!dup) break;
    code = newCode();
  }

  const room = await prisma.room.create({
    data: {
      code,
      agenda,
      criteria,
      agendaTitle,
      maxParticipants,
      template,
      adminId: user.id,
      memberships: {
        create: [{ userId: user.id, role: "admin" }],
      },
    },
  });

  // fire-and-forget kickoff (generate opening prompt)
  void kickoffRoom(room.id).catch((err) => {
    console.error("kickoffRoom failed", err);
  });

  redirect(`/room/${room.code}`);
}

/**
 * Form-action variant for `<form action={createRoomFormAction}>`. The
 * declarative pattern works pre-hydration; see `signupFormAction` for the
 * background.
 */
export async function createRoomFormAction(
  _prev: CreateRoomResult | null,
  formData: FormData,
): Promise<CreateRoomResult | never> {
  return createRoom({
    agenda: formData.get("agenda")?.toString() ?? "",
    criteria: formData.get("criteria")?.toString() ?? "",
    template: formData.get("template")?.toString() || undefined,
  });
}

export async function joinRoom(code: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return { ok: false as const, error: "Room not found." };
  if (room.status === "LOCKED" || room.status === "STOPPING" || room.status === "CLOSED") {
    // existing members can still see it, just no new joins
    const existing = await prisma.membership.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: user.id } },
    });
    if (!existing) return { ok: false as const, error: "Room is locked or closed." };
    return { ok: true as const, roomId: room.id };
  }
  const count = await prisma.membership.count({ where: { roomId: room.id } });
  if (count >= room.maxParticipants) {
    const existing = await prisma.membership.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: user.id } },
    });
    if (!existing) return { ok: false as const, error: "Room is full." };
  }
  await prisma.membership.upsert({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
    update: {},
    create: { roomId: room.id, userId: user.id },
  });
  return { ok: true as const, roomId: room.id };
}

const SendInput = z.object({
  code: z.string(),
  text: z.string().trim().min(1).max(2000),
});

export async function sendMessage(input: unknown) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const parsed = SendInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Empty or oversized message." };

  const room = await prisma.room.findUnique({ where: { code: parsed.data.code } });
  if (!room) return { ok: false as const, error: "Room not found." };
  if (room.status === "STOPPING" || room.status === "CLOSED") {
    return { ok: false as const, error: "Meeting is closing or closed." };
  }
  const membership = await prisma.membership.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
  });
  if (!membership) return { ok: false as const, error: "Not a participant in this room." };

  await enqueueMessage({
    roomId: room.id,
    userId: user.id,
    text: parsed.data.text,
  });
  return { ok: true as const };
}

export async function lockRoom(code: string, locked: boolean) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return { ok: false as const, error: "Room not found." };
  if (room.adminId !== user.id) return { ok: false as const, error: "Admins only." };
  if (room.status === "CLOSED" || room.status === "STOPPING") {
    return { ok: false as const, error: "Cannot change lock state on a closing/closed room." };
  }
  const next = locked ? "LOCKED" : "OPEN";
  await prisma.room.update({ where: { id: room.id }, data: { status: next } });
  const { broadcast } = await import("@/src/server/wsHub");
  broadcast(room.id, { type: "status", status: next });
  return { ok: true as const };
}

export async function requestCloseMeeting(code: string) {
  const user = await getSessionUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return { ok: false as const, error: "Room not found." };
  if (room.adminId !== user.id) return { ok: false as const, error: "Admins only." };
  if (room.status === "CLOSED") return { ok: true as const };

  const { requestClose } = await import("@/src/server/pipeline");
  await requestClose(room.id);
  return { ok: true as const };
}
