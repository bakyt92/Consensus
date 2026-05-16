/**
 * Tavily adapter — web search grounded for the in-meeting research chip.
 *
 * Production role: when a participant clicks 🔎 on their message, the
 * server calls /search with the message text and posts the result back
 * to the room as a `research` message. Tavily returns a synthesized
 * `answer` plus the top results we use as citations.
 *
 * Stub mode: when TAVILY_API_KEY is unset we throw TavilyNotConfiguredError
 * so the caller can return a friendly error to the UI without poisoning
 * the message timeline.
 */

export class TavilyNotConfiguredError extends Error {
  constructor() {
    super("TAVILY_API_KEY not set — research disabled.");
    this.name = "TavilyNotConfiguredError";
  }
}

export type WebSearchArgs = {
  query: string;
  maxResults?: number;
};

export type WebSearchSource = {
  title: string;
  url: string;
  content?: string;
};

export type WebSearchResult = {
  answer: string;
  sources: WebSearchSource[];
};

export function tavilyIsConfigured(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export async function webSearch(args: WebSearchArgs): Promise<WebSearchResult> {
  if (!tavilyIsConfigured()) {
    throw new TavilyNotConfiguredError();
  }
  const base = process.env.TAVILY_API_URL ?? "https://api.tavily.com";
  const res = await fetch(`${base}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Tavily accepts the key as a header (newer) or in the body. Both for safety.
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query: args.query,
      search_depth: "basic",
      include_answer: true,
      max_results: args.maxResults ?? 5,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json().catch(() => ({}))) as {
    answer?: string;
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const answer = typeof json.answer === "string" ? json.answer.trim() : "";
  const sources: WebSearchSource[] = (json.results ?? [])
    .filter(
      (r): r is { title?: string; url: string; content?: string } =>
        typeof r?.url === "string",
    )
    .map((r) => ({
      title: r.title?.trim() || hostnameOf(r.url),
      url: r.url,
      content: r.content,
    }));
  if (!answer && sources.length === 0) {
    throw new Error("Tavily returned no answer or sources.");
  }
  return { answer: answer || "(no synthesised answer; see sources)", sources };
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
