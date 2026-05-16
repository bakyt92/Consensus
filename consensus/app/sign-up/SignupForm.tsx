"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signupFormAction } from "@/src/lib/auth-actions";
import { ArrowRight } from "@/src/components/Icon";

/**
 * Why this is plain + minimal:
 *
 *   - <form action={formAction}> is the React 19 declarative pattern.
 *     Next.js wires the form to the Server Action at SSR time, so the
 *     POST happens correctly even before client JS finishes hydrating.
 *   - We do NOT mirror inputs into useState for validation. Doing so
 *     would couple the button-enabled state to hydration; if hydration
 *     fails or is delayed, the user would see the button permanently
 *     disabled. Instead we rely on HTML5 validation (required, type=email,
 *     minLength) which the browser enforces natively before submit.
 *   - `useActionState` only drives post-submit UX (showing magic-link
 *     screen, errors, the spinner on the submit button). If JS hasn't
 *     hydrated yet, the form still works — the user just doesn't get the
 *     in-page result UI until the page round-trips.
 */
export function SignupForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(signupFormAction, null);

  useEffect(() => {
    if (state?.kind === "session") {
      router.replace("/lobby");
      router.refresh();
    }
  }, [state, router]);

  if (state?.kind === "magic_sent") {
    return (
      <div style={{ maxWidth: 460, width: "100%" }}>
        <div className="label">STEP 01 · CHECK YOUR INBOX</div>
        <h1 className="h1" style={{ margin: "12px 0 14px" }}>
          We sent you<br />a link.
        </h1>
        <p className="body" style={{ maxWidth: 380, marginBottom: 24 }}>
          We recognised <strong>{state.email}</strong> from a previous session.
          Click the magic link in your inbox to sign back in. It expires in 15
          minutes.
        </p>
        <p className="label" style={{ fontSize: 11 }}>
          DEV NOTE: WITHOUT A RESEND KEY, THE LINK IS LOGGED TO THE SERVER CONSOLE.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} style={{ maxWidth: 460, width: "100%" }}>
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
          <label className="field-label" htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            name="email"
            className="input"
            type="email"
            placeholder="you@organisation.org"
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="signup-username">Username</label>
          <input
            id="signup-username"
            name="username"
            className="input"
            type="text"
            placeholder="e.g. Maya R."
            autoComplete="nickname"
            required
            minLength={2}
            maxLength={40}
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

      {state?.kind === "error" && (
        <div
          className="label"
          style={{ color: "var(--rust)", marginTop: 16, fontSize: 12 }}
        >
          {state.message}
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
