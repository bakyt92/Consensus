# Consensus — known bugs

Tracked here so we can pick them up later. Order is roughly priority.

## Root-cause (resolved)

All four /create bugs shared a smell: **client-component interactivity wasn't running**. Two contributing causes have now been addressed:

1. **`server.ts` was destroying the Next HMR upgrade.** The custom upgrade handler called `socket.destroy()` for any path that wasn't `/api/ws`, including Next's `/_next/webpack-hmr` socket. Fast-refresh then failed continuously, which (in dev mode) cascaded into stale/broken client chunks. Fixed: unknown upgrades now go to `app.getUpgradeHandler()`.
2. **State-derived `disabled` on Server-Action forms.** When hydration is delayed/broken, `useState` never updates, so `disabled={!agenda.trim() || ...}` stays `true` forever. Refactor to React 19 `<form action={formAction}>` + HTML5 `required`/`minLength` so the form works pre-hydration, same as `SignupForm`.

After these fixes, hard-reload `/create` and confirm: HMR ws connects, button enables after typing, popovers open/close, "Try with an example" fills both fields.

## Bugs

### 1. (DONE) /create — "Open the room" button always disabled

Refactored `CreateRoomForm` to the declarative form-action pattern:
- `<form action={createRoomFormAction}>` with `useActionState`
- inputs use `name="agenda"`/`name="criteria"`, `required`, `minLength={10}`, `maxLength={2000}`
- button is `disabled={isPending}` only — no longer derived from `useState`

Files: `app/create/CreateRoomForm.tsx`, `src/lib/room-actions.ts` (added `createRoomFormAction` wrapper).

### 2. (DONE) /create — "Try with an example" did nothing

Now uses `useRef` to write directly into the textareas (no `useState`). Submission still works pre-hydration even if this button can't run.

File: `app/create/CreateRoomForm.tsx`.

### 3. (DONE) /create — popover `?` buttons didn't open

Replaced state-driven popover with native `<details>/<summary>` — opens/closes with zero JS. Added CSS to strip the default disclosure marker and anchor the popover to the `<details>` wrapper.

Files: `app/create/CreateRoomForm.tsx`, `app/globals.css`.

### 4. (DONE) Remove `maxParticipants` from /create

User said "we don't need this". UI input + form state removed. Server action defaults to 8. Prisma column kept (default 8) so existing data is preserved — can drop in a future migration if we want.

Files: `app/create/CreateRoomForm.tsx`, `src/lib/room-actions.ts`.

### 5. (DONE) HMR WebSocket was being destroyed

`server.ts` upgrade handler now forwards any non-`/api/ws` upgrade to `app.getUpgradeHandler()`. Restart the dev server (`pnpm dev`) to pick up the change.

File: `server.ts`.

### 6. (Verify after hard reload) /sign-up flow

Already refactored to declarative form-action pattern. Should work after a hard reload but the in-browser flow hasn't been visually confirmed end-to-end yet (server-side + curl tests pass).
