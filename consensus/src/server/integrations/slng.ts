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

  // Real SDK goes here. Expected shape per discussion with SLNG:
  //   POST {SLNG_API_URL}/transcribe with multipart audio + speaker hints,
  //   returns { transcript, segments: [{ speakerId, start, end, text }] }.
  // For multi-speaker meetings we'd pass roomId so SLNG can match its own
  // diarized speaker IDs back to our participants.
  throw new Error(
    "SLNG real integration not yet wired. Drop the SDK call here and remove this throw.",
  );
}
