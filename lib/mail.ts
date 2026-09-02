// Transactional email for invites and password resets.
//
// Deliberately optional: if RESEND_API_KEY isn't set, send() reports that it
// didn't deliver and the caller falls back to showing the link for an admin to
// relay by hand. That keeps the auth flows working today while making email a
// drop-in upgrade — set the key and links start arriving by themselves.

const FROM = process.env.MAIL_FROM || "PBR Ops Tool <onboarding@resend.dev>";

export type SendResult = { delivered: boolean; reason?: string };

export function mailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

async function send(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { delivered: false, reason: "no_provider" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { delivered: false, reason: `provider_error ${res.status} ${body.slice(0, 200)}` };
    }
    return { delivered: true };
  } catch (e: any) {
    return { delivered: false, reason: String(e?.message || e).slice(0, 200) };
  }
}

// Shared shell. Plain and text-first — these are functional emails, and
// heavy markup is what gets them filtered.
function shell(heading: string, body: string, ctaLabel: string, ctaUrl: string, footer: string) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#141412">
  <div style="font-size:13px;font-weight:700;letter-spacing:.06em;color:#DA3B12;margin-bottom:24px">PBR OPS TOOL</div>
  <h1 style="font-size:20px;font-weight:600;margin:0 0 12px">${heading}</h1>
  <p style="font-size:14px;line-height:1.6;color:#4A473F;margin:0 0 24px">${body}</p>
  <a href="${ctaUrl}" style="display:inline-block;background:#141412;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px">${ctaLabel}</a>
  <p style="font-size:12px;line-height:1.6;color:#8B8579;margin:24px 0 0">${footer}</p>
  <p style="font-size:11px;color:#A8A296;margin:16px 0 0;word-break:break-all">${ctaUrl}</p>
</div>`;
}

export async function sendInviteEmail(to: string, name: string, url: string, days: number) {
  const heading = `${name}, you've been invited`;
  const body =
    "You've been given access to the PBR Ops Tool so you can view the product roadmap. Set a password to get started — you won't need a Jira account.";
  const footer = `This link works once and expires in ${days} days. If you weren't expecting it, you can ignore this email.`;
  return send(
    to,
    "You've been invited to the PBR Ops Tool",
    shell(heading, body, "Set your password", url, footer),
    `${heading}\n\n${body}\n\n${url}\n\n${footer}`
  );
}

export async function sendResetEmail(to: string, name: string, url: string, minutes: number) {
  const heading = "Reset your password";
  const body = `Hi ${name} — use the link below to choose a new password. Resetting will sign you out everywhere else.`;
  const footer = `This link works once and expires in ${minutes} minutes. If you didn't request it, you can ignore this email and your password stays unchanged.`;
  return send(
    to,
    "Reset your PBR Ops Tool password",
    shell(heading, body, "Choose a new password", url, footer),
    `${heading}\n\n${body}\n\n${url}\n\n${footer}`
  );
}
