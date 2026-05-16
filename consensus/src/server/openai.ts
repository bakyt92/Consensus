import OpenAI from "openai";
import { z } from "zod";

const _client = (() => {
  let inst: OpenAI | null = null;
  return () => {
    if (inst) return inst;
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY is not set. Put it in .env.local before running the mediator.",
      );
    }
    inst = new OpenAI({ apiKey: key });
    return inst;
  };
})();

export const MediatorOutput = z.object({
  isOnTopic: z.boolean(),
  shouldReply: z.boolean(),
  mediatorReply: z.string(),
  updatedSummaryMarkdown: z.string().min(1),
  consensusStatus: z.enum(["PENDING", "STALLED", "REACHED"]),
  consensusPercent: z.number().int().min(0).max(100),
});
export type MediatorOutput = z.infer<typeof MediatorOutput>;

// JSON Schema describing MediatorOutput for the OpenAI structured-output API.
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "isOnTopic",
    "shouldReply",
    "mediatorReply",
    "updatedSummaryMarkdown",
    "consensusStatus",
    "consensusPercent",
  ],
  properties: {
    isOnTopic: {
      type: "boolean",
      description:
        "Whether the new participant message is a substantive on-topic contribution. True if there is no new message.",
    },
    shouldReply: {
      type: "boolean",
      description:
        "True ONLY when the mediator has high confidence intervening will help — e.g. clearly off-topic, surfacing a tension, redirecting a stall, recapping a moment of alignment, or signalling consensus reached. False for routine on-topic contributions where letting participants continue is better.",
    },
    mediatorReply: {
      type: "string",
      description:
        "Short message from the mediator addressed to the room. Required and non-empty when shouldReply is true; should be an empty string when shouldReply is false.",
    },
    updatedSummaryMarkdown: {
      type: "string",
      description:
        "The complete updated live summary as Markdown. Rewrite each turn.",
    },
    consensusStatus: {
      type: "string",
      enum: ["PENDING", "STALLED", "REACHED"],
    },
    consensusPercent: {
      type: "integer",
      minimum: 0,
      maximum: 100,
    },
  },
} as const;

export type ConversationItem = {
  role: "system" | "user" | "mediator" | "research";
  username: string | null;
  text: string;
  filtered: boolean;
  seq: number;
};

export type CallMediatorArgs = {
  systemPrompt: string;
  turnPrompt: string;
  agenda: string;
  criteria: string;
  history: ConversationItem[];
  newMessage: { username: string; text: string } | null;
  participants?: { username: string; role: "admin" | "participant" }[];
};

export async function callMediator(args: CallMediatorArgs): Promise<MediatorOutput> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const transcript = args.history
    .filter((m) => !m.filtered)
    .map((m) => {
      if (m.role === "system") return `[system] ${m.text}`;
      if (m.role === "mediator") return `[mediator] ${m.text}`;
      if (m.role === "research") return `[research note] ${m.text}`;
      return `[${m.username ?? "participant"}] ${m.text}`;
    })
    .join("\n");

  const roster =
    args.participants && args.participants.length > 0
      ? args.participants
          .map(
            (p) =>
              `- ${p.username}${p.role === "admin" ? " (facilitator)" : ""}`,
          )
          .join("\n")
      : null;

  const userBlocks: string[] = [
    `AGENDA:\n${args.agenda}`,
    `EVALUATION CRITERIA:\n${args.criteria}`,
  ];
  if (roster) {
    userBlocks.push(
      `PARTICIPANTS PRESENT (${args.participants!.length}):\n${roster}\n\n` +
        `These are the ONLY people in this meeting. Agreement among them is the whole room — do not stall waiting for unseen voices.`,
    );
  }
  userBlocks.push(
    `TRANSCRIPT (ordered, filtered messages already removed):\n${transcript || "(no messages yet)"}`,
  );
  if (args.newMessage) {
    userBlocks.push(
      `NEW MESSAGE from ${args.newMessage.username}: ${args.newMessage.text}`,
    );
  } else {
    userBlocks.push("This is the kickoff turn — there is no new participant message.");
  }
  userBlocks.push(args.turnPrompt);

  const resp = await _client().chat.completions.create({
    model,
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: userBlocks.join("\n\n---\n\n") },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "MediatorOutput",
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
  });

  const raw = resp.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from OpenAI.");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error(`Mediator returned non-JSON: ${raw.slice(0, 200)}`);
  }
  const parsed = MediatorOutput.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(
      `Mediator output failed schema: ${parsed.error.message.slice(0, 200)}`,
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Post-meeting Q&A: composes a first-person answer from one participant's
// own messages. Same structured-output discipline as the mediator.
// ---------------------------------------------------------------------------

export const ParticipantAnswer = z.object({
  answer: z.string().min(1),
});
export type ParticipantAnswer = z.infer<typeof ParticipantAnswer>;

const PARTICIPANT_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: {
    answer: { type: "string" },
  },
} as const;

export type ParticipantMessage = { seq: number; text: string };

export async function answerAsParticipant(args: {
  systemPrompt: string;
  username: string;
  messages: ParticipantMessage[];
  question: string;
}): Promise<ParticipantAnswer> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const system = args.systemPrompt.replaceAll("{{username}}", args.username);
  const transcript =
    args.messages.length === 0
      ? "(no messages from this participant in this meeting)"
      : args.messages.map((m) => `[seq=${m.seq}] ${m.text}`).join("\n");
  const user =
    `PARTICIPANT MESSAGES (verbatim, in order):\n${transcript}\n\n` +
    `QUESTION FROM ANOTHER PARTICIPANT: ${args.question}`;

  const resp = await _client().chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ParticipantAnswer",
        strict: true,
        schema: PARTICIPANT_ANSWER_SCHEMA,
      },
    },
  });

  const raw = resp.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from OpenAI (answerAsParticipant).");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error(
      `answerAsParticipant returned non-JSON: ${raw.slice(0, 200)}`,
    );
  }
  const out = ParticipantAnswer.safeParse(parsedJson);
  if (!out.success) {
    throw new Error(
      `answerAsParticipant output failed schema: ${out.error.message.slice(0, 200)}`,
    );
  }
  return out.data;
}
