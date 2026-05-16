import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getSessionUser } from "@/src/lib/session";
import { Brandmark, Wordmark } from "@/src/components/Brand";
import { Check } from "@/src/components/Icon";
import { Markdown } from "@/src/components/Markdown";
import { EndActions } from "./EndActions";

export default async function EndPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/sign-up");

  const room = await prisma.room.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: {
      admin: { select: { username: true } },
      memberships: { include: { user: { select: { username: true } } } },
    },
  });
  if (!room) redirect("/error?reason=room-not-found");

  // Only members can view the minutes
  const isMember = room.memberships.some((m) => m.userId === user.id);
  if (!isMember) redirect("/error?reason=room-not-found");

  const closedAt = room.closedAt ?? new Date();
  const summary = room.finalSummary ?? "(Meeting ended before any summary was produced.)";
  const durationMs = closedAt.getTime() - room.createdAt.getTime();
  const durationMin = Math.max(1, Math.round(durationMs / 60000));

  const consensusOutcome =
    room.consensus === "REACHED" ? "Consensus reached" : "Closed before consensus";

  return (
    <div className="room">
      <div className="room-header">
        <div className="brand" style={{ gap: 12 }}>
          <Brandmark />
          <Wordmark />
        </div>
        <div style={{ width: 1, height: 24, background: "var(--line)" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">ROOM · {room.code} · CLOSED</div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "-0.01em",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {room.agendaTitle}
          </div>
        </div>
        <span className="pill locked lg">
          <span className="dot"></span> Meeting closed
        </span>
        <Link href="/lobby" className="btn btn-soft btn-sm">
          ← Lobby
        </Link>
      </div>

      <div style={{ overflow: "auto", background: "var(--cream)" }}>
        <div className="summary-doc">
          <div
            className={
              "doc-banner " +
              (room.consensus === "REACHED" ? "consensus-met" : "closed")
            }
          >
            <div
              style={{
                width: 48,
                height: 48,
                background: "rgba(243,236,217,0.15)",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
              }}
            >
              <Check style={{ width: 22, height: 22 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="bigtext">
                {room.consensus === "REACHED"
                  ? "Consensus reached · meeting adjourned"
                  : "Meeting closed"}
              </div>
              <div className="subtext">
                Closed by {room.admin.username} at{" "}
                {closedAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {room.memberships.length} participant
                {room.memberships.length === 1 ? "" : "s"} · {durationMin}m
              </div>
            </div>
            <EndActions code={room.code} />
          </div>

          <div className="doc-head">
            <div className="label">MINUTES · {room.code}</div>
            <h1 className="doc-title">{room.agendaTitle}</h1>
            <div className="doc-meta">
              <div>
                <span className="label">FACILITATOR</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {room.admin.username}
                </span>
              </div>
              <div>
                <span className="label">PARTICIPANTS</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {room.memberships.length} present
                </span>
              </div>
              <div>
                <span className="label">DURATION</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>
                  {durationMin}m
                </span>
              </div>
              <div>
                <span className="label">OUTCOME</span>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    color:
                      room.consensus === "REACHED"
                        ? "var(--ok)"
                        : "var(--rust)",
                  }}
                >
                  {consensusOutcome}
                </span>
              </div>
            </div>
          </div>

          <Markdown source={summary} />

          <hr className="rule heavy" style={{ margin: "40px 0 20px" }} />
          <div className="label" style={{ textAlign: "center" }}>
            END OF MINUTES · CONSENSUS · {closedAt.toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}
