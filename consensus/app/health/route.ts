// Liveness probe for the host nginx → docker healthcheck → deploy smoke test.
// Cheap on purpose: no DB hit, no downstream calls. Treat readiness checks as
// a separate concern if we add one later.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, service: "consensus", ts: Date.now() });
}
