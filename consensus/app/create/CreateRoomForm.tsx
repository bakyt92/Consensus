"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { createRoom } from "@/src/lib/room-actions";
import { ArrowRight, Eye } from "@/src/components/Icon";

const SIZES = [2, 4, 6, 8, 12, 24];

export function CreateRoomForm({ username }: { username: string }) {
  const [agenda, setAgenda] = useState("");
  const [criteria, setCriteria] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [open, setOpen] = useState<"agenda" | "criteria" | "max" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const wrap = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrap.current) return;
      if (!wrap.current.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function example() {
    setAgenda(
      "Hybrid working policy — 2026 H1\n\nDetermine a shared minimum-days-in-office expectation across the engineering org, accounting for team rituals, parent schedules, and individual focus needs.",
    );
    setCriteria(
      "All four participants must explicitly agree on (a) a minimum number of days, and (b) whether those days are fixed company-wide or chosen per team. The agreement must include a quarterly review clause.",
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agenda.trim() || !criteria.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createRoom({ agenda, criteria, maxParticipants });
      // server action redirects on success; if it returns, it's an error
      if (res && "error" in res) setError(res.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={example}
        className="btn btn-soft btn-xs"
        style={{ marginBottom: 40 }}
      >
        <Eye /> Try with an example
      </button>

      <form
        ref={wrap}
        onSubmit={submit}
        className="stack"
        style={{ ["--gap" as never]: "32px" }}
      >
        <div className="field-with-help">
          <div style={{ display: "flex", alignItems: "center", marginBottom: 0 }}>
            <label className="field-label" style={{ marginBottom: 0 }}>
              Agenda
            </label>
            <button
              type="button"
              className="help-trigger"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((p) => (p === "agenda" ? null : "agenda"));
              }}
              aria-label="What's a good agenda?"
            >
              ?
            </button>
            {open === "agenda" && (
              <div className="popover" style={{ top: 32, left: 0 }}>
                <div className="label on-navy">A GOOD AGENDA</div>
                States <strong style={{ color: "var(--cream)" }}>what you're deciding</strong>,
                not just the topic. Give just enough context for someone joining cold
                to understand the stakes.
                <ul>
                  <li>
                    <b>Yes:</b> "Decide whether to ship the v3 redesign before Q4 or
                    delay to Q1."
                  </li>
                  <li>
                    <b>No:</b> "Talk about v3."
                  </li>
                </ul>
              </div>
            )}
          </div>
          <p
            className="body"
            style={{ margin: "4px 0 12px", fontSize: 13, color: "var(--muted)" }}
          >
            What is this meeting actually trying to settle? Stay concrete.
          </p>
          <textarea
            className="textarea"
            rows={4}
            placeholder="e.g. Decide on the minimum days-per-week expectation for in-office work, effective H1 2026."
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
          />
        </div>

        <div className="field-with-help">
          <div style={{ display: "flex", alignItems: "center" }}>
            <label className="field-label" style={{ marginBottom: 0 }}>
              Evaluation criteria
            </label>
            <button
              type="button"
              className="help-trigger"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((p) => (p === "criteria" ? null : "criteria"));
              }}
              aria-label="How do I write evaluation criteria?"
            >
              ?
            </button>
            {open === "criteria" && (
              <div className="popover" style={{ top: 32, left: 0 }}>
                <div className="label on-navy">CRITERIA = "DONE"</div>
                Describes how we'd know consensus has been{" "}
                <strong style={{ color: "var(--cream)" }}>reached</strong>. The mediator
                uses this to evaluate every contribution and to mark the meeting
                complete.
                <ul>
                  <li>
                    Be specific about <b>who</b> must agree (all? quorum? specific
                    roles?)
                  </li>
                  <li>
                    Name the <b>thing</b> they're agreeing on
                  </li>
                  <li>
                    Include any <b>follow-ups</b> the agreement must specify
                  </li>
                </ul>
              </div>
            )}
          </div>
          <p
            className="body"
            style={{ margin: "4px 0 12px", fontSize: 13, color: "var(--muted)" }}
          >
            What does "we agree" look like in this room? Consensus closes when this is
            satisfied.
          </p>
          <textarea
            className="textarea"
            rows={4}
            placeholder="e.g. All four participants explicitly agree on (a) a minimum number of days and (b) whether those days are fixed or chosen per team."
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
          />
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <label className="field-label" style={{ marginBottom: 0 }}>
              Max participants
            </label>
            <button
              type="button"
              className="help-trigger"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((p) => (p === "max" ? null : "max"));
              }}
              aria-label="Max participants"
            >
              ?
            </button>
            {open === "max" && (
              <div className="popover" style={{ top: 32, left: 0 }}>
                Hard cap on who can join via the code. After you lock the room, no one
                new can enter regardless of cap.
              </div>
            )}
          </div>
          <p
            className="body"
            style={{ margin: "4px 0 12px", fontSize: 13, color: "var(--muted)" }}
          >
            Small rooms reach consensus faster. 4–8 is the sweet spot.
          </p>
          <div className="row" style={{ ["--gap" as never]: "8px", flexWrap: "wrap" }}>
            {SIZES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMaxParticipants(n)}
                className={"btn btn-sm " + (maxParticipants === n ? "btn-ink" : "btn-soft")}
                style={{ minWidth: 56 }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <hr className="rule" />

        {error && (
          <div className="label" style={{ color: "var(--rust)" }}>
            {error}
          </div>
        )}

        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="label">YOU WILL BE</div>
            <div className="row" style={{ ["--gap" as never]: "10px", marginTop: 8 }}>
              <div className="avatar you">{username[0]?.toUpperCase() ?? "?"}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{username}</div>
                <div className="label" style={{ fontSize: 10, marginTop: 2 }}>
                  FACILITATOR · ADMIN
                </div>
              </div>
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={!agenda.trim() || !criteria.trim() || isPending}
          >
            {isPending ? "Opening…" : "Open the room"} <ArrowRight />
          </button>
        </div>
      </form>
    </>
  );
}
