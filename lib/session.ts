// Server-side session store. The browser cookie holds only a small session
// id (a cuid); the Atlassian tokens and identity live in the AuthSession
// table. This keeps the cookie tiny and robust (no multi-KB tokens in the
// browser) and allows server-side refresh/revocation.

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

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

export async function getSession(): Promise<Session | null> {
  const id = cookies().get(COOKIE_NAME)?.value;
  if (!id) return null;
  const row = await prisma.authSession.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    cloudId: row.cloudId,
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    accessExpiresAt: row.accessExpiresAt.getTime(),
  };
}

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
