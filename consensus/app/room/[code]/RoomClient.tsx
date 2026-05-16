"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brandmark, Wordmark } from "@/src/components/Brand";
import {
  Check,
  Close,
  Kebab,
  Lock,
  Mic,
  Send,
  Users,
} from "@/src/components/Icon";
import { Markdown, renderInline } from "@/src/components/Markdown";
import { useRoomChannel, type RoomMessage } from "@/src/components/useRoomChannel";
import {
  sendMessage,
  lockRoom,
  requestCloseMeeting,
} from "@/src/lib/room-actions";

type Props = {
  code: string;
  agenda: string;
  agendaTitle: string;
  criteria: string;
  isAdmin: boolean;
  me: { id: string; username: string };
  adminName: string;
};

export function RoomClient(props: Props) {
  const router = useRouter();
  const {
    messages,
    summary,
    consensus,
    status,
    participants,
    connected,
  } = useRoomChannel(props.code);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [, startTransition] = useTransition();
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!kebabOpen) return;
      const t = e.target as HTMLElement;
      if (!t.closest(".kebab-wrap")) setKebabOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [kebabOpen]);

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setError(null);
    setDraft("");
    startTransition(async () => {
      const res = await sendMessage({ code: props.code, text });
      if (!res.ok) setError(res.error);
    });
  }

  function copyCode() {
    navigator.clipboard?.writeText(props.code).catch(() => {});
    setKebabOpen(false);
  }

  function toggleLock() {
    setKebabOpen(false);
    startTransition(async () => {
      await lockRoom(props.code, status !== "LOCKED");
    });
  }

  function closeEarly() {
    setKebabOpen(false);
    const confirm = window.confirm(
      "Close the meeting before consensus is reached? Participants will lose chat access and the current summary becomes the final minutes.",
    );
    if (!confirm) return;
    startTransition(async () => {
      const res = await requestCloseMeeting(props.code);
      if (!res.ok) setError(res.error);
    });
  }

  function closeWithConsensus() {
    startTransition(async () => {
      const res = await requestCloseMeeting(props.code);
      if (!res.ok) setError(res.error);
    });
  }

  const consensusMet = consensus.status === "REACHED";
  const composeDisabled =
    status === "CLOSED" || status === "STOPPING" || !connected;

  return (
    <div className="room">
      <div className="room-header">
        <div className="brand" style={{ gap: 10 }}>
          <Brandmark />
          <Wordmark />
        </div>
        <div style={{ width: 1, height: 28, background: "var(--line)" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ ["--gap" as never]: "10px" }}>
            <span
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                color: "var(--muted)",
              }}
            >
              {props.code}
            </span>
            {status === "OPEN" && (
              <span className="pill live">
                <span className="dot"></span> Live
              </span>
            )}
            {status === "PENDING" && (
              <span className="pill">
                <span className="dot"></span> Starting…
              </span>
            )}
            {status === "LOCKED" && (
              <span className="pill locked">
                <span className="dot"></span> Locked
              </span>
            )}
            {status === "STOPPING" && (
              <span className="pill locked">
                <span className="dot"></span> Closing
              </span>
            )}
            {consensus.status === "REACHED" && status !== "CLOSED" && (
              <span className="pill ok">
                <span className="dot"></span> Consensus reached
              </span>
            )}
            {!connected && (
              <span className="pill" style={{ color: "var(--rust)" }}>
                <span
                  className="dot"
                  style={{ background: "var(--rust)" }}
                ></span>{" "}
                Reconnecting…
              </span>
            )}
          </div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "-0.015em",
              marginTop: 4,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {props.agendaTitle}
          </div>
        </div>

        <div className="avatar-row sm">
          {participants.map((p) => (
            <div
              key={p.userId}
              className={"avatar sm" + (p.userId === props.me.id ? " you" : "")}
              title={p.username}
            >
              {p.username[0]?.toUpperCase() ?? "?"}
            </div>
          ))}
        </div>

        {props.isAdmin ? (
          <>
            {consensusMet && status !== "STOPPING" && (
              <button
                className="btn btn-primary btn-sm"
                onClick={closeWithConsensus}
              >
                <Check /> Close & Export
              </button>
            )}
            <div className="kebab-wrap">
              <button
                className="kebab-btn"
                onClick={() => setKebabOpen((o) => !o)}
                aria-label="Admin menu"
              >
                <Kebab />
              </button>
              {kebabOpen && (
                <div className="kebab-menu">
                  <div className="head">
                    <div className="label">ADMIN ACTIONS</div>
                  </div>
                  <button className="item" onClick={copyCode}>
                    <Users style={{ opacity: 0.6 }} />
                    <div style={{ flex: 1 }}>
                      Copy room code
                      <span className="sub">Share with new participants</span>
                    </div>
                  </button>
                  <button className="item" onClick={toggleLock}>
                    <Lock style={{ opacity: 0.6 }} />
                    <div style={{ flex: 1 }}>
                      {status === "LOCKED" ? "Unlock room" : "Lock room"}
                      <span className="sub">
                        {status === "LOCKED"
                          ? "Anyone with the code can rejoin"
                          : "No new participants can enter"}
                      </span>
                    </div>
                  </button>
                  <div className="item-divider"></div>
                  <button className="item danger" onClick={closeEarly}>
                    <Close />
                    <div style={{ flex: 1 }}>
                      Close meeting early
                      <span
                        className="sub"
                        style={{ color: "rgba(197,77,44,0.7)" }}
                      >
                        End now, before consensus is reached
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <Link href="/lobby" className="btn btn-soft btn-sm">
            Leave
          </Link>
        )}
      </div>

      <div className="room-body">
        <aside className="room-chat">
          <div className="chat-head">
            <div>
              <div className="label">DISCUSSION</div>
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                {
                  messages.filter(
                    (m) => m.role !== "system" && !m.filtered,
                  ).length
                }{" "}
                contributions
                <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                  {" "}
                  · {messages.filter((m) => m.filtered).length} filtered
                </span>
              </div>
            </div>
            <span className="pill">
              <span
                className="dot"
                style={{ background: "var(--ok)" }}
              ></span>{" "}
              Mediator on
            </span>
          </div>

          <div className="chat-feed" ref={feedRef}>
            {messages.map((m) => (
              <ChatBubble key={m.id} m={m} meId={props.me.id} />
            ))}
            {consensusMet && status !== "CLOSED" && (
              <div
                className="card"
                style={{
                  background: "var(--ok-soft)",
                  borderColor: "rgba(45,107,79,0.3)",
                  textAlign: "center",
                  padding: 16,
                }}
              >
                <Check
                  style={{
                    color: "var(--ok)",
                    width: 24,
                    height: 24,
                    margin: "0 auto 6px",
                  }}
                />
                <div
                  style={{
                    fontWeight: 700,
                    color: "var(--ok)",
                    fontSize: 14,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Consensus reached.
                </div>
                <div className="body" style={{ fontSize: 12, marginTop: 4 }}>
                  Admin can now close & export the minutes.
                </div>
              </div>
            )}
          </div>

          <div className="chat-input-bar">
            <div style={{ position: "relative" }}>
              <div className="input-row">
                <input
                  type="text"
                  placeholder={
                    composeDisabled
                      ? status === "CLOSED" || status === "STOPPING"
                        ? "Meeting closed."
                        : "Reconnecting…"
                      : "Share your position…"
                  }
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                  disabled={composeDisabled}
                />
                <button
                  className="icon-btn"
                  disabled
                  title="Speech-to-text — coming soon"
                  type="button"
                >
                  <Mic />
                </button>
                <button
                  className="icon-btn send"
                  onClick={submit}
                  disabled={!draft.trim() || composeDisabled}
                  title="Send"
                  type="button"
                >
                  <Send />
                </button>
              </div>
            </div>
            {error && (
              <div
                className="label"
                style={{ color: "var(--rust)", marginTop: 8, fontSize: 11 }}
              >
                {error}
              </div>
            )}
            <div
              className="row"
              style={{ justifyContent: "space-between", marginTop: 8 }}
            >
              <span className="label" style={{ fontSize: 9 }}>
                ENTER TO SEND
              </span>
              <span className="label" style={{ fontSize: 9 }}>
                MEDIATOR FILTERS OFF-TOPIC INPUT
              </span>
            </div>
          </div>
        </aside>

        <main className="room-center">
          <div className="summary-doc">
            {consensus.status === "REACHED" && status !== "CLOSED" && (
              <div className="doc-banner consensus-met">
                <div
                  style={{
                    width: 48,
                    height: 48,
                    background: "rgba(243,236,217,0.18)",
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
                  <div className="bigtext">Consensus reached</div>
                  <div className="subtext">
                    Evaluation criteria satisfied. Facilitator may close the
                    meeting.
                  </div>
                </div>
                {props.isAdmin && status !== "STOPPING" && (
                  <button
                    className="btn btn-sm"
                    style={{
                      background: "var(--cream)",
                      color: "var(--ok)",
                      borderColor: "var(--cream)",
                    }}
                    onClick={closeWithConsensus}
                  >
                    Close & Export
                  </button>
                )}
              </div>
            )}

            <ConsensusBar
              pct={consensus.percent}
              met={consensus.status === "REACHED"}
            />

            <div className="doc-head" style={{ marginTop: 28 }}>
              <div className="label">LIVE SUMMARY · MARKDOWN</div>
              <h1 className="doc-title">{props.agendaTitle}</h1>
              <div className="doc-meta">
                <div>
                  <span className="label">ROOM</span>
                  <span
                    className="mono"
                    style={{ fontWeight: 600, fontSize: 14 }}
                  >
                    {props.code}
                  </span>
                </div>
                <div>
                  <span className="label">FACILITATOR</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {props.adminName}
                  </span>
                </div>
                <div>
                  <span className="label">STATUS</span>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color:
                        consensus.status === "REACHED"
                          ? "var(--ok)"
                          : "var(--rust)",
                    }}
                  >
                    {consensus.status === "REACHED"
                      ? "Consensus reached"
                      : "In progress"}
                  </span>
                </div>
              </div>
            </div>

            <Markdown source={summary} />
          </div>
        </main>

        <aside className="room-right">
          <div className="label" style={{ marginBottom: 10 }}>
            PARTICIPANTS · {participants.length}
          </div>
          <div className="card flat" style={{ padding: 4, border: 0 }}>
            {participants.map((p) => (
              <div key={p.userId} className="p-row">
                <div
                  className={
                    "avatar" + (p.userId === props.me.id ? " you" : "")
                  }
                >
                  {p.username[0]?.toUpperCase() ?? "?"}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="p-name">
                    {p.username}
                    {p.userId === props.me.id ? " · you" : ""}
                  </div>
                  <div className="p-sub">
                    {p.role === "admin" ? "Facilitator · Admin" : "Participant"}
                  </div>
                </div>
                <span className="p-bullet"></span>
              </div>
            ))}
          </div>

          <hr className="rule" style={{ margin: "24px 0 20px" }} />

          <div className="label" style={{ marginBottom: 10 }}>
            EVALUATION CRITERIA
          </div>
          <p
            className="body"
            style={{ fontSize: 13, margin: 0, lineHeight: 1.45 }}
          >
            {props.criteria}
          </p>

          <hr className="rule" style={{ margin: "24px 0 20px" }} />

          <div className="label" style={{ marginBottom: 8 }}>
            FILTERED THIS SESSION
          </div>
          <div
            className="row"
            style={{ ["--gap" as never]: "8px", alignItems: "baseline" }}
          >
            <span className="num" style={{ fontSize: 32 }}>
              {messages.filter((m) => m.filtered).length}
            </span>
            <span className="label" style={{ fontSize: 10 }}>
              OFF-TOPIC MESSAGES
            </span>
          </div>
          <p
            className="body"
            style={{ fontSize: 12, marginTop: 6, lineHeight: 1.4 }}
          >
            The mediator hides asides and non-contributing messages from the
            summary, but keeps them in chat for transparency.
          </p>
        </aside>
      </div>
    </div>
  );
}

function ChatBubble({ m, meId }: { m: RoomMessage; meId: string }) {
  if (m.role === "system") {
    return (
      <div style={{ textAlign: "center", padding: "4px 0" }}>
        <span className="label" style={{ fontSize: 10 }}>
          · {m.text} ·
        </span>
      </div>
    );
  }
  if (m.filtered) {
    return (
      <div className="msg filtered">
        <div className="msg-body" style={{ flex: 1 }}>
          <div className="msg-text">
            (off-topic message hidden by mediator)
          </div>
        </div>
      </div>
    );
  }
  const isMe = m.userId === meId;
  const isMediator = m.role === "mediator";
  const displayName = isMediator
    ? "Mediator"
    : isMe
      ? `You · ${m.username ?? ""}`
      : m.username ?? "Participant";
  const initials = isMediator
    ? "C"
    : (m.username ?? "?")[0]?.toUpperCase() ?? "?";
  const time = new Date(m.sentAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className={"msg" + (isMediator ? " mediator" : "")}>
      <div className={"avatar" + (isMe ? " you" : "")}>{initials}</div>
      <div className="msg-body">
        <div className="msg-meta">
          <span className="msg-name">{displayName}</span>
          <span className="msg-time">{time}</span>
        </div>
        <div
          className="msg-text"
          dangerouslySetInnerHTML={{ __html: renderInline(m.text) }}
        />
      </div>
    </div>
  );
}

function ConsensusBar({ pct, met }: { pct: number; met: boolean }) {
  const threshold = 80;
  const display = Math.max(0, Math.min(100, pct));
  return (
    <div className="card consensus-card">
      <div
        className="row"
        style={{ justifyContent: "space-between", marginBottom: 10 }}
      >
        <div className="label">CONSENSUS</div>
        <div className="row" style={{ ["--gap" as never]: "6px" }}>
          <span
            className="num"
            style={{ fontSize: 22, color: met ? "var(--ok)" : "var(--ink)" }}
          >
            {Math.round(display)}%
          </span>
          <span className="label" style={{ fontSize: 10 }}>
            / {threshold}% needed
          </span>
        </div>
      </div>
      <div className="consensus-bar">
        <div
          className={"consensus-fill" + (met ? " met" : "")}
          style={{ width: display + "%" }}
        ></div>
        <div className="threshold-marker" style={{ left: threshold + "%" }}></div>
      </div>
      <div
        className="row"
        style={{ justifyContent: "space-between", marginTop: 10 }}
      >
        <span className="label" style={{ fontSize: 10 }}>
          {met
            ? "THRESHOLD MET · READY TO CLOSE"
            : `${Math.max(0, threshold - Math.round(display))}% TO THRESHOLD`}
        </span>
        <span className="label" style={{ fontSize: 10 }}>
          EVALUATED LIVE
        </span>
      </div>
    </div>
  );
}
