"use client";

import { useActionState, useRef } from "react";
import { createRoomFormAction } from "@/src/lib/room-actions";
import { ArrowRight, Eye } from "@/src/components/Icon";
import { TEMPLATES, TEMPLATE_ORDER } from "@/src/lib/templates";

const EXAMPLE_AGENDA =
  "Hybrid working policy — 2026 H1\n\nDetermine a shared minimum-days-in-office expectation across the engineering org, accounting for team rituals, parent schedules, and individual focus needs.";
const EXAMPLE_CRITERIA =
  "All four participants must explicitly agree on (a) a minimum number of days, and (b) whether those days are fixed company-wide or chosen per team. The agreement must include a quarterly review clause.";

/**
 * Declarative-form-action pattern (same as SignupForm) — the form's POST is
 * wired by Next at SSR time, so submit works even pre-hydration. We deliberately
 * do NOT mirror inputs into useState, because deriving `disabled` from local
 * state coupled the button to hydration and broke /create previously
 * (Consensus/BUGS.md). HTML5 `required` + `minLength` enforce validation
 * natively in the browser.
 *
 * Popovers use <details>/<summary> so they open with zero JS — same reason.
 * "Try with an example" still needs JS to fill the textareas; if hydration
 * fails it just silently no-ops, but the rest of the form is unaffected.
 */
export function CreateRoomForm({ username }: { username: string }) {
  const [state, formAction, isPending] = useActionState(createRoomFormAction, null);
  const agendaRef = useRef<HTMLTextAreaElement | null>(null);
  const criteriaRef = useRef<HTMLTextAreaElement | null>(null);

  function fillExample() {
    if (agendaRef.current) agendaRef.current.value = EXAMPLE_AGENDA;
    if (criteriaRef.current) criteriaRef.current.value = EXAMPLE_CRITERIA;
  }

  return (
    <>
      <button
        type="button"
        onClick={fillExample}
        className="btn btn-soft btn-xs"
        style={{ marginBottom: 40 }}
      >
        <Eye /> Try with an example
      </button>

      <form
        action={formAction}
        className="stack"
        style={{ ["--gap" as never]: "32px" }}
      >
        <fieldset className="template-picker">
          <div style={{ display: "flex", alignItems: "center" }}>
            <legend className="field-label" style={{ marginBottom: 0 }}>
              Meeting template
            </legend>
            <details className="help-details">
              <summary className="help-trigger" aria-label="What do templates change?">
                ?
              </summary>
              <div className="popover" style={{ top: 32, left: 0 }}>
                <div className="label on-navy">TEMPLATES</div>
                Templates change the{" "}
                <strong style={{ color: "var(--cream)" }}>shape of the live summary</strong>, the
                label set the mediator uses, and the chip under each chat message. The
                conversation itself works the same way regardless.
              </div>
            </details>
          </div>
          <p
            className="body"
            style={{ margin: "4px 0 14px", fontSize: 13, color: "var(--muted)" }}
          >
            Pick the shape this meeting wants to take. The classifier and right pane adapt.
          </p>
          <div className="template-grid">
            {TEMPLATE_ORDER.map((key) => {
              const t = TEMPLATES[key];
              const isDefault = key === "debate";
              return (
                <label
                  key={key}
                  className="template-card"
                  htmlFor={`template-${key}`}
                >
                  <input
                    id={`template-${key}`}
                    className="template-radio"
                    type="radio"
                    name="template"
                    value={key}
                    defaultChecked={isDefault}
                  />
                  <span className="template-card-body">
                    <span className="row" style={{ ["--gap" as never]: "10px", marginBottom: 8 }}>
                      <span className="template-icon">{t.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-0.015em" }}>
                        {t.name}
                      </span>
                    </span>
                    <span className="template-tagline">{t.tagline}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="field-with-help">
          <div style={{ display: "flex", alignItems: "center", marginBottom: 0 }}>
            <label className="field-label" htmlFor="create-agenda" style={{ marginBottom: 0 }}>
              Agenda
            </label>
            <details className="help-details">
              <summary className="help-trigger" aria-label="What's a good agenda?">
                ?
              </summary>
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
            </details>
          </div>
          <p
            className="body"
            style={{ margin: "4px 0 12px", fontSize: 13, color: "var(--muted)" }}
          >
            What is this meeting actually trying to settle? Stay concrete.
          </p>
          <textarea
            ref={agendaRef}
            id="create-agenda"
            name="agenda"
            className="textarea"
            rows={4}
            placeholder="e.g. Decide on the minimum days-per-week expectation for in-office work, effective H1 2026."
            required
            minLength={10}
            maxLength={2000}
          />
        </div>

        <div className="field-with-help">
          <div style={{ display: "flex", alignItems: "center" }}>
            <label className="field-label" htmlFor="create-criteria" style={{ marginBottom: 0 }}>
              Evaluation criteria
            </label>
            <details className="help-details">
              <summary className="help-trigger" aria-label="How do I write evaluation criteria?">
                ?
              </summary>
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
            </details>
          </div>
          <p
            className="body"
            style={{ margin: "4px 0 12px", fontSize: 13, color: "var(--muted)" }}
          >
            What does "we agree" look like in this room? Consensus closes when this is
            satisfied.
          </p>
          <textarea
            ref={criteriaRef}
            id="create-criteria"
            name="criteria"
            className="textarea"
            rows={4}
            placeholder="e.g. All four participants explicitly agree on (a) a minimum number of days and (b) whether those days are fixed or chosen per team."
            required
            minLength={10}
            maxLength={2000}
          />
        </div>

        <hr className="rule" />

        {state?.error && (
          <div className="label" style={{ color: "var(--rust)" }}>
            {state.error}
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
            disabled={isPending}
          >
            {isPending ? "Opening…" : "Open the room"} <ArrowRight />
          </button>
        </div>
      </form>
    </>
  );
}
