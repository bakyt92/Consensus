/**
 * TTS adapter — Gradium slot.
 *
 * SLNG ElevenLabs is WS-only per the published catalog, so the HTTP path is
 * Orpheus first (emotion-aware) and Deepgram Aura 2 as a fallback. Direct
 * ElevenLabs stays as a final escape hatch when ELEVENLABS_API_KEY is set or
 * TTS_FALLBACK_DIRECT_ELEVENLABS=1.
 *
 *   1. POST {SLNG_API_URL}/v1/tts/canopylabs/orpheus
 *        Authorization: Bearer ${SLNG_API_KEY}
 *        body { text, voice }                     -> audio/mpeg
 *
 *   2. POST {SLNG_API_URL}/v1/tts/deepgram/aura:2
 *        Authorization: Bearer ${SLNG_API_KEY}
 *        body { text, voice: "asteria-en" }       -> audio/mpeg
 *
 *   3. POST {ELEVENLABS_API_URL}/v1/text-to-speech/{voice_id}
 *        header xi-api-key: ${ELEVENLABS_API_KEY}
 *        body { text, model_id: "eleven_turbo_v2_5" } -> audio/mpeg
 *
 * Stub mode: returns null when no provider is configured — UI plays nothing.
 */

const SLNG_ORPHEUS_PATH = "/v1/tts/slng/canopylabs/orpheus:en";
const SLNG_AURA_PATHS = ["/v1/tts/deepgram/aura:2", "/v1/tts/deepgram/aura-2"];

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
      return await viaSlngOrpheus(args);
    } catch (err) {
      console.warn("[tts] SLNG Orpheus failed, trying Aura 2:", err);
    }
    try {
      return await viaSlngAura(args);
    } catch (err) {
      console.warn(
        "[tts] SLNG Aura 2 failed, trying direct ElevenLabs:",
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

async function viaSlngOrpheus(args: SynthesizeArgs): Promise<SynthesizeResult> {
  const base = process.env.SLNG_API_URL ?? "https://api.slng.ai";
  const voice =
    args.voiceId || process.env.TTS_VOICE_ORPHEUS || "tara";
  // Orpheus expects { prompt, voice } — note 'prompt' not 'text'.
  const res = await fetch(`${base}${SLNG_ORPHEUS_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SLNG_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "audio/*",
    },
    body: JSON.stringify({ prompt: args.text, voice }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`SLNG Orpheus ${res.status}: ${msg.slice(0, 500)}`);
  }
  const audio = new Uint8Array(await res.arrayBuffer());
  return { audio, mime: res.headers.get("content-type") ?? "audio/mpeg" };
}

async function viaSlngAura(args: SynthesizeArgs): Promise<SynthesizeResult> {
  const base = process.env.SLNG_API_URL ?? "https://api.slng.ai";
  // Aura expects { text, model } — voice is selected via the model name.
  const model = process.env.TTS_VOICE_AURA || "aura-2-thalia-en";
  // Deepgram's own naming uses hyphens; SLNG mostly uses colons. If one 404s
  // we try the other before giving up.
  let lastErr: unknown = null;
  for (const path of SLNG_AURA_PATHS) {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SLNG_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text: args.text, model }),
    });
    if (res.ok) {
      const audio = new Uint8Array(await res.arrayBuffer());
      return { audio, mime: res.headers.get("content-type") ?? "audio/mpeg" };
    }
    const msg = await res.text().catch(() => "");
    lastErr = new Error(`SLNG Aura ${res.status} at ${path}: ${msg.slice(0, 300)}`);
    if (res.status !== 404) break;
  }
  throw lastErr ?? new Error("SLNG Aura: no path matched");
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
