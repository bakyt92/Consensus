import Link from "next/link";
import { Brandmark, Wordmark } from "@/src/components/Brand";

const REASONS: Record<string, { title: string; sub: string }> = {
  "magic-link-invalid": {
    title: "This link is no longer valid.",
    sub: "Magic links expire after 15 minutes and can only be used once. Request a fresh one.",
  },
  "room-not-found": {
    title: "Room not found.",
    sub: "Check the code with the facilitator. Codes are case-insensitive but exact.",
  },
  "room-locked": {
    title: "Room is locked.",
    sub: "The facilitator has locked the room. No new participants can enter.",
  },
  "room-full": {
    title: "Room is full.",
    sub: "This room has reached its participant cap.",
  },
};

export default async function ErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const sp = await searchParams;
  const key = sp.reason ?? "";
  const meta = REASONS[key] ?? {
    title: "Something went wrong.",
    sub: "We hit a snag on our side. Try again, or head back to the lobby.",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--cream)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "20px 40px",
          borderBottom: "1.5px solid var(--line)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Brandmark />
        <Wordmark />
      </header>

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 40px",
          maxWidth: 760,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div className="label" style={{ color: "var(--rust)" }}>
          ERROR · {key.toUpperCase() || "UNKNOWN"}
        </div>
        <h1 className="display" style={{ fontSize: 56, margin: "14px 0 16px" }}>
          {meta.title}
        </h1>
        <p className="lede" style={{ maxWidth: 540, margin: "0 0 40px" }}>
          {meta.sub}
        </p>
        <div className="row" style={{ ["--gap" as never]: "12px" }}>
          <Link href="/lobby" className="btn btn-primary">
            ← Back to lobby
          </Link>
          <Link href="/sign-up" className="btn btn-soft">
            Sign in again
          </Link>
        </div>
      </main>
    </div>
  );
}
