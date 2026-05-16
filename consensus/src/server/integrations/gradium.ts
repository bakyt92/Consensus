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
  format?: "mp3" | "wav";
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

  // Real SDK goes here. Expected shape:
  //   POST {GRADIUM_API_URL}/tts with { text, voice, format } and either
  //   stream the response or read the full body. For low-latency demos we'll
  //   want to flip this to a streaming response and pipe straight to the
  //   browser <audio> via fetch().body.
  void args;
  throw new Error(
    "Gradium real integration not yet wired. Drop the SDK call here and remove this throw.",
  );
}
