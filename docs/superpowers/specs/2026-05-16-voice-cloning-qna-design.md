# Voice Cloning + Post-Meeting Q&A — Design

Date: 2026-05-16
Status: Approved by user, ready for implementation plan
Project: Consensus (hackathon)

## Goal

After a meeting closes, any participant can ask a question about another participant's contributions and hear the answer synthesized in that participant's cloned voice. The clone is created from audio the participant already sent through the voice-input pipeline during the meeting — no separate enrollment step.

## Demo moment

`/room/[code]/end` shows the minutes (existing) plus a Q&A panel: pick a participant from a dropdown, type a question, get a short first-person answer rendered as text and auto-played in that participant's voice.

## Scope decisions (locked in)

| Dimension | Choice |
|---|---|
| When the clone is created | Mid-meeting, triggered the first time a user crosses ~20 s of cumulative speech (no enrollment step) |
| Audio storage | In-memory only on the server. Dropped immediately after the clone-create call. No filesystem or DB persistence of raw audio. |
| Cloning provider | ElevenLabs Instant Voice Cloning, direct API. (SLNG does not expose cloning endpoints; it's a model gateway with only preset-voice TTS.) |
| TTS playback at Q&A time | SLNG → ElevenLabs Unified API, using the `voice_id` from cloning. Direct ElevenLabs `/v1/text-to-speech` is the fallback if the SLNG route is unusable. |
| Answer fidelity | Grounded synthesis: OpenAI composes a short first-person answer based only on the participant's actual messages, with a "do not invent positions" guardrail. JSON-schema output, same discipline as the mediator. |
| Q&A UI placement | Single panel below the minutes on `/room/[code]/end`. No new page. |
| Consent | Notice-only + opt-out toggle in the room header. Default ON. Toggle writes to `Membership.voiceOptOut`. |

## Out of scope (YAGNI)

- Pre-meeting enrollment ("read this paragraph").
- Voice cloning that survives the room (cross-room reuse).
- Speaker-attributed playback of the minutes (option β from brainstorming).
- Replay-my-filtered-message (option γ).
- WebSocket streaming of TTS bytes — we use a single response.
- Caching synthesized audio between identical questions — each Q&A regenerates.
- Voice verification / liveness detection.

## Architecture

```
Browser mic ──► /api/room/[code]/voice ─┬─► transcribeAudio (SLNG STT, existing)
                                        └─► voiceClonePipeline.accumulate(userId, bytes)
                                              └─► when totalBytes ≥ ~80 KB (~20 s of Opus):
                                                    POST elevenlabs /v1/voices/add (direct)
                                                    ↓ voice_id
                                                    UPDATE Membership.voiceId
                                                    drop bytes from memory
                                                    broadcast { type: "voiceCloned", userId }

End screen Q&A panel ──► POST /api/room/[code]/ask
                          ├─► load aboutUserId's messages (filtered=false)
                          ├─► OpenAI grounded synthesis → { answer }
                          └─► TTS via SLNG-ElevenLabs (or direct ElevenLabs fallback)
                                ↓ audio bytes (audio/mpeg)
                          UI: render answer text + <audio autoplay>
```

## Data model

Single Prisma migration. Add to `Membership`:

```prisma
model Membership {
  // existing fields …
  voiceId       String?
  voiceOptOut   Boolean   @default(false)
  voiceBytes    Int       @default(0)
  voiceClonedAt DateTime?
}
```

Why `Membership`, not `User`:

- The clone is room-scoped. A user can opt out in one room and accept in another.
- A clone created in room A does not leak into room B.

No new tables, no new indexes (`(roomId, userId)` composite unique already covers our reads).

## New server modules

### `src/server/voiceClonePipeline.ts`

Owns the per-room, per-user audio accumulator and the threshold trigger.

```ts
const VOICE_CLONE_BYTE_THRESHOLD = 80 * 1024; // ~20 s Opus @ 32 kbps

type AccumState = { chunks: Uint8Array[]; totalBytes: number; cloning: boolean };
const buffers = new Map<string, AccumState>(); // key: `${roomId}:${userId}`

export async function accumulate(args: {
  roomId: string;
  userId: string;
  audio: Uint8Array;
  mime: string;
}): Promise<void>;
```

Behavior:

- Skip when `Membership.voiceOptOut === true` or `Membership.voiceId !== null`.
- Push the chunk, increment `totalBytes`, increment `Membership.voiceBytes`.
- When `totalBytes >= 80 KB` and `cloning === false`, set `cloning = true` and call `createCloneInBackground(...)` as a detached promise. The route does not await it.
- On success: update `Membership.voiceId` and `voiceClonedAt`, broadcast `{ type: "voiceCloned", userId }` over the room WS hub, delete the in-memory buffer.
- On failure: log, leave `voiceId` null, drop buffer (so we don't keep retrying with the same audio forever — user has to speak again to retry).

### `src/server/integrations/elevenlabs.ts`

```ts
export function elevenLabsIsConfigured(): boolean;

export async function createInstantVoiceClone(args: {
  name: string;
  audio: Uint8Array[];
  mime: string;
}): Promise<{ voiceId: string }>;
```

- Endpoint: `POST https://api.elevenlabs.io/v1/voices/add`
- Auth header: `xi-api-key: ${ELEVENLABS_API_KEY}`
- Multipart fields:
  - `name`: `Consensus · ${username} · ${roomCode}`
  - `files`: one `Blob` part per chunk
  - `description`: fixed string
  - `labels`: `JSON.stringify({ source: "consensus", room: roomCode })`
- Response parsed for `voice_id`.
- Stub mode: when `ELEVENLABS_API_KEY` is unset, log once and throw a typed `ElevenLabsNotConfiguredError`. Caller catches and skips cloning silently — meeting still functions, Q&A panel renders without audio for that user.

### `src/server/integrations/gradium.ts` (rewired)

Existing stub repurposed. New signature:

```ts
export async function synthesizeSpeech(args: {
  text: string;
  voiceId: string;
}): Promise<{ audio: Uint8Array; mime: string }>;
```

- Primary path: `POST ${SLNG_API_URL}/v1/tts/elevenlabs/<model>` with body `{ text, voice_id }`, returns audio bytes.
- Fallback path (env flag `TTS_FALLBACK_DIRECT_ELEVENLABS=1`): `POST https://api.elevenlabs.io/v1/text-to-speech/${voice_id}` with `xi-api-key`.
- Exact SLNG TTS endpoint path will be confirmed against `docs.slng.ai` during implementation.
- Stub: returns 204 no-audio when neither SLNG nor ElevenLabs is configured. UI shows answer text without audio.

## Modified routes

### `app/api/room/[code]/voice/route.ts`

Add one line after the existing `enqueueMessage` call:

```ts
void voiceClonePipeline.accumulate({ roomId: room.id, userId: user.id, audio: buf, mime });
```

Fire-and-forget. Route latency unchanged.

### `app/api/room/[code]/ask/route.ts` (new)

`POST /api/room/[code]/ask`

Auth: caller must be a `Membership` of the room; `room.status === "CLOSED"` required. Otherwise 403/409.

Body:

```ts
{ aboutUserId: string; question: string }
```

Response:

```ts
{
  answer: string;
  audioUrl: string | null;  // data:audio/mpeg;base64,… inline in the JSON
  voiceCloned: boolean;
}
```

Flow:

1. Load target user's `Message` rows in this room with `role === "user"` and `filtered === false`, ordered by `seq`.
2. If empty → return `{ answer: "${username} didn't contribute messages in this meeting.", audioUrl: null, voiceCloned: false }`.
3. OpenAI call with strict system prompt (see Prompts).
4. If target `Membership.voiceId` set and TTS adapter is configured, call `synthesizeSpeech`. Encode audio bytes as a `data:audio/mpeg;base64,…` URL inline in the JSON response (no temporary storage layer).
5. Return.

Audio delivery decision: data URL inline in the JSON keeps the implementation single-roundtrip and stateless. A 60-word answer in ElevenLabs TTS is typically <100 KB MP3 — fine for a JSON payload.

## Prompts

New file `prompts/qa.md`, loaded via existing `src/lib/prompts.ts`:

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

The user is asking the question through a Q&A panel after the meeting closed.
Speak in first person.
```

OpenAI input shape (existing `callMediator` not reused — new helper `answerAsParticipant` in `src/server/openai.ts`):

```
SYSTEM: <qa.md with {{username}} substituted>

USER:
PARTICIPANT MESSAGES (verbatim, in order):
[seq=4]: <message text>
[seq=7]: <message text>
…

QUESTION FROM ANOTHER PARTICIPANT: <question>
```

JSON Schema response: `{ answer: string }`. Zod validated.

## UI

### Room header (existing room page)

Third toggle next to "Voice on" / "Mediator on":

```
Voice cloning: [ ON ▽]   ⓘ Your voice may be used for post-meeting Q&A.
```

Calls a new server action `setVoiceOptOut(roomCode, optOut: boolean)` → updates `Membership.voiceOptOut`.

If toggled off after a clone already exists: the toggle reads "Cloning paused (clone exists)" and shows a small note. We do not delete the `voiceId` (out of scope).

### End screen Q&A panel (`app/room/[code]/end/page.tsx`)

Below the existing minutes block:

```
┌─ Ask about a participant ─────────────────────────────┐
│  About: [ Alice ▾ ]                                   │
│  Question: ┌───────────────────────────────────────┐  │
│            │ What did Alice think about pricing?   │  │
│            └───────────────────────────────────────┘  │
│  [ Ask ]                                              │
├───────────────────────────────────────────────────────┤
│  You: What did Alice think about pricing?             │
│  Alice (synthesized) 🔊 ▶                             │
│    "We should hold price at $99 through Q3…"          │
└───────────────────────────────────────────────────────┘
```

- Client component, local state only. No persistence of Q&A history (refresh clears).
- Participant dropdown shows all room members (not only those with a `voiceId`). Members without a clone get the text answer and no audio.
- On submit: POST to `/api/room/[code]/ask`, append to local history, autoplay the `audio` element if `audioUrl` present.

## Environment variables

Add to `.env.example`:

```
ELEVENLABS_API_KEY=
ELEVENLABS_API_URL=https://api.elevenlabs.io
TTS_FALLBACK_DIRECT_ELEVENLABS=
```

`SLNG_API_KEY` / `SLNG_API_URL` already present.

## Failure modes

| Failure | Behavior |
|---|---|
| `ELEVENLABS_API_KEY` not set | Cloning silently skipped; Q&A returns text-only answers; warning logged once per process |
| ElevenLabs clone-create returns non-2xx | Log error, drop buffer, leave `voiceId` null. User can speak more to retry (the next chunk re-enters the pipeline). |
| User opts out mid-meeting | Pipeline short-circuits on next chunk. Existing accumulated buffer is dropped. |
| User opts out *after* clone was created | We do not delete the clone (out of scope). Header shows "paused (clone exists)". |
| OpenAI Q&A call fails | Return 502 with `{ error: "Failed to generate answer." }`. UI shows the error in the panel. |
| TTS call fails | Return `{ answer, audioUrl: null, voiceCloned: false }`. UI shows text only. |
| Audio chunk arrives without membership | Pipeline early-returns. No surface error. |

## Privacy / consent stance

- Default ON, with visible notice + opt-out in the room header. This is **notice-only consent**, not affirmative opt-in. Acceptable for a hackathon demo; would need to be re-evaluated for production.
- Raw audio is never persisted to disk or DB; it lives in process memory only until the clone is created, then dropped.
- The ElevenLabs `voice_id` is room-scoped and stored on `Membership`. We do not surface a "delete my clone" flow (out of scope; user can opt out, which prevents future cloning).

## Implementation order (suggested for the plan)

1. Prisma migration: add fields on `Membership`.
2. `elevenlabs.ts` adapter with stub mode.
3. `voiceClonePipeline.ts` with in-memory accumulator and threshold logic.
4. Wire `accumulate(...)` into `app/api/room/[code]/voice/route.ts`.
5. Rewire `gradium.ts` to call SLNG-ElevenLabs TTS, with direct-ElevenLabs fallback.
6. `prompts/qa.md` + `answerAsParticipant` in `openai.ts`.
7. `app/api/room/[code]/ask/route.ts`.
8. Server action `setVoiceOptOut`.
9. Room header toggle UI.
10. End-screen Q&A panel.
11. Manual demo pass: two-participant meeting, both speak >20 s, close, ask cross-questions.

## Open questions deferred to implementation

- Exact SLNG ElevenLabs TTS endpoint path and request body (will check `docs.slng.ai` at implementation time; fallback to direct ElevenLabs is in place).
- Voice cloud broadcast event vs. polling on the end screen — likely a fresh `prisma.room.findUnique(...)` on page load is enough; no live update required because cloning happens during the meeting, not after close.
