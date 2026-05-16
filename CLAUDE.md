# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Greenfield. No code committed yet. This file documents the planned architecture so the first implementation aligns with the design decisions already made. Update commands and structure sections as soon as real code lands; remove this notice once the scaffold exists.

## What this is

**Consensus** — an AI-mediated meeting platform. An organizer sets an agenda and a resolution rule per item (`ALL_AGREE`, `SIMPLE_MAJORITY`, or `ORGANIZER_DECIDES`). Participants join via browser with their own mic stream. A GPT-4o "manager" agent listens to the conversation, tracks each participant's stated position per agenda item, intervenes when discussion stalls or someone hasn't spoken, fact-checks disputed claims, and announces when a resolution criterion is met.

Built for the Paris hackathon using sponsor APIs (see Tech stack).

## Tech stack (load-bearing choices)

| Layer | Provider | Role |
|---|---|---|
| Realtime audio transport | **SLNG** | Multi-party WebRTC-style rooms; browser ↔ backend audio. |
| STT, per speaker | **Gradium** | One streaming transcription per participant mic. Diarization comes for free from channel separation — do **not** mix audio. |
| TTS (AI voice into the room) | **Gradium** | Streaming synthesis piped back through SLNG. |
| Agent reasoning | **OpenAI GPT-4o** | Intervention decisions, consensus evaluation, agenda transitions, post-meeting summary. |
| Position classifier | **Pioneer / Fastino** | Small model that maps each utterance → `{yes, no, unclear}` per active agenda item. Runs on every utterance; keeps GPT-4o off the hot path. |
| Mid-meeting fact lookup | **Tavily** | Exposed to the agent as a function-call tool, not a background process. |

**Do not use OpenAI Realtime API for the manager voice.** It assumes a single mixed audio stream, which breaks per-speaker attribution. Keep STT, reasoning, and TTS as separate components.

## Architecture rules

These are the design decisions that aren't obvious from reading any single file. Honor them unless explicitly changing direction:

1. **Event-driven agent, not polling.** GPT-4o is invoked on triggers: `on_silence(Ns)`, `on_position_change`, `on_agenda_timeout`, `on_factual_dispute`. A slow heartbeat (~30s) exists only as a safety net. Do not introduce a 5–15s polling loop — it was explicitly rejected for cost and latency reasons.
2. **Two-tier inference.** Fastino classifier runs on every utterance (cheap, fast). GPT-4o only runs on triggers (smart, slower). This is the central cost/latency lever — preserve the split.
3. **State store is the single source of truth.** Transcript, positions per participant per item, agenda progress, who-spoke-when all live in one store. The agent is a pure function of that state. Don't smuggle state into prompts or sockets.
4. **Turn-taking gate on AI speech.** The agent may only speak during a silence window (≥~1.5s). A controller — not the LLM — decides "is the floor open." Never let the model talk over a participant.
5. **Per-speaker mic streams end-to-end.** Each participant has their own SLNG track and their own Gradium STT session. Speaker identity is a property of the channel, not something to infer.
6. **Tavily is a tool, not a feed.** Only call it when the agent decides a factual dispute exists. Surface results to the room only when the agent chooses to cite them.

## Planned layout (target, not yet built)

```
frontend/   Next.js — organizer agenda UI, participant room, live position sidebar
backend/    FastAPI — REST for rooms/agenda, WS bridge to SLNG
  agent/        GPT-4o orchestrator, triggers, tool definitions, prompts
  speech/       Gradium STT/TTS adapters
  classifiers/  Fastino position classifier
  state/        In-memory + Redis (for reconnect) state store
```

When you create this scaffold, update this file with the actual commands (install, dev server, tests, single-test invocation) and remove the "Project status" notice.

## Commands

_None yet — no package manifest exists. Add `npm`/`uv`/`pnpm` commands here once the scaffold is in place._
