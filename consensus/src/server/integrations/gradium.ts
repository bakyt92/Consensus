/**
 * TTS adapter — Gradium slot, now backed by SLNG's ElevenLabs unified route.
 *
 * Primary path:    POST {SLNG_API_URL}/v1/tts/elevenlabs/eleven_turbo_v2_5
 *                  body { text, voice_id, output_format }
 *                  Authorization: Bearer ${SLNG_API_KEY}
 *
 * Fallback path:   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
 *                  header xi-api-key: ${ELEVENLABS_API_KEY}
 *                  body { text, model_id: "eleven_turbo_v2_5" }
 *                  Used when TTS_FALLBACK_DIRECT_ELEVENLABS=1 or when SLNG
 *                  returns a non-2xx.
 *
 * Stub mode:       Returns null when neither SLNG nor ElevenLabs are
 *                  configured — UI renders text without audio.
 */

const SLNG_TTS_PATH = "/v1/tts/elevenlabs/eleven_turbo_v2_5";

export type SynthesizeArgs = { text: string; voiceId: string };
export type SynthesizeResult = { audio: Uint8Array; mime: string } | null;

export function gradiumIsConfigured(): boolean {
  return (
    Boolean(process.env.SLNG_API_KEY) ||
    Boolean(process.env.ELEVENLABS_API_KEY)
  );
}

export async function synthesizeSpeech(
  args: SynthesizeArgs,
): Promise<SynthesizeResult> {
  const forceDirect = process.env.TTS_FALLBACK_DIRECT_ELEVENLABS === "1";

  if (!forceDirect && process.env.SLNG_API_KEY) {
    try {
      return await viaSlng(args);
    } catch (err) {
      console.warn(
        "[tts] SLNG path failed, trying direct ElevenLabs:",
        err,
      );
    }
  }

  if (process.env.ELEVENLABS_API_KEY) {
    return await viaElevenLabsDirect(args);
  }

  console.warn("[tts] no provider configured — returning null audio");
  return null;
}

async function viaSlng(args: SynthesizeArgs): Promise<SynthesizeResult> {
  const base = process.env.SLNG_API_URL ?? "https://api.slng.ai";
  const res = await fetch(`${base}${SLNG_TTS_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLNG_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: args.text,
      voice_id: args.voiceId,
      output_format: "mp3_44100_128",
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`SLNG TTS ${res.status}: ${msg.slice(0, 500)}`);
  }
  const audio = new Uint8Array(await res.arrayBuffer());
  return {
    audio,
    mime: res.headers.get("content-type") ?? "audio/mpeg",
  };
}

async function viaElevenLabsDirect(
  args: SynthesizeArgs,
): Promise<SynthesizeResult> {
  const base =
    process.env.ELEVENLABS_API_URL ?? "https://api.elevenlabs.io";
  const res = await fetch(
    `${base}/v1/text-to-speech/${encodeURIComponent(args.voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: args.text,
        model_id: "eleven_turbo_v2_5",
      }),
    },
  );
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS ${res.status}: ${msg.slice(0, 500)}`);
  }
  const audio = new Uint8Array(await res.arrayBuffer());
  return {
    audio,
    mime: res.headers.get("content-type") ?? "audio/mpeg",
  };
}
