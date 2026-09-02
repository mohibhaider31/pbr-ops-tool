// Authentication audit trail.
//
// Failed logins were already recorded (for throttling), but nothing recorded
// who signed in, who invited whom, or who reset a password — so there was no
// way to answer "how did this account get access?" after the fact. Logging is
// deliberately best-effort: an audit write must never break a login.

import { prisma } from "@/lib/prisma";

export type AuthEventKind =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "INVITE_CREATED"
  | "INVITE_ACCEPTED"
  | "PASSWORD_RESET_ISSUED"
  | "PASSWORD_RESET_USED"
  | "ATLASSIAN_LINKED"
  | "SESSIONS_REVOKED"
  | "ACCOUNT_DEACTIVATED"
  | "ACCOUNT_REACTIVATED";

export async function logAuthEvent(e: {
  kind: AuthEventKind;
  actorName?: string | null;
  actorId?: string | null;
  subject?: string | null;
  authType?: string | null;
  ip?: string | null;
  detail?: string | null;
}) {
  try {
    await prisma.authEvent.create({
      data: {
        kind: e.kind,
        actorName: e.actorName ?? null,
        actorId: e.actorId ?? null,
        subject: e.subject ?? null,
        authType: e.authType ?? null,
        ip: e.ip ?? null,
        detail: e.detail ?? null,
      },
    });
  } catch {
    // Never let auditing fail the action it's describing.
  }
}

export function ipFrom(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
