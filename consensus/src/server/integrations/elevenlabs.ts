/**
 * ElevenLabs adapter — Instant Voice Cloning.
 *
 * SLNG does not expose voice cloning; only preset-voice TTS. We hit
 * ElevenLabs directly for /v1/voices/add and let SLNG's ElevenLabs TTS
 * route consume the resulting voice_id for playback.
 *
 * Stub mode: when ELEVENLABS_API_KEY is unset we throw a typed error
 * so callers can skip cloning silently without polluting the happy path.
 */

export class ElevenLabsNotConfiguredError extends Error {
  constructor() {
    super("ELEVENLABS_API_KEY not set — skipping voice cloning.");
    this.name = "ElevenLabsNotConfiguredError";
  }
}

export type CloneArgs = {
  name: string;
  audio: Uint8Array[];
  mime: string;
  description?: string;
  roomCode?: string;
};

export type CloneResult = { voiceId: string };

export function elevenLabsIsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function createInstantVoiceClone(
  args: CloneArgs,
): Promise<CloneResult> {
  if (!elevenLabsIsConfigured()) {
    throw new ElevenLabsNotConfiguredError();
  }
  const baseUrl = process.env.ELEVENLABS_API_URL ?? "https://api.elevenlabs.io";
  const url = `${baseUrl}/v1/voices/add`;

  const form = new FormData();
  form.append("name", args.name);
  form.append(
    "description",
    args.description ??
      "Auto-generated voice clone for Consensus post-meeting Q&A",
  );
  if (args.roomCode) {
    form.append(
      "labels",
      JSON.stringify({ source: "consensus", room: args.roomCode }),
    );
  }
  // One repeated `files` part per chunk — ElevenLabs concatenates server-side.
  for (let i = 0; i < args.audio.length; i++) {
    form.append(
      "files",
      new Blob([args.audio[i] as BlobPart], {
        type: args.mime || "audio/webm",
      }),
      `chunk-${i}.webm`,
    );
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `ElevenLabs voices/add ${res.status}: ${body.slice(0, 500)}`,
    );
  }
  const json = (await res.json().catch(() => ({}))) as {
    voice_id?: string;
    requires_verification?: boolean;
  };
  if (typeof json.voice_id !== "string") {
    throw new Error(
      `ElevenLabs voices/add returned no voice_id: ${JSON.stringify(json).slice(0, 200)}`,
    );
  }
  return { voiceId: json.voice_id };
}
