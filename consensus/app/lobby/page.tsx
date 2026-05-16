import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { getSessionUser } from "@/src/lib/session";
import { Brandmark, Wordmark } from "@/src/components/Brand";
import { LobbyJoinForm } from "./LobbyJoinForm";
import { Plus } from "@/src/components/Icon";

function fmtTimeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

export default async function LobbyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-up");

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { room: true },
    orderBy: { joinedAt: "desc" },
    take: 8,
  });

  const recent = memberships.map((m) => ({
    id: m.room.code,
    title: m.room.agendaTitle,
    status: m.room.status,
    when: fmtTimeAgo(m.joinedAt),
  }));

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <header
        style={{
          padding: "20px 40px",
          borderBottom: "1.5px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div className="brand" style={{ gap: 12 }}>
          <Brandmark />
          <Wordmark />
        </div>
        <div className="row" style={{ ["--gap" as never]: "14px" }}>
          <div className="label">Signed in as</div>
          <div className="row" style={{ ["--gap" as never]: "10px" }}>
            <div className="avatar you sm">{user.username[0]?.toUpperCase() ?? "?"}</div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{user.username}</span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 40px" }}>
        <div className="label">STEP 02 · LOBBY</div>
        <h1
          className="display"
          style={{ fontSize: 64, margin: "14px 0 12px", maxWidth: 760 }}
        >
          Pick a room.<br />Or call one to order.
        </h1>
        <p className="lede" style={{ maxWidth: 560, margin: "0 0 48px" }}>
          Join a meeting in progress with a room code, or open a new one as
          facilitator.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: 28,
          }}
        >
          <section className="card" style={{ padding: 32 }}>
            <div className="section-head">
              <div className="label">JOIN AN EXISTING ROOM</div>
              <hr className="rule" />
            </div>
            <p className="body" style={{ margin: "0 0 20px" }}>
              Enter the room code given to you by the facilitator.
            </p>

            <LobbyJoinForm />

            <hr className="rule" style={{ margin: "32px 0 20px" }} />
            <div className="label" style={{ marginBottom: 14 }}>
              YOUR RECENT ROOMS
            </div>
            <div className="stack" style={{ ["--gap" as never]: "0" }}>
              {recent.length === 0 && (
                <div className="body" style={{ color: "var(--muted)", fontSize: 13 }}>
                  No rooms yet. Create one or join via code.
                </div>
              )}
              {recent.map((r, i) => (
                <div key={r.id}>
                  {i > 0 && <hr className="rule" />}
                  <Link
                    href={`/room/${r.id}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      padding: "16px 0",
                      color: "inherit",
                      fontWeight: 400,
                    }}
                  >
                    <div
                      className="mono"
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        width: 80,
                        letterSpacing: "0.1em",
                      }}
                    >
                      {r.id}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
                      <div className="label" style={{ marginTop: 2, fontSize: 10 }}>
                        {r.when}
                      </div>
                    </div>
                    <span
                      className={
                        "pill " +
                        (r.status === "OPEN"
                          ? "live"
                          : r.status === "CLOSED"
                            ? "locked"
                            : r.status === "LOCKED"
                              ? "locked"
                              : "")
                      }
                    >
                      <span className="dot"></span>
                      {r.status.toLowerCase()}
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          </section>

          <section
            className="card ink"
            style={{ padding: 32, position: "relative", overflow: "hidden" }}
          >
            <div
              style={{
                position: "absolute",
                right: -60,
                bottom: -60,
                width: 200,
                height: 200,
                border: "1.5px solid rgba(243,236,217,0.08)",
                borderRadius: "50%",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: 20,
                bottom: 20,
                width: 80,
                height: 80,
                border: "1.5px solid rgba(243,236,217,0.08)",
                borderRadius: "50%",
              }}
            />
            <div style={{ position: "relative" }}>
              <div className="label on-navy">FACILITATE</div>
              <h2
                className="h2"
                style={{
                  color: "var(--cream)",
                  margin: "14px 0 12px",
                  fontSize: 32,
                  textTransform: "uppercase",
                  fontWeight: 800,
                  letterSpacing: "-0.035em",
                }}
              >
                Open a new motion.
              </h2>
              <p
                className="body"
                style={{ color: "rgba(243,236,217,0.75)", margin: "0 0 28px" }}
              >
                You'll be the admin. Set the agenda, define what consensus
                means, invite participants by code.
              </p>
              <Link href="/create" className="btn btn-primary btn-lg">
                <Plus /> Create a room
              </Link>
              <hr
                className="rule"
                style={{
                  margin: "32px 0 16px",
                  background: "rgba(243,236,217,0.15)",
                }}
              />
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                  color: "rgba(243,236,217,0.7)",
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              >
                <li>· Up to 24 participants per room</li>
                <li>· Live consensus tracking</li>
                <li>· Export minutes as Markdown</li>
              </ul>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
