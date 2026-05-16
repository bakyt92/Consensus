import { describe, expect, it } from "vitest";
import { parsePioneerResponse } from "@/src/server/integrations/gliner";

const debateLabels = ["pro", "con", "question", "clarification", "synthesis"] as const;

function envelope(content: object) {
  return { choices: [{ message: { content: JSON.stringify(content) } }] };
}

describe("parsePioneerResponse", () => {
  it("picks the highest-confidence non-sentiment label as category", () => {
    const out = parsePioneerResponse(
      envelope({
        entities: {
          pro: [{ text: "ship in Q3", confidence: 0.81, start: 0, end: 10 }],
          con: [{ text: "delay", confidence: 0.52, start: 30, end: 35 }],
          positive: [],
          negative: [{ text: "API risk", confidence: 0.65, start: 12, end: 20 }],
          neutral: [],
        },
      }),
      debateLabels,
    );
    expect(out.category).toBe("pro");
    expect(out.categoryConfidence).toBeCloseTo(0.81, 2);
    expect(out.sentiment).toBe("negative");
    expect(out.sentimentConfidence).toBeCloseTo(0.65, 2);
    expect(out.spans.some((s) => s.label === "pro")).toBe(true);
    expect(out.spans.some((s) => s.label === "negative")).toBe(false);
  });

  it("returns null category when no label clears the threshold", () => {
    const out = parsePioneerResponse(
      envelope({
        entities: {
          pro: [{ text: "maybe", confidence: 0.3, start: 0, end: 5 }],
          positive: [],
          negative: [],
          neutral: [],
        },
      }),
      debateLabels,
    );
    expect(out.category).toBeNull();
    expect(out.categoryConfidence).toBeNull();
  });

  it("falls back to neutral when no sentiment spans returned", () => {
    const out = parsePioneerResponse(
      envelope({
        entities: {
          pro: [{ text: "ok", confidence: 0.7, start: 0, end: 2 }],
        },
      }),
      debateLabels,
    );
    expect(out.sentiment).toBe("neutral");
    expect(out.sentimentConfidence).toBeNull();
  });

  it("returns stub fallback on malformed JSON", () => {
    const out = parsePioneerResponse(
      { choices: [{ message: { content: "not json" } }] },
      debateLabels,
    );
    expect(out.stubbed).toBe(true);
    expect(out.category).toBe("pro");
  });

  it("returns stub fallback on missing envelope", () => {
    const out = parsePioneerResponse({}, debateLabels);
    expect(out.stubbed).toBe(true);
    expect(out.sentiment).toBe("neutral");
  });
});
