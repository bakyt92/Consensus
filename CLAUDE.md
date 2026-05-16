# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Consensus** — an AI-mediated meeting platform. A facilitator sets an
agenda and evaluation criteria. Participants join via room code and chat
text-first; an OpenAI-driven mediator filters off-topic messages, keeps a
live Markdown summary, and decides when the criteria have been satisfied
("consensus reached"). The facilitator can lock the room or close it
early; once closed, participants get an immutable Markdown export.

Built for the Paris hackathon. The spec lives at `Consensus/consensus.md`;
visual designs at `Consensus/designs/`. Source of truth for product
decisions is `consensus.md` — everything else (this file included) bows
to it.

## Tech stack (load-bearing choices)

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router) + **React 19** + **TS** + Tailwind 4 |
| Runtime | **Node 22+** with `--experimental-transform-types` (strip TS) |
| DB | **SQLite + Prisma 7** (better-sqlite3 adapter, file at `prisma/dev.db`) |
| Realtime | **Custom server** wraps `next` + `ws.Server` on the same HTTP listener |
| Auth | Email + username; cookie session (signed JWT via `jose`). Returning users get a magic link. |
| LLM | **OpenAI** Chat Completions with JSON Schema structured output (default model: `gpt-4o-mini`, env-configurable) |
| Email (magic links) | Console-log in dev. Set `RESEND_API_KEY` to switch to Resend. |

## Architectural rules

These decisions aren't obvious from any single file. Honor them unless explicitly redirected:

1. **Serial LLM pipeline per room.** `src/server/pipeline.ts` keeps one
   promise chain per `roomId`. The next mediator turn cannot start until
   the previous one finishes. This guarantees the LLM always sees the
   full transcript including the most recently processed message, and
   removes races when two participants send at once.
2. **Source of truth is the DB.** Messages, summaries, consensus
   snapshots, and final minutes are all persisted. The WebSocket layer
   just broadcasts events; never put state only in sockets. On (re)connect
   the server replays the snapshot from DB so clients reconcile on their
   own.
3. **Mediator is invoked on every user message**, not on a timer. There
   is no polling loop. If discussion stalls and no one sends, the
   mediator stays quiet — that's a feature.
4. **Prompts live as files** under `prompts/` and are loaded at runtime
   by `src/lib/prompts.ts`. Edit them as Markdown, no redeploy needed.
5. **Structured output via JSON Schema.** The model returns
   `{ isOnTopic, mediatorReply, updatedSummaryMarkdown, consensusStatus, consensusPercent }`.
   Defined in one place: `src/server/openai.ts` (zod + JSON Schema).
6. **Close-the-room is two-phase.** Admin's `requestClose` flips status
   to `STOPPING`, denies new enqueues, then waits for the in-flight
   queue to drain before flipping to `CLOSED` and persisting the final
   summary. Don't shortcut this — it's why mid-flight messages still get
   processed.
7. **`next/headers` is poison in the custom server.** `server.ts` only
   imports from `src/lib/session-core.ts` (pure JWT helpers). Anything
   that needs `cookies()` lives in `src/lib/session.ts` and is only
   imported from App Router code.

## Layout

```
consensus/
├── app/                       # Next App Router pages
│   ├── sign-up/               # Email + username signup, magic link fallback
│   ├── lobby/                 # Join by code + recent rooms
│   ├── create/                # Agenda + criteria form
│   ├── room/[code]/           # Live room (3-column layout)
│   ├── room/[code]/end/       # Closed-meeting minutes view
│   ├── auth/magic/[token]/    # Magic-link consumer
│   ├── api/room/[code]/minutes/ # .md export endpoint
│   └── error/                 # Reusable error screen (?reason=…)
├── prisma/
│   ├── schema.prisma          # User, Room, Membership, Message, Summary, ConsensusSnapshot
│   └── migrations/
├── prompts/                   # system.md, kickoff.md, turn.md — loaded at runtime
├── src/
│   ├── lib/
│   │   ├── prisma.ts          # PrismaClient singleton w/ better-sqlite3 adapter
│   │   ├── session.ts         # Cookie session (uses next/headers — App Router only)
│   │   ├── session-core.ts    # JWT helpers w/ no Next dependency (safe for server.ts)
│   │   ├── auth-actions.ts    # signupOrRequestLink, logOut server actions
│   │   ├── room-actions.ts    # createRoom, joinRoom, sendMessage, lockRoom, requestCloseMeeting
│   │   ├── mail.ts            # console-log or Resend
│   │   └── prompts.ts         # filesystem prompt loader (cached in prod)
│   ├── server/
│   │   ├── wsHub.ts           # in-process room → Set<WsClient> map (broadcast/register/unregister)
│   │   ├── pipeline.ts        # serial per-room LLM queue
│   │   └── openai.ts          # OpenAI call + zod-validated structured output
│   └── components/            # Brand, EntryShell, Icon, Markdown, useRoomChannel hook
├── server.ts                  # Custom Next + ws.Server entrypoint
├── prisma.config.ts           # Prisma 7 config (datasource.url, migration path)
├── tsconfig.json              # Default (app code)
└── tsconfig.server.json       # Server entrypoint (extends default)
```

## Commands

All commands run from `consensus/`. Uses pnpm; pnpm-workspace.yaml lists which
postinstall scripts are approved (`better-sqlite3`, `prisma`).

| Command | What it does |
|---|---|
| `pnpm dev` | Start the custom Next + ws server on `:3000` (uses Node's `--experimental-transform-types`). |
| `pnpm build` | `next build`. The custom server stays in TS and runs the same way in production via `pnpm start`. |
| `pnpm start` | Production server. |
| `pnpm db:migrate` | `prisma migrate dev` — apply schema changes. |
| `pnpm db:studio` | Open Prisma Studio against `prisma/dev.db`. |
| `pnpm lint` | ESLint via `eslint-config-next`. |
| `pnpm exec tsc --noEmit -p tsconfig.json` | Typecheck App code. |
| `pnpm exec tsc --noEmit -p tsconfig.server.json` | Typecheck the server entry. |

## Environment

Copy `.env.example` to `.env.local` and fill at minimum:

- `OPENAI_API_KEY` — required for the mediator. Without it, every
  message will enqueue but the worker will fail.
- `AUTH_SECRET` — anything ≥16 chars; signs the session JWT.
- `DATABASE_URL` — defaults to `file:./dev.db` (relative to `prisma/`).
- `OPENAI_MODEL` — defaults to `gpt-4o-mini`.
- `APP_ORIGIN` — origin used to build magic-link URLs.
- `RESEND_API_KEY` / `RESEND_FROM` — optional; turns on real email
  delivery. Otherwise links go to the dev console.

## Where the design lives

`Consensus/designs/project/Consensus.html` is the load-bearing
prototype: read its `<style>` block when changing CSS, since the App
Router pages share its CSS variable names (`--navy`, `--cream`,
`--rust`, etc.) and component class names (`btn`, `pill`, `card`,
`entry-shell`, `room`, `summary-doc`). The HTML/JSX files alongside it
(`screens.jsx`, `room.jsx`) are the visual reference for each page.
Don't import them — they're prototype-only.
