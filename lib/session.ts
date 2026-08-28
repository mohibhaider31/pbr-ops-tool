// Server-side session store. The browser cookie holds only a small session
// id (a cuid); the Atlassian tokens and identity live in the AuthSession
// table. This keeps the cookie tiny and robust (no multi-KB tokens in the
// browser) and allows server-side refresh/revocation.

import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { refreshTokens } from "@/lib/atlassian-oauth";

const COOKIE_NAME = "pbr_session";

export type Session = {
  id: string;
  accountId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  cloudId: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number; // epoch ms
};

export type NewSession = Omit<Session, "id">;

// Persist a new session row and return its id (goes in the cookie).
export async function createSession(data: NewSession): Promise<string> {
  const row = await prisma.authSession.create({
    data: {
      accountId: data.accountId,
      name: data.name,
      email: data.email,
      avatarUrl: data.avatarUrl,
      cloudId: data.cloudId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      accessExpiresAt: new Date(data.accessExpiresAt),
    },
  });
  return row.id;
}

// Memoised per request. getSession is called by getViewer, getCurrentBoard,
// getParticipant and many routes directly - without this it re-queried
// AuthSession (and could re-run the token refresh) on every single call.
export const getSession = cache(async function getSession(): Promise<Session | null> {
  const id = cookies().get(COOKIE_NAME)?.value;
  if (!id) return null;
  const row = await prisma.authSession.findUnique({ where: { id } });
  if (!row) return null;

  // Atlassian access tokens expire (~1h). If this one is expired or within a
  // 2-minute buffer, use the refresh token to get a fresh one and persist it.
  // Without this, long-lived sessions (e.g. an hours-long poker session) fail
  // Jira writes with 401 once the original token lapses.
  const BUFFER_MS = 2 * 60 * 1000;
  let accessToken = row.accessToken;
  let refreshToken = row.refreshToken;
  let accessExpiresAt = row.accessExpiresAt.getTime();

  if (Date.now() + BUFFER_MS >= accessExpiresAt) {
    console.log("[perf] getSession: token refresh firing (Jira call on this request)");
    try {
      const refreshed = await refreshTokens(row.refreshToken);
      accessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken;
      accessExpiresAt = Date.now() + refreshed.expiresIn * 1000;
      await prisma.authSession.update({
        where: { id },
        data: {
          accessToken,
          refreshToken,
          accessExpiresAt: new Date(accessExpiresAt),
        },
      });
    } catch {
      // Refresh failed (e.g. refresh token revoked/expired after ~90 days of
      // inactivity). Return the stale session; the caller's Jira request will
      // surface a clear error and the user can re-authenticate by logging in.
    }
  }

  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    cloudId: row.cloudId,
    accessToken,
    refreshToken,
    accessExpiresAt,
  };
});

export async function deleteSession(id: string) {
  await prisma.authSession.deleteMany({ where: { id } });
}

// Cookie helpers — the value is just the session id, so this is always tiny.
export function sessionCookieString(id: string): string {
  return [
    `${COOKIE_NAME}=${id}`,
    "Path=/",
    `Max-Age=${60 * 60 * 24 * 30}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function clearCookieString(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0`;
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, "", { httpOnly: true, secure: true, path: "/", maxAge: 0 });
}

export const SESSION_COOKIE = COOKIE_NAME;
