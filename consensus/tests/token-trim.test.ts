import { describe, expect, it } from "vitest";
import { trimForGliner } from "@/src/lib/token-trim";

describe("trimForGliner", () => {
  it("leaves short text untouched", () => {
    expect(trimForGliner("hello world")).toBe("hello world");
  });

  it("returns text exactly at the limit unchanged", () => {
    const s = "x".repeat(6000);
    expect(trimForGliner(s)).toBe(s);
  });

  it("clamps oversize text to ≤ maxChars", () => {
    const s = "x".repeat(50_000);
    const out = trimForGliner(s);
    expect(out.length).toBeLessThanOrEqual(6000);
  });

  it("preserves both head and tail content", () => {
    const head = "HEAD_FRAMING_" + "a".repeat(20_000);
    const tail = "b".repeat(20_000) + "_TAIL_CONCLUSION";
    const out = trimForGliner(head + tail);
    expect(out.startsWith("HEAD_FRAMING_")).toBe(true);
    expect(out.endsWith("_TAIL_CONCLUSION")).toBe(true);
    expect(out).toContain("…[trimmed]…");
  });

  it("honours a custom max", () => {
    const out = trimForGliner("z".repeat(2_000), 100);
    expect(out.length).toBeLessThanOrEqual(100);
  });
});
