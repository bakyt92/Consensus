/**
 * Magic-link email delivery. In dev we just log the link to the server console
 * so you can copy it into the browser. In prod, set RESEND_API_KEY and we send
 * via Resend's REST API (no SDK so the bundle stays light).
 */

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export async function sendMail(msg: MailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(
      `\n[mail:dev]\n  to:      ${msg.to}\n  subject: ${msg.subject}\n  body:    ${msg.text}\n`,
    );
    return;
  }
  const from = process.env.RESEND_FROM ?? "Consensus <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ from, to: msg.to, subject: msg.subject, text: msg.text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend failed: ${res.status} ${detail}`);
  }
}
