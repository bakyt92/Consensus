"use client";

import { useEffect } from "react";
import { Close } from "./Icon";
import { MessageBadge } from "./MessageBadge";
import type { Participant, RoomMessage, Sentiment } from "./useRoomChannel";
import { getTemplate } from "@/src/lib/templates";

type Props = {
  participant: Participant | null;
  messages: RoomMessage[];
  templateKey: string;
  isYouId: string;
  onClose: () => void;
};

// Slide-in drawer (desktop) / modal (mobile via CSS) showing how a
// participant's messages have been classified by GLiNER. Mirrors the
// designer's <ParticipantInspector /> in designs/project/room.jsx.
export function ClassificationPanel({
  participant,
  messages,
  templateKey,
  isYouId,
  onClose,
}: Props) {
  const open = !!participant;

  // Close on escape — matches the prototype.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const template = getTemplate(templateKey);
  const labels = template.labels;
  const mine = participant
    ? messages.filter(
        (m) =>
          m.role === "user" && !m.filtered && m.userId === participant.userId,
      )
    : [];

  const counts: Record<string, number> = {};
  for (const l of labels) counts[l] = 0;
  for (const m of mine) {
    if (m.category && m.category in counts) counts[m.category]++;
  }
  const labelsInUse = Object.values(counts).filter((c) => c > 0).length;
  const maxCount = Math.max(1, ...Object.values(counts));

  const sentCounts: Record<Sentiment, number> = {
    positive: 0,
    negative: 0,
    neutral: 0,
  };
  for (const m of mine) {
    const s = m.sentiment ?? "neutral";
    sentCounts[s]++;
  }
  const posNegTotal = sentCounts.positive + sentCounts.negative;
  const positivePct =
    posNegTotal === 0
      ? "—"
      : `${Math.round((100 * sentCounts.positive) / posNegTotal)}%`;

  const recent = [...mine].reverse();
  const isYou = participant?.userId === isYouId;

  return (
    <>
      <div
        className={"inspector-backdrop" + (open ? " open" : "")}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={"inspector-drawer" + (open ? " open" : "")}
        role="dialog"
        aria-hidden={!open}
        aria-label="Participant inspector"
      >
        {participant && (
          <>
            <div className="inspector-head">
              <div className="row" style={{ ["--gap" as never]: "14px" }}>
                <div className={"avatar lg" + (isYou ? " you" : "")}>
                  {participant.username[0]?.toUpperCase() ?? "?"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="label">PARTICIPANT</div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 20,
                      letterSpacing: "-0.02em",
                      marginTop: 2,
                    }}
                  >
                    {participant.username}
                    {isYou ? " · you" : ""}
                  </div>
                  <div className="label" style={{ marginTop: 4, fontSize: 10 }}>
                    {participant.role === "admin"
                      ? "FACILITATOR · ADMIN"
                      : "PARTICIPANT"}
                  </div>
                </div>
                <button
                  className="inspector-close"
                  onClick={onClose}
                  aria-label="Close"
                  type="button"
                >
                  <Close />
                </button>
              </div>
              <div className="row" style={{ ["--gap" as never]: "20px" }}>
                <div>
                  <div className="num" style={{ fontSize: 22 }}>
                    {mine.length}
                  </div>
                  <div className="label" style={{ fontSize: 9 }}>
                    CONTRIBUTIONS
                  </div>
                </div>
                <div>
                  <div className="num" style={{ fontSize: 22 }}>
                    {labelsInUse}
                  </div>
                  <div className="label" style={{ fontSize: 9 }}>
                    LABELS USED
                  </div>
                </div>
                <div>
                  <div
                    className="num"
                    style={{
                      fontSize: 22,
                      color:
                        sentCounts.negative > sentCounts.positive
                          ? "var(--rust)"
                          : "var(--navy)",
                    }}
                  >
                    {positivePct}
                  </div>
                  <div className="label" style={{ fontSize: 9 }}>
                    POSITIVE LEAN
                  </div>
                </div>
              </div>
            </div>

            <div className="inspector-body">
              {labels.length === 0 ? (
                <div
                  style={{
                    padding: "32px 14px",
                    textAlign: "center",
                    color: "var(--muted)",
                    fontFamily: "Newsreader",
                    fontStyle: "italic",
                  }}
                >
                  This room uses no template. Pick a template when creating the
                  room to see classification.
                </div>
              ) : (
                <>
                  <div
                    className="row"
                    style={{ ["--gap" as never]: "10px", marginBottom: 12 }}
                  >
                    <span className="label">LABEL DISTRIBUTION</span>
                    <hr className="rule" style={{ flex: 1 }} />
                  </div>
                  <div className="histogram">
                    {labels.map((l) => (
                      <div key={l} className="hrow">
                        <span className="hlabel">{l}</span>
                        <div className="hbar">
                          <div
                            className="hfill"
                            style={{
                              width: (counts[l] / maxCount) * 100 + "%",
                              opacity: counts[l] ? 1 : 0.2,
                            }}
                          />
                        </div>
                        <span
                          className="hcount"
                          style={{
                            color: counts[l] ? "var(--ink)" : "var(--muted-2)",
                          }}
                        >
                          {counts[l]}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div
                    className="row"
                    style={{
                      ["--gap" as never]: "10px",
                      marginTop: 28,
                      marginBottom: 12,
                    }}
                  >
                    <span className="label">SENTIMENT</span>
                    <hr className="rule" style={{ flex: 1 }} />
                  </div>
                  <div className="sent-row">
                    {(
                      [
                        { key: "positive", label: "Positive", dot: "var(--navy)" },
                        { key: "neutral", label: "Neutral", dot: "var(--muted)" },
                        { key: "negative", label: "Negative", dot: "var(--rust)" },
                      ] as const
                    ).map((s) => (
                      <div key={s.key} className="sent-cell">
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            marginBottom: 6,
                          }}
                        >
                          <span
                            className="sent-dot"
                            style={{ background: s.dot }}
                          />
                          <span className="label" style={{ fontSize: 9 }}>
                            {s.label}
                          </span>
                        </div>
                        <div
                          className="num"
                          style={{ fontSize: 22, color: "var(--ink)" }}
                        >
                          {sentCounts[s.key]}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    className="row"
                    style={{
                      ["--gap" as never]: "10px",
                      marginTop: 28,
                      marginBottom: 12,
                    }}
                  >
                    <span className="label">RECENT MESSAGES · NEWEST FIRST</span>
                    <hr className="rule" style={{ flex: 1 }} />
                  </div>
                  {recent.length === 0 ? (
                    <div
                      style={{
                        padding: "24px 14px",
                        textAlign: "center",
                        color: "var(--muted)",
                        fontStyle: "italic",
                        fontFamily: "Newsreader",
                        fontSize: 14,
                      }}
                    >
                      No contributions yet in this session.
                    </div>
                  ) : (
                    recent.map((m) => (
                      <div key={m.id} className="insp-msg">
                        <div className="insp-meta">
                          <MessageBadge
                            category={m.category}
                            sentiment={m.sentiment ?? "neutral"}
                          />
                          <span className="insp-time">
                            {new Date(m.sentAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="insp-text">{m.text}</div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
