# Voice Cloning + Post-Meeting Q&A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During meetings, accumulate each participant's voice in memory; create an ElevenLabs voice clone the first time they cross ~20 s of speech; on the meeting end-screen, let any participant ask a question about another participant and hear the answer synthesized in that participant's cloned voice.

**Architecture:** Reuses the existing `/api/room/[code]/voice` route as the audio-ingestion edge. Adds an in-memory accumulator (`src/server/voiceClonePipeline.ts`) that fires a fire-and-forget ElevenLabs clone-create call when a threshold is reached and writes the resulting `voice_id` onto `Membership`. A new `/api/room/[code]/ask` route does grounded synthesis via OpenAI, then TTS via SLNG's ElevenLabs route (with direct-ElevenLabs fallback). End-screen page gets a new Q&A panel; room header gets a voice-cloning opt-out toggle.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 7 + SQLite, OpenAI Chat (JSON Schema), ElevenLabs `/v1/voices/add`, SLNG `/v1/tts/elevenlabs/...` (fallback: direct ElevenLabs `/v1/text-to-speech/{voice_id}`), Vitest.

**Source spec:** `docs/superpowers/specs/2026-05-16-voice-cloning-qna-design.md`

**Hackathon pacing note:** The existing codebase does not unit-test thin HTTP wrappers (SLNG adapter, OpenAI client, route handlers). This plan follows that convention — TDD is applied to logic with real branching (threshold + opt-out gating, message retrieval), and skipped for adapters that are exercised through the dev server. Frequent commits remain non-negotiable.

---

## File map

**New files:**
- `consensus/src/server/voiceClonePipeline.ts` — per-room/per-user in-memory accumulator + ElevenLabs trigger
- `consensus/src/server/integrations/elevenlabs.ts` — `/v1/voices/add` adapter
- `consensus/app/api/room/[code]/ask/route.ts` — Q&A endpoint
- `consensus/prompts/qa.md` — first-person synthesis prompt
- `consensus/tests/voice-clone-pipeline.test.ts` — threshold/opt-out unit tests
- `consensus/tests/ask-route.test.ts` — Q&A retrieval shape (no LLM call; mocks `answerAsParticipant`)
- `consensus/prisma/migrations/<auto>_membership_voice_fields/migration.sql` — generated

**Modified files:**
- `consensus/prisma/schema.prisma` — add voice fields to `Membership`
- `consensus/src/server/integrations/gradium.ts` — rewire to call SLNG-ElevenLabs TTS, fallback to direct ElevenLabs
- `consensus/src/server/openai.ts` — add `answerAsParticipant`
- `consensus/app/api/room/[code]/voice/route.ts` — call `voiceClonePipeline.accumulate`
- `consensus/src/lib/room-actions.ts` — add `setVoiceCloneOptOutAction`
- `consensus/app/room/[code]/RoomClient.tsx` — third toggle: voice cloning opt-out
- `consensus/app/room/[code]/end/page.tsx` — Q&A panel below minutes
- `consensus/.env.example` — three new env vars

---

## Task 1: Prisma migration — add voice fields to `Membership`

**Files:**
- Modify: `consensus/prisma/schema.prisma:90-101`
- Create: `consensus/prisma/migrations/<auto>_membership_voice_fields/migration.sql` (generated)

- [ ] **Step 1: Edit the schema**

Replace the `Membership` model block at `schema.prisma:90-101` with:

```prisma
model Membership {
  id            String    @id @default(cuid())
  roomId        String
  userId        String
  role          String    @default("participant") // "admin" | "participant"
  joinedAt      DateTime  @default(now())
  voiceId       String?
  voiceOptOut   Boolean   @default(false)
  voiceBytes    Int       @default(0)
  voiceClonedAt DateTime?
  room          Room      @relation(fields: [roomId], references: [id], onDelete: Cascade)
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([roomId, userId])
  @@index([roomId])
}
```

- [ ] **Step 2: Generate + apply the migration**

Run from `consensus/`:
```
pnpm db:migrate
```

When prompted for a migration name, enter: `membership_voice_fields`. Expected: a new migration directory under `prisma/migrations/`, schema applied to `prisma/dev.db`, and the Prisma client regenerated.

- [ ] **Step 3: Verify the schema applied**

Run:
```
pnpm exec prisma db pull --print 2>/dev/null | grep -A2 "model Membership" || pnpm exec prisma format
```

Expected: the four new fields visible. (Alternative — open `pnpm db:studio` and check the `Membership` table.)

- [ ] **Step 4: Typecheck**

Run from `consensus/`:
```
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -v "tests/setup\|vitest.config\|signup-e2e\|tsconfig.server\|server.ts(19\|server.ts(20\|server.ts(21" || true
```

Expected: no new errors beyond the pre-existing ones. (Pre-existing errors in `server.ts`, `tests/setup.ts`, `tests/signup-e2e.test.ts`, and `vitest.config.ts` are unrelated and tracked separately.)

- [ ] **Step 5: Commit**

```
git add consensus/prisma/schema.prisma consensus/prisma/migrations
git commit -m "$(cat <<'EOF'
db: add voice clone fields to Membership

Adds voiceId, voiceOptOut, voiceBytes, voiceClonedAt — backs the
mid-meeting cloning pipeline and the post-meeting Q&A panel.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: ElevenLabs clone-create adapter

**Files:**
- Create: `consensus/src/server/integrations/elevenlabs.ts`
- Modify: `consensus/.env.example`

- [ ] **Step 1: Write the adapter**

Create `consensus/src/server/integrations/elevenlabs.ts`:

```ts
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

export async function createInstantVoiceClone(args: CloneArgs): Promise<CloneResult> {
  if (!elevenLabsIsConfigured()) {
    throw new ElevenLabsNotConfiguredError();
  }
  const baseUrl = process.env.ELEVENLABS_API_URL ?? "https://api.elevenlabs.io";
  const url = `${baseUrl}/v1/voices/add`;

  const form = new FormData();
  form.append("name", args.name);
  form.append(
    "description",
    args.description ?? "Auto-generated voice clone for Consensus post-meeting Q&A",
  );
  if (args.roomCode) {
    form.append("labels", JSON.stringify({ source: "consensus", room: args.roomCode }));
  }
  // One repeated `files` part per chunk — ElevenLabs concatenates server-side.
  for (let i = 0; i < args.audio.length; i++) {
    form.append(
      "files",
      new Blob([args.audio[i] as BlobPart], { type: args.mime || "audio/webm" }),
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
    throw new Error(`ElevenLabs voices/add ${res.status}: ${body.slice(0, 500)}`);
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
```

- [ ] **Step 2: Add env keys to `.env.example`**

Append to `consensus/.env.example`:

```
# ElevenLabs — Instant Voice Cloning for per-participant clones.
# Leave blank to disable cloning (Q&A still works, returns text only).
ELEVENLABS_API_KEY=
ELEVENLABS_API_URL=https://api.elevenlabs.io
# When set to 1, /api/room/[code]/ask synthesizes via direct ElevenLabs
# instead of SLNG's ElevenLabs unified route.
TTS_FALLBACK_DIRECT_ELEVENLABS=
```

- [ ] **Step 3: Typecheck**

Run:
```
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep elevenlabs
```

Expected: no output (file compiles cleanly).

- [ ] **Step 4: Commit**

```
git add consensus/src/server/integrations/elevenlabs.ts consensus/.env.example
git commit -m "$(cat <<'EOF'
feat: add ElevenLabs clone-create adapter

Direct /v1/voices/add call with stub-mode fallback when the API key
is absent. Adds ELEVENLABS_* envs to .env.example.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Voice-clone pipeline (in-memory accumulator + threshold)

**Files:**
- Create: `consensus/src/server/voiceClonePipeline.ts`
- Create: `consensus/tests/voice-clone-pipeline.test.ts`

This is the only piece with non-trivial branching (threshold, opt-out, single-shot per user). TDD it.

- [ ] **Step 1: Write failing tests**

Create `consensus/tests/voice-clone-pipeline.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// We mock the prisma client and the ElevenLabs adapter so the pipeline
// can be exercised purely in memory.
const updateMembership = vi.fn().mockResolvedValue({});
const findMembership = vi.fn();

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    membership: {
      findUnique: (...args: unknown[]) => findMembership(...args),
      update: (...args: unknown[]) => updateMembership(...args),
    },
    room: {
      findUnique: vi.fn().mockResolvedValue({ id: "r1", code: "AAA-BBBB" }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "u1", username: "alice" }),
    },
  },
}));

const createClone = vi.fn();
vi.mock("@/src/server/integrations/elevenlabs", () => ({
  createInstantVoiceClone: (...args: unknown[]) => createClone(...args),
  elevenLabsIsConfigured: () => true,
  ElevenLabsNotConfiguredError: class extends Error {},
}));

vi.mock("@/src/server/wsHub", () => ({
  broadcast: vi.fn(),
}));

import { accumulate, __resetForTests, VOICE_CLONE_BYTE_THRESHOLD } from "@/src/server/voiceClonePipeline";

beforeEach(() => {
  __resetForTests();
  findMembership.mockReset();
  updateMembership.mockReset().mockResolvedValue({});
  createClone.mockReset().mockResolvedValue({ voiceId: "vx_123" });
});

describe("voiceClonePipeline.accumulate", () => {
  it("does nothing when membership has opted out", async () => {
    findMembership.mockResolvedValue({ id: "m1", voiceOptOut: true, voiceId: null });
    await accumulate({
      roomId: "r1",
      userId: "u1",
      audio: new Uint8Array(VOICE_CLONE_BYTE_THRESHOLD + 1),
      mime: "audio/webm",
    });
    expect(createClone).not.toHaveBeenCalled();
    expect(updateMembership).not.toHaveBeenCalled();
  });

  it("does nothing when voiceId is already set", async () => {
    findMembership.mockResolvedValue({ id: "m1", voiceOptOut: false, voiceId: "vx_existing" });
    await accumulate({
      roomId: "r1",
      userId: "u1",
      audio: new Uint8Array(VOICE_CLONE_BYTE_THRESHOLD + 1),
      mime: "audio/webm",
    });
    expect(createClone).not.toHaveBeenCalled();
  });

  it("does not fire clone until threshold crossed", async () => {
    findMembership.mockResolvedValue({ id: "m1", voiceOptOut: false, voiceId: null });
    await accumulate({
      roomId: "r1",
      userId: "u1",
      audio: new Uint8Array(1000),
      mime: "audio/webm",
    });
    // tick microtasks
    await Promise.resolve();
    expect(createClone).not.toHaveBeenCalled();
  });

  it("fires clone exactly once when threshold is crossed across two chunks", async () => {
    findMembership.mockResolvedValue({ id: "m1", voiceOptOut: false, voiceId: null });
    const half = Math.ceil(VOICE_CLONE_BYTE_THRESHOLD / 2) + 100;
    await accumulate({
      roomId: "r1",
      userId: "u1",
      audio: new Uint8Array(half),
      mime: "audio/webm",
    });
    await accumulate({
      roomId: "r1",
      userId: "u1",
      audio: new Uint8Array(half),
      mime: "audio/webm",
    });
    // Allow the detached background promise to settle.
    await new Promise((r) => setTimeout(r, 10));
    expect(createClone).toHaveBeenCalledTimes(1);
    expect(updateMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ voiceId: "vx_123" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run from `consensus/`:
```
pnpm exec vitest run tests/voice-clone-pipeline.test.ts
```

Expected: FAIL — `Cannot find module '@/src/server/voiceClonePipeline'` (module doesn't exist yet).

- [ ] **Step 3: Implement the pipeline**

Create `consensus/src/server/voiceClonePipeline.ts`:

```ts
/**
 * Per-room, per-user audio accumulator for ElevenLabs voice cloning.
 *
 * Why in-memory: the spec keeps raw biometric audio out of disk and DB
 * for the hackathon. Buffers are dropped immediately after the clone is
 * created or on any terminal failure.
 *
 * Threshold: 80 KB ≈ 20 s of Opus at 32 kbps. Avoids decoding audio on
 * the server.
 */

import { prisma } from "@/src/lib/prisma";
import { broadcast } from "./wsHub";
import {
  createInstantVoiceClone,
  ElevenLabsNotConfiguredError,
  elevenLabsIsConfigured,
} from "./integrations/elevenlabs";

export const VOICE_CLONE_BYTE_THRESHOLD = 80 * 1024;

type AccumState = { chunks: Uint8Array[]; totalBytes: number; cloning: boolean };
const buffers = new Map<string, AccumState>();
const stubWarned = new Set<string>();

function keyOf(roomId: string, userId: string): string {
  return `${roomId}:${userId}`;
}

export function __resetForTests(): void {
  buffers.clear();
  stubWarned.clear();
}

export async function accumulate(args: {
  roomId: string;
  userId: string;
  audio: Uint8Array;
  mime: string;
}): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { roomId_userId: { roomId: args.roomId, userId: args.userId } },
    select: { id: true, voiceOptOut: true, voiceId: true },
  });
  if (!membership) return;
  if (membership.voiceOptOut) return;
  if (membership.voiceId) return;

  // Increment the persisted byte counter (cheap, useful for debugging).
  await prisma.membership.update({
    where: { id: membership.id },
    data: { voiceBytes: { increment: args.audio.byteLength } },
  });

  const key = keyOf(args.roomId, args.userId);
  const s = buffers.get(key) ?? { chunks: [], totalBytes: 0, cloning: false };
  s.chunks.push(args.audio);
  s.totalBytes += args.audio.byteLength;
  buffers.set(key, s);

  if (s.cloning) return;
  if (s.totalBytes < VOICE_CLONE_BYTE_THRESHOLD) return;

  if (!elevenLabsIsConfigured()) {
    if (!stubWarned.has(key)) {
      console.warn(
        "[voiceClonePipeline] ELEVENLABS_API_KEY not set — skipping clone for",
        key,
      );
      stubWarned.add(key);
    }
    buffers.delete(key);
    return;
  }

  s.cloning = true;
  void createCloneInBackground(args.roomId, args.userId, args.mime).finally(() => {
    buffers.delete(key);
  });
}

async function createCloneInBackground(
  roomId: string,
  userId: string,
  mime: string,
): Promise<void> {
  const key = keyOf(roomId, userId);
  const s = buffers.get(key);
  if (!s) return;

  const [room, user] = await Promise.all([
    prisma.room.findUnique({ where: { id: roomId }, select: { id: true, code: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true } }),
  ]);
  if (!room || !user) return;

  try {
    const { voiceId } = await createInstantVoiceClone({
      name: `Consensus · ${user.username} · ${room.code}`,
      audio: s.chunks,
      mime,
      roomCode: room.code,
    });
    await prisma.membership.update({
      where: { roomId_userId: { roomId, userId } },
      data: { voiceId, voiceClonedAt: new Date() },
    });
    broadcast(roomId, { type: "voiceCloned", userId, voiceId });
  } catch (err) {
    if (err instanceof ElevenLabsNotConfiguredError) {
      console.warn("[voiceClonePipeline]", err.message);
      return;
    }
    console.error("[voiceClonePipeline] clone failed for", key, err);
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:
```
pnpm exec vitest run tests/voice-clone-pipeline.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```
git add consensus/src/server/voiceClonePipeline.ts consensus/tests/voice-clone-pipeline.test.ts
git commit -m "$(cat <<'EOF'
feat: add voice-clone pipeline with byte-threshold trigger

In-memory per-room/per-user accumulator that fires the ElevenLabs
clone-create call once a user crosses ~20s (80KB Opus) of speech.
Opt-out and existing-clone short-circuits prevent duplicate work.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire accumulator into voice route

**Files:**
- Modify: `consensus/app/api/room/[code]/voice/route.ts:79`

- [ ] **Step 1: Edit the voice route**

In `consensus/app/api/room/[code]/voice/route.ts`, add the import near the existing imports (after the `enqueueMessage` import):

```ts
import { accumulate as accumulateVoiceClone } from "@/src/server/pipeline";
```

Wait — that's the wrong module. Use:

```ts
import { accumulate as accumulateVoiceClone } from "@/src/server/voiceClonePipeline";
```

Then, just after the existing `await enqueueMessage(...)` line (currently `await enqueueMessage({ roomId: room.id, userId: user.id, text });`), append:

```ts
// Fire-and-forget: accumulate raw audio for voice cloning. Skipped per-user
// when opted-out or already cloned; see src/server/voiceClonePipeline.ts.
void accumulateVoiceClone({
  roomId: room.id,
  userId: user.id,
  audio: buf,
  mime,
}).catch((err) => console.error("[voice] clone accumulator failed", err));
```

- [ ] **Step 2: Typecheck**

Run:
```
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -E "voice/route|voiceClonePipeline"
```

Expected: no output.

- [ ] **Step 3: Smoke-test the dev server doesn't regress**

Run:
```
pnpm dev
```

Hit the existing room, send one voice message via the UI. Expected log lines (with `ELEVENLABS_API_KEY` unset): the usual SLNG STT 200 path, no errors from the accumulator. With the key set, the byte counter on `Membership.voiceBytes` should increment in `pnpm db:studio`.

Stop the dev server (`Ctrl-C`) once verified.

- [ ] **Step 4: Commit**

```
git add consensus/app/api/room/[code]/voice/route.ts
git commit -m "$(cat <<'EOF'
feat: feed voice uploads into the clone accumulator

One-line wiring: after STT enqueue, hand the same buffer to
voiceClonePipeline.accumulate as a detached promise. No latency
impact on the STT path.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Rewire Gradium TTS adapter to call SLNG → ElevenLabs

**Files:**
- Modify: `consensus/src/server/integrations/gradium.ts` (entire file rewrite)

- [ ] **Step 1: Replace the file contents**

Overwrite `consensus/src/server/integrations/gradium.ts` with:

```ts
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
 *                  configured — UI renders answer text without audio.
 */

const SLNG_TTS_PATH = "/v1/tts/elevenlabs/eleven_turbo_v2_5";

export type SynthesizeArgs = { text: string; voiceId: string };
export type SynthesizeResult = { audio: Uint8Array; mime: string } | null;

export function gradiumIsConfigured(): boolean {
  return Boolean(process.env.SLNG_API_KEY) || Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function synthesizeSpeech(args: SynthesizeArgs): Promise<SynthesizeResult> {
  const forceDirect = process.env.TTS_FALLBACK_DIRECT_ELEVENLABS === "1";

  if (!forceDirect && process.env.SLNG_API_KEY) {
    try {
      return await viaSlng(args);
    } catch (err) {
      console.warn("[tts] SLNG path failed, trying direct ElevenLabs:", err);
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
  return { audio, mime: res.headers.get("content-type") ?? "audio/mpeg" };
}

async function viaElevenLabsDirect(args: SynthesizeArgs): Promise<SynthesizeResult> {
  const base = process.env.ELEVENLABS_API_URL ?? "https://api.elevenlabs.io";
  const res = await fetch(`${base}/v1/text-to-speech/${encodeURIComponent(args.voiceId)}`, {
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
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS ${res.status}: ${msg.slice(0, 500)}`);
  }
  const audio = new Uint8Array(await res.arrayBuffer());
  return { audio, mime: res.headers.get("content-type") ?? "audio/mpeg" };
}
```

- [ ] **Step 2: Find existing callers of `synthesizeSpeech` and update their call shape if needed**

Run:
```
grep -rn "synthesizeSpeech\|gradiumIsConfigured" consensus/app consensus/src 2>/dev/null
```

Inspect each hit. Pre-existing callers may pass a single `text` argument (the mediator TTS route from the original stub). Update each call site to also pass `voiceId` — for any pre-existing mediator-voice usage (e.g., `app/api/room/[code]/tts/route.ts`), use a fixed `process.env.MEDIATOR_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM"` (ElevenLabs' default "Rachel" voice) as a placeholder. If that route currently 502s in stub mode, leaving it unchanged is acceptable for this task — Task 7 is the real consumer.

- [ ] **Step 3: Typecheck**

Run:
```
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep gradium
```

Expected: no output.

- [ ] **Step 4: Commit**

```
git add consensus/src/server/integrations/gradium.ts consensus/app
git commit -m "$(cat <<'EOF'
feat: TTS via SLNG/ElevenLabs with direct fallback

Rewires gradium adapter to call SLNG's ElevenLabs unified route with
a per-utterance voice_id, falling back to direct ElevenLabs when SLNG
fails or TTS_FALLBACK_DIRECT_ELEVENLABS=1. Returns null in stub mode
so callers can render text-only answers.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Q&A prompt + `answerAsParticipant` OpenAI helper

**Files:**
- Create: `consensus/prompts/qa.md`
- Modify: `consensus/src/server/openai.ts` (append `answerAsParticipant` + supporting types)

- [ ] **Step 1: Write the prompt**

Create `consensus/prompts/qa.md`:

```markdown
You are speaking AS the participant {{username}}, drawing only from messages
they actually sent in this meeting.

Rules:
- You may paraphrase, summarize, or combine their messages.
- You may NOT introduce facts, opinions, positions, or details that are not
  supported by their messages.
- If their messages do not address the question, say so plainly in first
  person: "I didn't speak about that in this meeting."
- Keep your answer under 60 words.
- Respond in plain prose. No markdown, no quotes around your own words.

Speak in first person.
```

- [ ] **Step 2: Add the OpenAI helper**

Append to `consensus/src/server/openai.ts`:

```ts
import { z as _z } from "zod"; // (reuse existing import; do not duplicate — delete this line if z is already in scope)

export const ParticipantAnswer = z.object({
  answer: z.string().min(1),
});
export type ParticipantAnswer = z.infer<typeof ParticipantAnswer>;

const PARTICIPANT_ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: {
    answer: { type: "string" },
  },
} as const;

export type ParticipantMessage = { seq: number; text: string };

export async function answerAsParticipant(args: {
  systemPrompt: string;
  username: string;
  messages: ParticipantMessage[];
  question: string;
}): Promise<ParticipantAnswer> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const system = args.systemPrompt.replaceAll("{{username}}", args.username);
  const transcript =
    args.messages.length === 0
      ? "(no messages from this participant in this meeting)"
      : args.messages.map((m) => `[seq=${m.seq}] ${m.text}`).join("\n");
  const user =
    `PARTICIPANT MESSAGES (verbatim, in order):\n${transcript}\n\n` +
    `QUESTION FROM ANOTHER PARTICIPANT: ${args.question}`;

  const resp = await _client().chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ParticipantAnswer",
        strict: true,
        schema: PARTICIPANT_ANSWER_SCHEMA,
      },
    },
  });

  const raw = resp.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from OpenAI (answerAsParticipant).");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`answerAsParticipant returned non-JSON: ${raw.slice(0, 200)}`);
  }
  const out = ParticipantAnswer.safeParse(parsed);
  if (!out.success) {
    throw new Error(
      `answerAsParticipant output failed schema: ${out.error.message.slice(0, 200)}`,
    );
  }
  return out.data;
}
```

If the `_z` import is duplicate (i.e., `z` is already imported at the top of `openai.ts`), delete the duplicate import line. Refer to the existing imports at `consensus/src/server/openai.ts:1-2`.

- [ ] **Step 3: Typecheck**

Run:
```
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep openai
```

Expected: no output.

- [ ] **Step 4: Commit**

```
git add consensus/prompts/qa.md consensus/src/server/openai.ts
git commit -m "$(cat <<'EOF'
feat: grounded Q&A synthesis helper

Adds prompts/qa.md and answerAsParticipant() — same JSON-schema
structured-output discipline as the mediator. Strict "speak only from
this participant's actual messages" guardrail to keep clones honest.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Q&A route `/api/room/[code]/ask`

**Files:**
- Create: `consensus/app/api/room/[code]/ask/route.ts`
- Create: `consensus/tests/ask-route.test.ts`

- [ ] **Step 1: Write a failing retrieval test**

Create `consensus/tests/ask-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findRoom = vi.fn();
const findMembership = vi.fn();
const findTargetUser = vi.fn();
const findTargetMembership = vi.fn();
const findMessages = vi.fn();

vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    room: { findUnique: (...a: unknown[]) => findRoom(...a) },
    membership: {
      findUnique: vi.fn((args: { where: { roomId_userId: { userId: string } } }) => {
        if (args.where.roomId_userId.userId === "target") return findTargetMembership();
        return findMembership();
      }),
    },
    user: { findUnique: (...a: unknown[]) => findTargetUser(...a) },
    message: { findMany: (...a: unknown[]) => findMessages(...a) },
  },
}));

vi.mock("@/src/lib/session", () => ({
  getSessionUser: vi.fn().mockResolvedValue({ id: "asker", username: "carol" }),
}));

const answerStub = vi.fn();
vi.mock("@/src/server/openai", () => ({
  answerAsParticipant: (...a: unknown[]) => answerStub(...a),
}));

vi.mock("@/src/lib/prompts", () => ({
  loadPrompt: vi.fn().mockResolvedValue("PROMPT {{username}}"),
}));

const synth = vi.fn();
vi.mock("@/src/server/integrations/gradium", () => ({
  synthesizeSpeech: (...a: unknown[]) => synth(...a),
  gradiumIsConfigured: () => true,
}));

import { POST } from "@/app/api/room/[code]/ask/route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/room/AAA/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  findRoom.mockReset();
  findMembership.mockReset();
  findTargetMembership.mockReset();
  findTargetUser.mockReset();
  findMessages.mockReset();
  answerStub.mockReset();
  synth.mockReset();
});

describe("POST /api/room/[code]/ask", () => {
  it("returns the empty-contribution answer with no LLM/TTS calls when target has no messages", async () => {
    findRoom.mockResolvedValue({ id: "r1", code: "AAA", status: "CLOSED" });
    findMembership.mockResolvedValue({ id: "m_caller" });
    findTargetMembership.mockResolvedValue({ voiceId: null });
    findTargetUser.mockResolvedValue({ id: "target", username: "alice" });
    findMessages.mockResolvedValue([]);

    const res = await POST(makeReq({ aboutUserId: "target", question: "anything?" }), {
      params: Promise.resolve({ code: "AAA" }),
    });
    const json = await res.json();
    expect(json.audioUrl).toBeNull();
    expect(json.answer).toMatch(/didn't contribute/i);
    expect(answerStub).not.toHaveBeenCalled();
    expect(synth).not.toHaveBeenCalled();
  });

  it("rejects when the room isn't closed", async () => {
    findRoom.mockResolvedValue({ id: "r1", code: "AAA", status: "OPEN" });
    findMembership.mockResolvedValue({ id: "m_caller" });
    const res = await POST(makeReq({ aboutUserId: "target", question: "?" }), {
      params: Promise.resolve({ code: "AAA" }),
    });
    expect(res.status).toBe(409);
  });

  it("calls answerAsParticipant and TTS, returns a data URL", async () => {
    findRoom.mockResolvedValue({ id: "r1", code: "AAA", status: "CLOSED" });
    findMembership.mockResolvedValue({ id: "m_caller" });
    findTargetMembership.mockResolvedValue({ voiceId: "vx_a" });
    findTargetUser.mockResolvedValue({ id: "target", username: "alice" });
    findMessages.mockResolvedValue([{ seq: 4, text: "hold at $99" }]);
    answerStub.mockResolvedValue({ answer: "I said $99." });
    synth.mockResolvedValue({ audio: new Uint8Array([1, 2, 3]), mime: "audio/mpeg" });

    const res = await POST(makeReq({ aboutUserId: "target", question: "pricing?" }), {
      params: Promise.resolve({ code: "AAA" }),
    });
    const json = await res.json();
    expect(json.answer).toBe("I said $99.");
    expect(json.voiceCloned).toBe(true);
    expect(json.audioUrl).toMatch(/^data:audio\/mpeg;base64,/);
  });
});
```

- [ ] **Step 2: Run and verify the test fails (route doesn't exist)**

Run:
```
pnpm exec vitest run tests/ask-route.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/room/[code]/ask/route'`.

- [ ] **Step 3: Implement the route**

Create `consensus/app/api/room/[code]/ask/route.ts`:

```ts
/**
 * POST /api/room/[code]/ask
 *
 * Post-meeting Q&A. Composes a first-person answer from the target
 * participant's actual messages, then synthesizes audio in their cloned
 * voice (if one was created during the meeting).
 *
 * Body:  { aboutUserId: string, question: string }
 * Reply: { answer: string, audioUrl: string | null, voiceCloned: boolean }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getSessionUser } from "@/src/lib/session";
import { loadPrompt } from "@/src/lib/prompts";
import { answerAsParticipant } from "@/src/server/openai";
import { synthesizeSpeech, gradiumIsConfigured } from "@/src/server/integrations/gradium";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let body: { aboutUserId?: unknown; question?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const aboutUserId = typeof body.aboutUserId === "string" ? body.aboutUserId : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!aboutUserId || !question) {
    return NextResponse.json(
      { error: "aboutUserId and question are required" },
      { status: 400 },
    );
  }

  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return new NextResponse("Not found", { status: 404 });
  if (room.status !== "CLOSED") {
    return NextResponse.json(
      { error: "Q&A is only available after the room is closed." },
      { status: 409 },
    );
  }

  const callerMembership = await prisma.membership.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
  });
  if (!callerMembership) return new NextResponse("Forbidden", { status: 403 });

  const targetMembership = await prisma.membership.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: aboutUserId } },
    select: { voiceId: true },
  });
  const targetUser = await prisma.user.findUnique({
    where: { id: aboutUserId },
    select: { id: true, username: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "Target participant not found." }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { roomId: room.id, userId: aboutUserId, role: "user", filtered: false },
    orderBy: { seq: "asc" },
    select: { seq: true, text: true },
  });

  if (messages.length === 0) {
    return NextResponse.json({
      answer: `${targetUser.username} didn't contribute messages in this meeting.`,
      audioUrl: null,
      voiceCloned: false,
    });
  }

  const systemPrompt = await loadPrompt("qa");

  let answer: string;
  try {
    const out = await answerAsParticipant({
      systemPrompt,
      username: targetUser.username,
      messages,
      question,
    });
    answer = out.answer;
  } catch (err) {
    console.error("[ask] answer synthesis failed", err);
    return NextResponse.json(
      { error: "Failed to generate answer." },
      { status: 502 },
    );
  }

  let audioUrl: string | null = null;
  if (targetMembership?.voiceId && gradiumIsConfigured()) {
    try {
      const synth = await synthesizeSpeech({ text: answer, voiceId: targetMembership.voiceId });
      if (synth) {
        const b64 = Buffer.from(synth.audio).toString("base64");
        audioUrl = `data:${synth.mime};base64,${b64}`;
      }
    } catch (err) {
      console.warn("[ask] TTS failed; returning text-only", err);
    }
  }

  return NextResponse.json({
    answer,
    audioUrl,
    voiceCloned: Boolean(targetMembership?.voiceId),
  });
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:
```
pnpm exec vitest run tests/ask-route.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```
git add consensus/app/api/room/[code]/ask/route.ts consensus/tests/ask-route.test.ts
git commit -m "$(cat <<'EOF'
feat: /api/room/[code]/ask endpoint

Loads target user's filtered=false messages, calls grounded synthesis,
and (when a clone exists) inlines a data:audio/mpeg URL. Refuses to
answer until the room is CLOSED.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `setVoiceCloneOptOutAction` server action

**Files:**
- Modify: `consensus/src/lib/room-actions.ts` (append a new exported action)

- [ ] **Step 1: Append the server action**

Add to the bottom of `consensus/src/lib/room-actions.ts`:

```ts
"use server";

// (If the file already has a top-level "use server" directive, omit the line above.)

export async function setVoiceCloneOptOutAction(
  code: string,
  optOut: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const room = await prisma.room.findUnique({ where: { code } });
  if (!room) return { ok: false, error: "Room not found." };
  const membership = await prisma.membership.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: user.id } },
  });
  if (!membership) return { ok: false, error: "Not a member of this room." };
  await prisma.membership.update({
    where: { id: membership.id },
    data: { voiceOptOut: optOut },
  });
  return { ok: true };
}
```

Note: this assumes `getSessionUser` and `prisma` are already imported at the top of `room-actions.ts`. If not, add the imports (`import { prisma } from "./prisma";` and `import { getSessionUser } from "./session";`). The leading `"use server"` directive is at the file-top already in the existing actions; do not duplicate it.

- [ ] **Step 2: Typecheck**

Run:
```
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep room-actions
```

Expected: no output.

- [ ] **Step 3: Commit**

```
git add consensus/src/lib/room-actions.ts
git commit -m "$(cat <<'EOF'
feat: setVoiceCloneOptOutAction server action

Updates Membership.voiceOptOut. The accumulator short-circuits on the
flag so a flip takes effect on the next voice upload.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Room header voice-cloning toggle

**Files:**
- Modify: `consensus/app/room/[code]/RoomClient.tsx` (near the existing Voice/Mediator toggles around lines 285-315)
- Modify: `consensus/app/room/[code]/page.tsx` (pass `voiceOptOut` from server to the client)

- [ ] **Step 1: Surface `voiceOptOut` from the page**

Open `consensus/app/room/[code]/page.tsx` and find where the page loads the user's membership for the room. Add `voiceOptOut: true` and `voiceClonedAt: true` to the membership `select`. Pass both as props into `<RoomClient ... voiceOptOut={...} voiceCloned={Boolean(...voiceClonedAt)} />`.

If the existing select doesn't exist (i.e., the page passes the whole membership), no change is needed beyond verifying the props arrive.

- [ ] **Step 2: Add the toggle in `RoomClient.tsx`**

In `consensus/app/room/[code]/RoomClient.tsx`, extend the `Props` type to include:

```ts
voiceOptOut: boolean;
voiceCloned: boolean;
```

Add a `useState` for the local optimistic value:

```ts
const [voiceCloneOff, setVoiceCloneOff] = useState(props.voiceOptOut);
const [voiceClonePending, startVoiceCloneTransition] = useTransition();
```

(Ensure `useTransition` is imported from `react` — it likely already is for other toggles.)

Add the handler:

```ts
async function toggleVoiceClone() {
  const next = !voiceCloneOff;
  setVoiceCloneOff(next);
  startVoiceCloneTransition(async () => {
    const res = await setVoiceCloneOptOutAction(props.code, next);
    if (!res.ok) {
      console.error(res.error);
      setVoiceCloneOff(!next);
    }
  });
}
```

Import the action:

```ts
import { setVoiceCloneOptOutAction } from "@/src/lib/room-actions";
```

Find the existing two-toggle block near line 290-311 (`Voice on` / `Mediator on`). Add a third button after the mediator toggle, styled the same way:

```tsx
<button
  className="item"
  onClick={toggleVoiceClone}
  disabled={voiceClonePending}
  title="Your voice may be used for post-meeting Q&A."
>
  {props.voiceCloned
    ? voiceCloneOff
      ? "Cloning paused (clone exists)"
      : "Voice cloning on"
    : voiceCloneOff
      ? "Voice cloning off"
      : "Voice cloning on"}
</button>
```

- [ ] **Step 3: Smoke-test in the browser**

Run `pnpm dev`, open a room. Verify:
- The third toggle is visible next to "Voice on" and "Mediator on".
- Clicking it flips the label.
- In `pnpm db:studio`, `Membership.voiceOptOut` reflects the latest click for the signed-in user.

Stop the dev server.

- [ ] **Step 4: Commit**

```
git add consensus/app/room/[code]/page.tsx consensus/app/room/[code]/RoomClient.tsx
git commit -m "$(cat <<'EOF'
feat: voice-cloning opt-out toggle in room header

Third toggle next to Voice/Mediator. Default ON. Label switches to
"Cloning paused (clone exists)" once a clone has been minted, so users
know flipping off doesn't delete the existing voice_id.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: End-screen Q&A panel

**Files:**
- Modify: `consensus/app/room/[code]/end/page.tsx` (extend the existing minutes page)
- Create: `consensus/app/room/[code]/end/QAPanel.tsx` (client component for the panel)

- [ ] **Step 1: Build the client panel**

Create `consensus/app/room/[code]/end/QAPanel.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";

type Participant = { id: string; username: string };
type Turn =
  | { kind: "asked"; question: string; about: Participant; at: number }
  | { kind: "answered"; about: Participant; answer: string; audioUrl: string | null; at: number };

export function QAPanel({
  code,
  participants,
}: {
  code: string;
  participants: Participant[];
}) {
  const [aboutId, setAboutId] = useState<string>(participants[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const target = participants.find((p) => p.id === aboutId);
    if (!target || !question.trim()) return;
    const now = Date.now();
    setTurns((t) => [...t, { kind: "asked", question, about: target, at: now }]);
    setPending(true);
    try {
      const res = await fetch(`/api/room/${encodeURIComponent(code)}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aboutUserId: target.id, question }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const json = (await res.json()) as {
        answer: string;
        audioUrl: string | null;
        voiceCloned: boolean;
      };
      setTurns((t) => [
        ...t,
        { kind: "answered", about: target, answer: json.answer, audioUrl: json.audioUrl, at: Date.now() },
      ]);
      setQuestion("");
      if (json.audioUrl && audioRef.current) {
        audioRef.current.src = json.audioUrl;
        void audioRef.current.play();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 24 }}>
      <h2>Ask the room</h2>
      <p style={{ opacity: 0.7, marginTop: -4 }}>
        Type a question about another participant. Answers are grounded in their
        actual messages and read aloud in their cloned voice when one exists.
      </p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <label>
          About:{" "}
          <select
            value={aboutId}
            onChange={(e) => setAboutId(e.target.value)}
            disabled={pending}
          >
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.username}
              </option>
            ))}
          </select>
        </label>
        <textarea
          rows={3}
          placeholder="What did Alice think about pricing?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={pending}
        />
        <button type="submit" className="btn" disabled={pending || !question.trim()}>
          {pending ? "Asking…" : "Ask"}
        </button>
        {error && <div role="alert" style={{ color: "var(--rust, crimson)" }}>{error}</div>}
      </form>

      <ul style={{ listStyle: "none", padding: 0, marginTop: 16, display: "grid", gap: 12 }}>
        {turns.map((t) =>
          t.kind === "asked" ? (
            <li key={`q-${t.at}`}>
              <strong>You</strong> asked about <strong>{t.about.username}</strong>: {t.question}
            </li>
          ) : (
            <li key={`a-${t.at}`}>
              <strong>{t.about.username}</strong> (synthesized): {t.answer}
              {t.audioUrl && (
                <div>
                  <audio controls src={t.audioUrl} />
                </div>
              )}
            </li>
          ),
        )}
      </ul>
      <audio ref={audioRef} hidden />
    </section>
  );
}
```

- [ ] **Step 2: Wire it into the end page**

Open `consensus/app/room/[code]/end/page.tsx`. Find the section that renders the minutes. Just above the closing return / wrapping element, load the list of participants and render the panel.

Add inside the page's server function (before `return`):

```ts
const memberships = await prisma.membership.findMany({
  where: { roomId: room.id },
  include: { user: { select: { id: true, username: true } } },
});
const participants = memberships
  .map((m) => m.user)
  .filter((u): u is { id: string; username: string } => !!u);
```

Below the existing minutes rendering, add:

```tsx
<QAPanel code={room.code} participants={participants} />
```

Import the component at the top:

```ts
import { QAPanel } from "./QAPanel";
```

If `prisma` is not yet imported in the page, add `import { prisma } from "@/src/lib/prisma";`.

- [ ] **Step 3: Smoke-test in the browser**

Run `pnpm dev`. With at least one closed room in the DB:
1. Navigate to `/room/<code>/end`.
2. Confirm the Q&A panel renders below the minutes.
3. Select a participant, type "what did you say?", click Ask.
4. Expected: text answer appears. If the participant has a `voiceId`, the inline `<audio>` appears and autoplays.

Stop the dev server.

- [ ] **Step 4: Commit**

```
git add consensus/app/room/[code]/end/page.tsx consensus/app/room/[code]/end/QAPanel.tsx
git commit -m "$(cat <<'EOF'
feat: end-screen Q&A panel

Single-page panel below the minutes — pick a participant, ask a
question, get a grounded text answer + autoplayed audio in their
cloned voice. Local state only; no Q&A history persistence.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: End-to-end demo pass

**Files:**
- (no code changes)

- [ ] **Step 1: Configure env**

In `consensus/.env.local`, set:
```
OPENAI_API_KEY=<real>
SLNG_API_KEY=<real>
ELEVENLABS_API_KEY=<real>
```
Leave `TTS_FALLBACK_DIRECT_ELEVENLABS` unset (use SLNG TTS).

- [ ] **Step 2: Run the full demo**

1. `pnpm dev`
2. Sign up two users in two browsers (or one Chrome incognito).
3. User A creates a room with agenda "Q3 pricing plan" and a real evaluation criterion.
4. User B joins via the code.
5. Both users speak for at least ~25 s each (cumulative; doesn't need to be continuous).
6. Watch the server log for `[voiceClonePipeline]` activity. Confirm each `Membership.voiceId` is populated in `pnpm db:studio` after the threshold is crossed.
7. User A closes the room.
8. Both users navigate to `/room/<code>/end`.
9. User A asks "What did <UserB> think about Q3?". Expected: a grounded text answer + autoplay audio in User B's voice.
10. User B asks the symmetric question about User A. Expected: same.

- [ ] **Step 3: Failure-mode spot-checks**

- Set `voiceOptOut = true` for User A's `Membership` (via the toggle in the room header before they speak). Confirm `voiceId` stays null even after >20 s of speech.
- Unset `ELEVENLABS_API_KEY`, restart `pnpm dev`. Confirm:
  - Voice uploads still succeed (STT works, message is enqueued).
  - Log: `[voiceClonePipeline] ELEVENLABS_API_KEY not set — skipping clone for …`
  - Q&A returns `audioUrl: null` and the UI shows text only.

- [ ] **Step 4: Final commit (release note)**

If you've made any incidental fixups while testing, batch them into one commit:

```
git add -p
git commit -m "$(cat <<'EOF'
chore: demo-pass fixups

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

If no fixups, skip this step.

---

## Self-review checklist (don't write to a file — just confirm)

- [ ] All sections of the spec map to a task:
  - Architecture diagram → covered across Tasks 2–7 + 10.
  - Data model → Task 1.
  - `voiceClonePipeline.ts` → Task 3.
  - `elevenlabs.ts` → Task 2.
  - `gradium.ts` rewrite → Task 5.
  - Voice route wiring → Task 4.
  - `/api/room/[code]/ask` → Task 7.
  - `prompts/qa.md` + `answerAsParticipant` → Task 6.
  - `.env.example` additions → Task 2.
  - Room-header opt-out toggle → Tasks 8 + 9.
  - End-screen Q&A panel → Task 10.
  - Failure modes covered by stub-mode branches (Tasks 2, 5, 7) + Task 11 spot-checks.
- [ ] No placeholders — every code block is complete.
- [ ] Naming consistent: `voiceClonePipeline.accumulate`, `createInstantVoiceClone`, `synthesizeSpeech({ text, voiceId })`, `answerAsParticipant({ systemPrompt, username, messages, question })`, `setVoiceCloneOptOutAction(code, optOut)` — same identifiers everywhere.
