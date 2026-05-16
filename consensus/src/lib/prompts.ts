import { readFile } from "node:fs/promises";
import path from "node:path";

const cache = new Map<string, string>();

export async function loadPrompt(name: "system" | "kickoff" | "turn"): Promise<string> {
  if (cache.has(name) && process.env.NODE_ENV === "production") {
    return cache.get(name)!;
  }
  const p = path.resolve(process.cwd(), "prompts", `${name}.md`);
  const text = await readFile(p, "utf8");
  cache.set(name, text);
  return text;
}
