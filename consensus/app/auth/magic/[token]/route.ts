import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { setSessionCookie } from "@/src/lib/session";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const link = await prisma.magicLink.findUnique({ where: { token } });
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";

  if (!link || link.consumedAt || link.expiresAt < new Date()) {
    return NextResponse.redirect(
      `${origin}/error?reason=${encodeURIComponent("magic-link-invalid")}`,
    );
  }
  await prisma.magicLink.update({
    where: { id: link.id },
    data: { consumedAt: new Date() },
  });
  await setSessionCookie(link.userId);
  return NextResponse.redirect(`${origin}/lobby`);
}
