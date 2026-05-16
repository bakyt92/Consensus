"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signupOrRequestLink } from "@/src/lib/auth-actions";
import { ArrowRight } from "@/src/components/Icon";

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [touched, setTouched] = useState<{ email?: boolean; username?: boolean }>({});
  const [magicSent, setMagicSent] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const emailValid = /^\S+@\S+\.\S+$/.test(email);
  const usernameValid = username.trim().length >= 2;
  const ready = emailValid && usernameValid;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ email: true, username: true });
    if (!ready) return;
    setServerError(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof signupOrRequestLink>>;
      try {
        res = await signupOrRequestLink({ email, username });
      } catch (err) {
        // Server action threw across the RSC boundary (network / build error).
        // Without this catch, React would surface the rejection to global-error
        // and the form would appear to silently refresh.
        const msg = err instanceof Error ? err.message : String(err);
        setServerError(`Network error: ${msg}`);
        return;
      }
      if (res.kind === "session") {
        router.replace("/lobby");
        router.refresh();
      } else if (res.kind === "magic_sent") {
        setMagicSent(res.email);
      } else {
        setServerError(res.message);
      }
    });
  }

  if (magicSent) {
    return (
      <div style={{ maxWidth: 460, width: "100%" }}>
        <div className="label">STEP 01 · CHECK YOUR INBOX</div>
        <h1 className="h1" style={{ margin: "12px 0 14px" }}>
          We sent you<br />a link.
        </h1>
        <p className="body" style={{ maxWidth: 380, marginBottom: 24 }}>
          We recognised <strong>{magicSent}</strong> from a previous session. Click
          the magic link in your inbox to sign back in. It expires in 15 minutes.
        </p>
        <p className="label" style={{ fontSize: 11 }}>
          DEV NOTE: WITHOUT A RESEND KEY, THE LINK IS LOGGED TO THE SERVER CONSOLE.
        </p>
        <button
          type="button"
          className="btn btn-soft btn-sm"
          style={{ marginTop: 24 }}
          onClick={() => {
            setMagicSent(null);
            setEmail("");
          }}
        >
          ← Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 460, width: "100%" }}>
      <div className="label">STEP 01 · ACCOUNT</div>
      <h1 className="h1" style={{ margin: "12px 0 14px" }}>
        Create your<br />delegation.
      </h1>
      <p className="body" style={{ margin: "0 0 36px", maxWidth: 380 }}>
        One account holds your past meetings and lets others identify you
        across rooms.
      </p>

      <div className="stack" style={{ ["--gap" as never]: "22px" }}>
        <div>
          <label className="field-label">Email</label>
          <input
            className="input"
            type="email"
            placeholder="you@organisation.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            autoComplete="email"
          />
          {touched.email && !emailValid && (
            <div className="label" style={{ color: "var(--rust)", marginTop: 8 }}>
              Enter a valid email.
            </div>
          )}
        </div>
        <div>
          <label className="field-label">Username</label>
          <input
            className="input"
            type="text"
            placeholder="e.g. Maya R."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, username: true }))}
            autoComplete="nickname"
          />
          <div
            className="label"
            style={{
              marginTop: 8,
              textTransform: "none",
              letterSpacing: 0.04,
              fontFamily: "var(--font-archivo)",
              fontSize: 12,
              color: "var(--muted)",
            }}
          >
            This is how you'll appear to other participants. If we've seen this
            email before, we'll send a magic-link instead.
          </div>
        </div>
      </div>

      {serverError && (
        <div
          className="label"
          style={{ color: "var(--rust)", marginTop: 16, fontSize: 12 }}
        >
          {serverError}
        </div>
      )}

      <div className="row" style={{ marginTop: 40, ["--gap" as never]: "16px" }}>
        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={isPending}
        >
          {isPending ? "Working…" : "Continue"} <ArrowRight />
        </button>
      </div>

      <div style={{ marginTop: 56 }}>
        <hr className="rule" />
        <div className="row" style={{ marginTop: 16, ["--gap" as never]: "24px" }}>
          <div className="label">PRIVACY · MMXXVI</div>
          <div className="label">DOC v0.4</div>
          <div className="label" style={{ marginLeft: "auto" }}>EN-GB</div>
        </div>
      </div>
    </form>
  );
}
