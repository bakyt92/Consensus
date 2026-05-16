/**
 * JWT + cookie helpers that don't depend on next/headers. Safe to import
 * from the custom server entrypoint, where the next/headers request-scoped
 * AsyncLocalStorage isn't available.
 */

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "consensus_session";
const ALG = "HS256";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET must be set (≥16 chars) in env.");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(userId: string): Promise<string> {
  return await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return (payload.uid as string) ?? null;
  } catch {
    return null;
  }
}

export function readSessionFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  const m = cookieHeader
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!m) return null;
  return decodeURIComponent(m.slice(SESSION_COOKIE_NAME.length + 1));
}
