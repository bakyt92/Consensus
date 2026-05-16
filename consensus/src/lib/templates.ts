// Meeting-template catalog. Single source of truth used by:
//   • the /create form (template picker cards)
//   • the room page (right-pane visualization + label histogram)
//   • the GLiNER classifier (label set sent to the model)
//   • zod validation in room-actions
//
// Labels match `designs/project/templates.jsx` so what the model classifies
// is what the user sees in the inspector + chat chips.

export type TemplateKey =
  | "none"
  | "debate"
  | "brainstorm"
  | "standup"
  | "retro"
  | "negotiation";

export type TemplateDef = {
  key: TemplateKey;
  name: string;
  icon: string;
  tagline: string;
  helpText: string;
  // Non-sentiment GLiNER labels. The classifier always also receives the three
  // sentiment labels (positive/negative/neutral) appended by gliner.ts.
  labels: readonly string[];
};

export const TEMPLATES: Readonly<Record<TemplateKey, TemplateDef>> = {
  none: {
    key: "none",
    name: "Plain",
    icon: "·",
    tagline: "Free-form discussion with the standard mediator. No labels.",
    helpText: "Back-compat default. No classification, no template-specific summary shape.",
    labels: [],
  },
  debate: {
    key: "debate",
    name: "Debate",
    icon: "D",
    tagline: "Argue both sides of one proposition until one outlasts the other.",
    helpText: "Best for: should-we-or-shouldn't-we calls. Two columns, one ledger.",
    labels: ["pro", "con", "question", "clarification", "synthesis"],
  },
  brainstorm: {
    key: "brainstorm",
    name: "Brainstorm",
    icon: "B",
    tagline: "Surface ideas, then let the room build on the strongest ones.",
    helpText: "Best for: opening up a problem space. Ideas that get built on rise to the top.",
    labels: ["idea", "build-on", "critique", "question", "synthesis"],
  },
  standup: {
    key: "standup",
    name: "Stand-up",
    icon: "S",
    tagline: "A round-the-room status check. Yesterday, today, blockers — in that order.",
    helpText: "Best for: daily syncs. Unanswered asks-for-help stay highlighted until cleared.",
    labels: ["yesterday", "today", "blocker", "help-needed", "synthesis"],
  },
  retro: {
    key: "retro",
    name: "Retrospective",
    icon: "R",
    tagline: "What went well, what went poorly, and what we'll do about it.",
    helpText: "Best for: end-of-sprint reviews. Action items get owners. Kudos get said.",
    labels: ["went-well", "went-poorly", "action-item", "kudos", "synthesis"],
  },
  negotiation: {
    key: "negotiation",
    name: "Negotiation",
    icon: "N",
    tagline: "Get parties from stated positions to common ground.",
    helpText: "Best for: policy decisions, conflict resolution. One column per party; convergence strip at the foot.",
    labels: ["position", "objection", "concession", "question", "common-ground", "synthesis"],
  },
};

export const TEMPLATE_ORDER: readonly TemplateKey[] = [
  "debate",
  "brainstorm",
  "standup",
  "retro",
  "negotiation",
];

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export function isTemplateKey(value: unknown): value is TemplateKey {
  return typeof value === "string" && value in TEMPLATES;
}

export function getTemplate(key: string | null | undefined): TemplateDef {
  return key && isTemplateKey(key) ? TEMPLATES[key] : TEMPLATES.none;
}
