"use client";

import type { Sentiment } from "./useRoomChannel";

type Props = {
  category: string | null;
  sentiment: Sentiment | null;
  dark?: boolean; // mediator bubbles render on navy — flip the chip style
};

// Inline chip rendered under each on-topic chat bubble. Mirrors the
// designer's <LabelChip /> in designs/project/templates.jsx — same palette,
// same typography. The dot colour is the only sentiment signal:
//   positive = navy, negative = rust, neutral = muted.
export function MessageBadge({ category, sentiment, dark = false }: Props) {
  if (!category && !sentiment) return null;
  const dot =
    sentiment === "positive"
      ? "var(--navy)"
      : sentiment === "negative"
        ? "var(--rust)"
        : "var(--muted)";
  return (
    <span className={"message-badge" + (dark ? " on-navy" : "")}>
      <span className="message-badge-label">{category ?? "untagged"}</span>
      <span className="message-badge-dot" style={{ background: dot }} />
    </span>
  );
}
