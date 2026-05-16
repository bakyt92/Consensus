// GLiNER (Pioneer) has an 8.2K total-tokens budget. Per the design doc we
// clamp inputs to a safe ~1,700 tokens (≈6,000 chars at ~3.5 chars/token).
// Strategy: keep the head (framing) and the tail (conclusion), drop the
// middle — gives the model both start and end context.

const DEFAULT_MAX = 6000;
const SEPARATOR = "\n…[trimmed]…\n";
const HEAD_SHARE = 5 / 6;

export function trimForGliner(text: string, maxChars: number = DEFAULT_MAX): string {
  if (text.length <= maxChars) return text;

  const budget = maxChars - SEPARATOR.length;
  if (budget <= 0) {
    // Pathological cap; just slice from the head.
    return text.slice(0, maxChars);
  }
  const headLen = Math.floor(budget * HEAD_SHARE);
  const tailLen = budget - headLen;
  return text.slice(0, headLen) + SEPARATOR + text.slice(text.length - tailLen);
}
