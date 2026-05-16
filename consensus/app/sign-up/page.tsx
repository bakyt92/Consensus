import { redirect } from "next/navigation";
import { EntryShell } from "@/src/components/EntryShell";
import { getSessionUser } from "@/src/lib/session";
import { SignupForm } from "./SignupForm";

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect("/lobby");

  return (
    <EntryShell
      side={
        <div style={{ marginTop: 32, maxWidth: 460 }}>
          <div
            className="display"
            style={{
              fontSize: 64,
              color: "var(--cream)",
              position: "relative",
              zIndex: 1,
            }}
          >
            Every
            <br />
            voice
            <br />
            counts.
            <br />
            <span style={{ color: "var(--rust)" }}>Twice.</span>
          </div>
          <p
            className="lede"
            style={{
              color: "rgba(243,236,217,0.75)",
              marginTop: 32,
              position: "relative",
              zIndex: 1,
            }}
          >
            A facilitation tool for meetings that need to actually conclude. Set
            an agenda, define what consensus looks like, then talk it out —
            Consensus listens, summarizes, and tells you when you're done.
          </p>
        </div>
      }
    >
      <SignupForm />
    </EntryShell>
  );
}
