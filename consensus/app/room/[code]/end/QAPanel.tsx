"use client";

import { useRef, useState } from "react";

type Participant = { id: string; username: string; voiceCloned: boolean };
type Turn =
  | {
      kind: "asked";
      question: string;
      about: Participant;
      at: number;
    }
  | {
      kind: "answered";
      about: Participant;
      answer: string;
      audioUrl: string | null;
      at: number;
    };

export function QAPanel({
  code,
  participants,
}: {
  code: string;
  participants: Participant[];
}) {
  const [aboutId, setAboutId] = useState<string>(participants[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const target = participants.find((p) => p.id === aboutId);
    if (!target || !question.trim()) return;
    const now = Date.now();
    setTurns((t) => [...t, { kind: "asked", question, about: target, at: now }]);
    setPending(true);
    try {
      const res = await fetch(`/api/room/${encodeURIComponent(code)}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aboutUserId: target.id, question }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const json = (await res.json()) as {
        answer: string;
        audioUrl: string | null;
        voiceCloned: boolean;
      };
      setTurns((t) => [
        ...t,
        {
          kind: "answered",
          about: target,
          answer: json.answer,
          audioUrl: json.audioUrl,
          at: Date.now(),
        },
      ]);
      setQuestion("");
      if (json.audioUrl && audioRef.current) {
        audioRef.current.src = json.audioUrl;
        void audioRef.current.play();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  if (participants.length === 0) {
    return null;
  }

  return (
    <section
      style={{
        marginTop: 32,
        padding: "20px 24px",
        background: "var(--cream)",
        border: "1px solid var(--line)",
        borderRadius: 8,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>Ask the room</h2>
      <p style={{ marginTop: 6, marginBottom: 0, opacity: 0.7, fontSize: 13 }}>
        Type a question about another participant. Answers are grounded in
        their actual messages and read aloud in their cloned voice when one
        exists.
      </p>
      <form
        onSubmit={submit}
        style={{ display: "grid", gap: 10, marginTop: 14 }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>About:</span>
          <select
            value={aboutId}
            onChange={(e) => setAboutId(e.target.value)}
            disabled={pending}
            style={{ padding: "6px 10px", borderRadius: 4 }}
          >
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.username}
                {p.voiceCloned ? " 🔊" : ""}
              </option>
            ))}
          </select>
        </label>
        <textarea
          rows={3}
          placeholder="What did Alice think about pricing?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={pending}
          style={{ padding: 10, borderRadius: 4, fontFamily: "inherit" }}
        />
        <div>
          <button
            type="submit"
            className="btn"
            disabled={pending || !question.trim()}
          >
            {pending ? "Asking…" : "Ask"}
          </button>
        </div>
        {error && (
          <div role="alert" style={{ color: "var(--rust)", fontSize: 13 }}>
            {error}
          </div>
        )}
      </form>

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          marginTop: 18,
          display: "grid",
          gap: 14,
        }}
      >
        {turns.map((t) =>
          t.kind === "asked" ? (
            <li key={`q-${t.at}`} style={{ fontSize: 14 }}>
              <strong>You</strong> asked about{" "}
              <strong>{t.about.username}</strong>: {t.question}
            </li>
          ) : (
            <li key={`a-${t.at}`} style={{ fontSize: 14 }}>
              <strong>{t.about.username}</strong>{" "}
              <span style={{ opacity: 0.6 }}>(synthesized)</span>: {t.answer}
              {t.audioUrl && (
                <div style={{ marginTop: 6 }}>
                  <audio controls src={t.audioUrl} />
                </div>
              )}
            </li>
          ),
        )}
      </ul>
      <audio ref={audioRef} hidden />
    </section>
  );
}
