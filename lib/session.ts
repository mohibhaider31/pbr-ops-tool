// Encrypted session handling for Atlassian OAuth.
// The session holds the user's identity plus their Jira tokens. It's stored
// as a JWE (encrypted JWT) in an httpOnly cookie, so the browser can't read
// the tokens and they never appear in client JS.

import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "pbr_session";
// 32-byte key derived from the env secret. SESSION_SECRET must be set in the
// environment (generated during setup, never committed).
function key(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  // Accept either a raw 32+ char string or base64; normalize to 32 bytes.
  const raw = Buffer.from(secret);
  if (raw.length >= 32) return new Uint8Array(raw.subarray(0, 32));
  const padded = Buffer.alloc(32);
  raw.copy(padded);
  return new Uint8Array(padded);
}

export type Session = {
  accountId: string; // Atlassian account ID (stable identity)
  name: string;
  email: string | null;
  avatarUrl: string | null;
  cloudId: string; // the Jira site (cloud) id for API calls
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number; // epoch ms
};

export async function encodeSession(session: Session): Promise<string> {
  return await new EncryptJWT(session as any)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .encrypt(key());
}

export async function decodeSession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtDecrypt(token, key());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const jar = cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return decodeSession(token);
}

export async function setSessionCookie(session: Session) {
  const token = await encodeSession(session);
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, "", { httpOnly: true, secure: true, path: "/", maxAge: 0 });
}

export const SESSION_COOKIE = COOKIE_NAME;
