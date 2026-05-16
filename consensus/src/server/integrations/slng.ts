/**
 * SLNG adapter — input side.
 *
 * Production role: multi-party audio room (LiveKit plugin) + real-time STT
 * with speaker diarization. For v1 we only expose the batch-transcribe shape:
 * a browser MediaRecorder blob comes in, a transcript comes out. Once we plug
 * the real SDK we'll extend this with `joinRoom` / `streamTranscripts`.
 *
 * Stub mode: when SLNG_API_KEY is unset, transcribeAudio returns a placeholder
 * string so the end-to-end mic → pipeline → broadcast loop is exercisable
 * without sponsor credentials.
 */

export type TranscribeArgs = {
  audio: Uint8Array;
  mime: string;
  userId: string;
  roomId: string;
  language?: string;
};

export type TranscribeResult = {
  text: string;
  isFinal: true;
  durationMs?: number;
  stubbed: boolean;
};

export function slngIsConfigured(): boolean {
  return Boolean(process.env.SLNG_API_KEY);
}

export async function transcribeAudio(
  args: TranscribeArgs,
): Promise<TranscribeResult> {
  if (!slngIsConfigured()) {
    const kb = (args.audio.byteLength / 1024).toFixed(1);
    console.warn(
      "[slng] stub mode — set SLNG_API_KEY to enable real diarized STT",
    );
    return {
      text: `[stub voice transcript · ${kb} KB ${args.mime}]`,
      isFinal: true,
      stubbed: true,
    };
  }

  const baseUrl = process.env.SLNG_API_URL ?? "https://api.slng.ai";
  // Per docs.slng.ai: Deepgram Nova-3, no /slng/ prefix, field `audio`,
  // `language` is required.
  const endpoint = `${baseUrl}/v1/stt/deepgram/nova:3`;

  const form = new FormData();
  form.append(
    "audio",
    new Blob([args.audio as BlobPart], { type: args.mime || "audio/webm" }),
    "audio.webm",
  );
  form.append("language", args.language ?? "en");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SLNG_API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`SLNG STT ${res.status}: ${msg.slice(0, 2000)}`);
  }
  const json = (await res.json().catch(() => ({}))) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string }>;
      }>;
    };
  };
  const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (typeof text !== "string") {
    throw new Error(
      `SLNG STT unexpected response shape: ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return {
    text,
    isFinal: true,
    stubbed: false,
  };
}
