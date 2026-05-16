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
  mediatorReply: z.string().min(1),
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
    mediatorReply: {
      type: "string",
      description: "Short message from the mediator addressed to the room.",
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
  role: "system" | "user" | "mediator";
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
};

export async function callMediator(args: CallMediatorArgs): Promise<MediatorOutput> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const transcript = args.history
    .filter((m) => !m.filtered)
    .map((m) => {
      if (m.role === "system") return `[system] ${m.text}`;
      if (m.role === "mediator") return `[mediator] ${m.text}`;
      return `[${m.username ?? "participant"}] ${m.text}`;
    })
    .join("\n");

  const userBlocks: string[] = [
    `AGENDA:\n${args.agenda}`,
    `EVALUATION CRITERIA:\n${args.criteria}`,
    `TRANSCRIPT (ordered, filtered messages already removed):\n${transcript || "(no messages yet)"}`,
  ];
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
