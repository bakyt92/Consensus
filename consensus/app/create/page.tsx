import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/src/lib/session";
import { Brandmark, Wordmark } from "@/src/components/Brand";
import { CreateRoomForm } from "./CreateRoomForm";

export default async function CreatePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-up");

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
        <Link href="/lobby" className="btn btn-soft btn-sm">
          ← Back to lobby
        </Link>
      </header>

      <main
        style={{ maxWidth: 880, margin: "0 auto", padding: "48px 40px 96px" }}
      >
        <div className="label">STEP 03 · NEW ROOM</div>
        <h1 className="display" style={{ fontSize: 56, margin: "14px 0 12px" }}>
          What needs<br />deciding?
        </h1>
        <p className="lede" style={{ margin: "0 0 12px", maxWidth: 560 }}>
          Two questions. They become the constitution of the room.
        </p>

        <CreateRoomForm username={user.username} />
      </main>
    </div>
  );
}
