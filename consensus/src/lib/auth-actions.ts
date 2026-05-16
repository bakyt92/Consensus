"use server";

import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "./prisma";
import { setSessionCookie, clearSessionCookie } from "./session";
import { sendMail } from "./mail";

const Signup = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  username: z.string().trim().min(2).max(40),
});

export type SignupResult =
  | { kind: "session" }
  | { kind: "magic_sent"; email: string }
  | { kind: "error"; message: string };

/**
 * Always returns — never throws across the RSC boundary. A thrown error
 * client-side looks identical to a hydration failure (page silently
 * refreshes), so we catch everything and surface a human-readable message.
 */
export async function signupOrRequestLink(input: unknown): Promise<SignupResult> {
  try {
    const parsed = Signup.safeParse(input);
    if (!parsed.success) {
      return {
        kind: "error",
        message: "Enter a valid email and a username (≥2 chars).",
      };
    }
    const { email, username } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const user = await prisma.user.create({ data: { email, username } });
      await setSessionCookie(user.id);
      return { kind: "session" };
    }

    const token = nanoid(40);
    await prisma.magicLink.create({
      data: {
        userId: existing.id,
        token,
        expiresAt: new Date(Date.now() + 1000 * 60 * 15),
      },
    });

    const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
    const link = `${origin}/auth/magic/${token}`;
    await sendMail({
      to: email,
      subject: "Your Consensus sign-in link",
      text: `Hi${existing.username ? " " + existing.username : ""},\n\nClick this link to sign in to Consensus. It expires in 15 minutes:\n\n${link}\n\nIf you didn't request this, ignore this email.\n`,
    });
    return { kind: "magic_sent", email };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[signupOrRequestLink] failed:", msg);
    return {
      kind: "error",
      message:
        process.env.NODE_ENV === "production"
          ? "Something went wrong. Please try again."
          : `Server error: ${msg}`,
    };
  }
}

export async function logOut() {
  await clearSessionCookie();
  redirect("/sign-up");
}
