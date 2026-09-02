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
  authType: string; // "atlassian" | "local"
  // Null for local sessions - they carry no Atlassian credentials, which is
  // what structurally prevents them from acting in Jira.
  cloudId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessExpiresAt: number | null;
};

export type NewSession = Omit<Session, "id" | "authType"> & { authType?: string };

// Persist a new session row and return its id (goes in the cookie).
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(data: NewSession): Promise<string> {
  const row = await prisma.authSession.create({
    data: {
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      accountId: data.accountId,
      name: data.name,
      email: data.email,
      avatarUrl: data.avatarUrl,
      authType: data.authType ?? "atlassian",
      cloudId: data.cloudId ?? null,
      accessToken: data.accessToken ?? null,
      refreshToken: data.refreshToken ?? null,
      accessExpiresAt: data.accessExpiresAt != null ? new Date(data.accessExpiresAt) : null,
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

  // Absolute expiry, enforced server-side. Rows created before this field
  // existed have expiresAt = null and are treated as still valid, so nobody
  // gets logged out by the upgrade itself.
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    await prisma.authSession.deleteMany({ where: { id } }).catch(() => {});
    return null;
  }

  // Atlassian access tokens expire (~1h). If this one is expired or within a
  // 2-minute buffer, use the refresh token to get a fresh one and persist it.
  // Without this, long-lived sessions (e.g. an hours-long poker session) fail
  // Jira writes with 401 once the original token lapses.
  const BUFFER_MS = 2 * 60 * 1000;
  let accessToken = row.accessToken;
  let refreshToken = row.refreshToken;
  let accessExpiresAt = row.accessExpiresAt?.getTime() ?? null;

  // Local sessions have no Atlassian tokens to refresh.
  const isAtlassian = row.authType !== "local" && !!row.refreshToken && accessExpiresAt !== null;

  if (isAtlassian && Date.now() + BUFFER_MS >= (accessExpiresAt as number)) {
    console.log("[perf] getSession: token refresh firing (Jira call on this request)");
    try {
      const refreshed = await refreshTokens(row.refreshToken as string);
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
    authType: row.authType,
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

/**
 * Jira credentials for the current session, or undefined if this session has
 * none (a local stakeholder account).
 *
 * Callers pass the result to lib/jira functions. Returning undefined for local
 * sessions means such an account can never act in Jira under its own identity;
 * combined with the capability guard, it cannot reach write routes at all.
 */
export async function getJiraAuth(): Promise<{ accessToken: string; cloudId: string } | undefined> {
  const s = await getSession();
  if (!s || s.authType === "local") return undefined;
  if (!s.accessToken || !s.cloudId) return undefined;
  return { accessToken: s.accessToken, cloudId: s.cloudId };
}
