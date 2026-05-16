/**
 * GLiNER adapter — per-message label + sentiment classifier.
 *
 * Production role: runs after Pioneer's on-topic gate, before the OpenAI
 * mediator. Returns the message's template-specific label (e.g. "pro" /
 * "con" / "synthesis") and a sentiment tag. Fail-soft: pipeline must
 * continue even if this fails or times out.
 *
 * Stub mode (PIONEER_API_KEY unset, or GLINER_STUB=1): returns the first
 * provided label and neutral sentiment so the UI is still exercisable.
 *
 * Pioneer hosts the model at the existing /v1/chat/completions endpoint
 * with model="fastino/gliner2-large-v1". Auth via the same PIONEER_API_KEY
 * already used by the on-topic classifier — no new env var needed.
 */

import { trimForGliner } from "../../lib/token-trim.ts";

const ENDPOINT =
  process.env.PIONEER_API_URL?.replace(/\/+$/, "") ?? "https://api.pioneer.ai";
const MODEL = "fastino/gliner2-large-v1";
const TIMEOUT_MS = 5_000;
const CATEGORY_THRESHOLD = 0.5;

const SENTIMENT_LABELS = ["positive", "negative", "neutral"] as const;
export type Sentiment = (typeof SENTIMENT_LABELS)[number];

export type ClassifyInput = {
  text: string;
  labels: readonly string[];
};

export type ClassifySpan = {
  label: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
};

export type ClassifyResult = {
  category: string | null;
  categoryConfidence: number | null;
  sentiment: Sentiment;
  sentimentConfidence: number | null;
  spans: ClassifySpan[];
  stubbed: boolean;
};

export function glinerIsConfigured(): boolean {
  return Boolean(process.env.PIONEER_API_KEY) && process.env.GLINER_STUB !== "1";
}

export async function classify(input: ClassifyInput): Promise<ClassifyResult> {
  if (!glinerIsConfigured()) {
    return stubResult(input.labels);
  }

  const text = trimForGliner(input.text);
  const entities = [...input.labels, ...SENTIMENT_LABELS];

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PIONEER_API_KEY}`,
      },
      signal: ac.signal,
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: text }],
        schema: { entities },
        include_confidence: true,
        include_spans: true,
      }),
    });
    if (!res.ok) {
      console.warn(`[gliner] HTTP ${res.status} ${res.statusText}`);
      return stubResult(input.labels, /*as fallback*/ true);
    }
    const body = (await res.json()) as PioneerEnvelope;
    return parsePioneerResponse(body, input.labels);
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      console.warn("[gliner] request timed out after", TIMEOUT_MS, "ms");
    } else {
      console.warn("[gliner] request failed", err);
    }
    return stubResult(input.labels, /*as fallback*/ true);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- internals ----------

type PioneerEnvelope = {
  choices?: Array<{
    message?: { content?: string };
  }>;
};

type ParsedEntities = {
  entities?: Record<string, Array<{ text?: string; confidence?: number; start?: number; end?: number }>>;
};

export function parsePioneerResponse(
  body: PioneerEnvelope,
  labels: readonly string[],
): ClassifyResult {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return stubResult(labels, true);
  }
  let parsed: ParsedEntities;
  try {
    parsed = JSON.parse(content) as ParsedEntities;
  } catch {
    return stubResult(labels, true);
  }
  const entitiesMap = parsed?.entities ?? {};

  // Collect best (max-confidence) span per label.
  const best: Record<string, { confidence: number; span: ClassifySpan }> = {};
  for (const [label, spans] of Object.entries(entitiesMap)) {
    if (!Array.isArray(spans)) continue;
    for (const s of spans) {
      const confidence = typeof s?.confidence === "number" ? s.confidence : 0;
      const span: ClassifySpan = {
        label,
        text: typeof s?.text === "string" ? s.text : "",
        start: typeof s?.start === "number" ? s.start : -1,
        end: typeof s?.end === "number" ? s.end : -1,
        confidence,
      };
      if (!best[label] || best[label].confidence < confidence) {
        best[label] = { confidence, span };
      }
    }
  }

  // Category = highest-confidence non-sentiment label above threshold. Ties
  // broken by the order labels were sent (first wins) to keep results stable.
  let category: string | null = null;
  let categoryConfidence: number | null = null;
  for (const label of labels) {
    const hit = best[label];
    if (!hit || hit.confidence < CATEGORY_THRESHOLD) continue;
    if (categoryConfidence === null || hit.confidence > categoryConfidence) {
      category = label;
      categoryConfidence = hit.confidence;
    }
  }

  // Sentiment = highest-confidence sentiment label, default neutral.
  let sentiment: Sentiment = "neutral";
  let sentimentConfidence: number | null = null;
  for (const s of SENTIMENT_LABELS) {
    const hit = best[s];
    if (!hit) continue;
    if (sentimentConfidence === null || hit.confidence > sentimentConfidence) {
      sentiment = s;
      sentimentConfidence = hit.confidence;
    }
  }

  // Persist all non-sentiment spans; useful for UI surfacing (e.g. retro
  // action-item owner extraction).
  const spans: ClassifySpan[] = [];
  for (const [label, hit] of Object.entries(best)) {
    if ((SENTIMENT_LABELS as readonly string[]).includes(label)) continue;
    spans.push(hit.span);
  }

  return {
    category,
    categoryConfidence,
    sentiment,
    sentimentConfidence,
    spans,
    stubbed: false,
  };
}

function stubResult(labels: readonly string[], _fromFallback = false): ClassifyResult {
  // Both stub mode and "real-call-failed" fallback land here. We mark
  // stubbed=true in both: it tells downstream code "no real confidence
  // available; don't draw confidence-weighted UI from this result".
  const fallback = process.env.GLINER_STUB_LABEL;
  const category =
    (fallback && labels.includes(fallback) ? fallback : labels[0]) ?? null;
  return {
    category,
    categoryConfidence: null,
    sentiment: "neutral",
    sentimentConfidence: null,
    spans: [],
    stubbed: true,
  };
}
