import { cookies } from "next/headers";
import { prisma } from "./prisma";
import {
  SESSION_COOKIE_NAME,
  signSession,
} from "./session-core";

export {
  SESSION_COOKIE_NAME,
  signSession,
  verifySessionToken,
  readSessionFromCookieHeader,
} from "./session-core";

export async function setSessionCookie(userId: string) {
  const jar = await cookies();
  const token = await signSession(userId);
  jar.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE_NAME);
}

export async function getSessionUser() {
  const jar = await cookies();
  const tok = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!tok) return null;
  const { verifySessionToken } = await import("./session-core");
  const uid = await verifySessionToken(tok);
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}
