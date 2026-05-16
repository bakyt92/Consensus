import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getSessionUser } from "@/src/lib/session";
import { joinRoom } from "@/src/lib/room-actions";
import { RoomClient } from "./RoomClient";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/sign-up`);

  const normalized = code.trim().toUpperCase();
  const room = await prisma.room.findUnique({ where: { code: normalized } });
  if (!room) redirect(`/error?reason=room-not-found`);
  if (room.status === "CLOSED") redirect(`/room/${room.code}/end`);

  // Auto-join (or surface a lock/full error)
  const res = await joinRoom(room.code);
  if (!res.ok) {
    const reason = res.error.includes("locked")
      ? "room-locked"
      : res.error.includes("full")
        ? "room-full"
        : "room-not-found";
    redirect(`/error?reason=${reason}`);
  }

  const isAdmin = room.adminId === user.id;

  const myMembership = await prisma.membership.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
    select: { voiceOptOut: true, voiceClonedAt: true },
  });

  return (
    <RoomClient
      code={room.code}
      agenda={room.agenda}
      agendaTitle={room.agendaTitle}
      criteria={room.criteria}
      isAdmin={isAdmin}
      me={{ id: user.id, username: user.username }}
      adminName={
        isAdmin
          ? user.username
          : (await prisma.user.findUnique({ where: { id: room.adminId } }))?.username ?? "Facilitator"
      }
      voiceOptOut={Boolean(myMembership?.voiceOptOut)}
      voiceCloned={Boolean(myMembership?.voiceClonedAt)}
    />
  );
}
