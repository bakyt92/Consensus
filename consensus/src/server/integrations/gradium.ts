/**
 * Gradium adapter — output side.
 *
 * Production role: streaming TTS for the mediator's voice during the meeting.
 * v1 exposes a single batch synth call returning the full audio buffer; we
 * can swap to a streamed ReadableStream once the route supports it.
 *
 * Stub mode: when GRADIUM_API_KEY is unset, returns null and the playback
 * route responds 204 No Content. The browser hook treats 204 as a no-op so
 * the mediator simply doesn't speak — but everything else works.
 */

export type SynthesizeArgs = {
  text: string;
  voice?: string;
  format?: "wav" | "mp3";
};

export type SynthesizeResult = {
  audio: Uint8Array;
  mime: string;
};

export function gradiumIsConfigured(): boolean {
  return Boolean(process.env.GRADIUM_API_KEY);
}

export async function synthesizeSpeech(
  args: SynthesizeArgs,
): Promise<SynthesizeResult | null> {
  if (!gradiumIsConfigured()) {
    console.warn(
      "[gradium] stub mode — set GRADIUM_API_KEY to enable mediator TTS",
    );
    return null;
  }

  const baseUrl = process.env.GRADIUM_API_URL ?? "https://api.gradium.ai";
  const voiceId =
    args.voice ?? process.env.GRADIUM_VOICE_ID ?? "YTpq7expH9539ERJ";

  const res = await fetch(`${baseUrl}/api/post/speech/tts`, {
    method: "POST",
    headers: {
      "x-api-key": process.env.GRADIUM_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: args.text,
      voice_id: voiceId,
      output_format: "wav",
      only_audio: true,
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Gradium ${res.status}: ${msg.slice(0, 2000)}`);
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  return { audio: buf, mime: "audio/wav" };
}
