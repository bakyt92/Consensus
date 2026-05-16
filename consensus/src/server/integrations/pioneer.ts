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

  const baseUrl = process.env.PIONEER_API_URL ?? "https://api.pioneer.ai/v1";
  const model = process.env.PIONEER_MODEL ?? "Qwen/Qwen3-8B";

  const userTurn = [
    `Agenda: ${args.agenda}`,
    `Criteria: ${args.criteria}`,
    args.username ? `Speaker: ${args.username}` : null,
    `Utterance: ${JSON.stringify(args.text)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "X-API-Key": process.env.PIONEER_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            'You are a meeting moderator\'s pre-filter. Decide if the participant\'s utterance is on-topic for the agenda and criteria. Respond ONLY with JSON of the form {"isOnTopic": boolean, "confidence": number between 0 and 1, "consensusDelta": number between -1 and 1, "reason": string}. consensusDelta is how much this utterance moves the group toward (+) or away from (-) satisfying the criteria; 0 means neutral.',
        },
        { role: "user", content: userTurn },
      ],
      response_format: { type: "json_object" },
      max_tokens: 120,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Pioneer ${res.status}: ${msg.slice(0, 2000)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(
      `Pioneer response missing choices[0].message.content: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }

  let parsed: {
    isOnTopic?: unknown;
    confidence?: unknown;
    consensusDelta?: unknown;
    reason?: unknown;
  };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(
      `Pioneer returned non-JSON content: ${content.slice(0, 200)}`,
    );
  }

  const isOnTopic =
    typeof parsed.isOnTopic === "boolean" ? parsed.isOnTopic : true;
  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;
  const consensusDelta =
    typeof parsed.consensusDelta === "number"
      ? Math.max(-1, Math.min(1, parsed.consensusDelta))
      : undefined;
  const reason =
    typeof parsed.reason === "string" ? parsed.reason : undefined;

  return { isOnTopic, confidence, consensusDelta, reason, stubbed: false };
}
