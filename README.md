# Consensus

**CHECKOUT:** https://consensus.rk9-vp9.online/room/DMZ-WBQS

An AI-mediated meeting platform. A facilitator sets an agenda and evaluation
criteria; participants join via a room code and chat text-first. An
OpenAI-driven mediator keeps a live Markdown summary of the discussion and
decides when the criteria have been satisfied ("consensus reached"). Once the
room closes, every participant gets immutable Markdown minutes.

Built for the Paris hackathon.

## What's in the room

- **Text + voice chat.** Participants type or speak; SLNG diarizes the audio,
  Gradium reads the mediator's replies out loud, ElevenLabs clones each
  participant's voice from their captured audio for the post-meeting Q&A.
- **Live mediator.** Every user message triggers one OpenAI turn that may
  reply, may stay silent, and always updates the summary + a consensus
  percentage tied to the facilitator's criteria.
- **Meeting templates.** Debate, brainstorm, standup, retro, negotiation.
  Each template defines a label set; a Pioneer-hosted GLiNER classifier
  tags every user message with one of those labels plus sentiment, and the
  results show up as message badges and a per-participant histogram.
- **Post-meeting Q&A.** After the meeting closes, the end-screen lets you
  ask follow-up questions answered (and voiced) in the cloned voices of
  the people who actually spoke.

## Stack

Next.js 16 (App Router, React 19, Tailwind 4) · Node 22 with TS-strip ·
Prisma 7 + SQLite (better-sqlite3) · Custom Next + ws.Server entrypoint ·
OpenAI structured output · Pioneer GLiNER · SLNG · Gradium · ElevenLabs ·
Resend (magic-link auth).

The source of truth for product decisions is [`consensus.md`](./consensus.md);
architectural rules and the directory map live in [`CLAUDE.md`](./CLAUDE.md).

## Running locally

```bash
cd consensus
cp .env.example .env.local   # fill in OPENAI_API_KEY and AUTH_SECRET
pnpm install
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000.

## Deploys

`main` is auto-deployed by [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
to https://consensus.rk9-vp9.online. The image is pushed to GHCR, then SSH'd
to the host and `docker compose pull && up -d` runs there.
