/**
 * Pioneer adapter — fast structured classifier.
 *
 * Production role: per-utterance "is this on-topic + how does it move
 * consensus" call, run before the heavier OpenAI mediator turn. Keeps GPT off
 * the hot path. See CLAUDE.md "two-tier inference" rule.
 *
 * Stub mode: when PIONEER_API_KEY is unset, every utterance is classified
 * on-topic with neutral confidence so the pipeline still runs the OpenAI
 * mediator. To exercise the "skip mediator" path locally, set
 * PIONEER_STUB_FILTER=1 and any message containing "spam" will be filtered.
 */

export type ClassifyArgs = {
  text: string;
  agenda: string;
  criteria: string;
  username?: string;
};

export type ClassifyResult = {
  isOnTopic: boolean;
  confidence: number;
  consensusDelta?: number;
  reason?: string;
  stubbed: boolean;
};

export function pioneerIsConfigured(): boolean {
  return Boolean(process.env.PIONEER_API_KEY);
}

export async function classifyUtterance(
  args: ClassifyArgs,
): Promise<ClassifyResult> {
  if (!pioneerIsConfigured()) {
    const stubFilter =
      process.env.PIONEER_STUB_FILTER === "1" &&
      /\bspam\b/i.test(args.text);
    return {
      isOnTopic: !stubFilter,
      confidence: stubFilter ? 0.95 : 0.5,
      reason: stubFilter ? "stub-filter matched 'spam'" : undefined,
      stubbed: true,
    };
  }

  // Real SDK goes here. Expected shape:
  //   POST {PIONEER_API_URL}/classify with { text, agenda, criteria }
  //   returns { onTopic: bool, confidence: 0-1, consensusDelta?: -1..1 }.
  void args;
  throw new Error(
    "Pioneer real integration not yet wired. Drop the SDK call here and remove this throw.",
  );
}
