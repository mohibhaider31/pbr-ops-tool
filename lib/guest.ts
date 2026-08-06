// Guest poker participants. A guest is NOT an authenticated user — they have
// no Atlassian identity, no account, and no access to anything except voting
// in ONE poker session whose code they were given. The guest identity is a
// small HMAC-signed cookie holding { voterId, name, code }. This deliberately
// grants zero access to the backlog, Jira, other boards, or any mutation
// beyond casting a vote in that single session.

import { cookies } from "next/headers";
import crypto from "crypto";

const GUEST_COOKIE = "pbr_guest";
const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";

export type Guest = {
  voterId: string; // e.g. "guest:ab12cd34"
  name: string;
  code: string; // the poker session code this guest is bound to
};

function sign(payload: string): string {
  const mac = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${mac}`;
}

function verify(token: string): Guest | null {
  try {
    const [body, mac] = token.split(".");
    if (!body || !mac) return null;
    const payload = Buffer.from(body, "base64url").toString("utf8");
    const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
    // constant-time compare
    if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
    return JSON.parse(payload) as Guest;
  } catch {
    return null;
  }
}

export function makeGuest(name: string, code: string): Guest {
  const voterId = `guest:${crypto.randomBytes(6).toString("hex")}`;
  return { voterId, name: name.trim().slice(0, 60), code };
}

export function guestCookieString(guest: Guest): string {
  const token = sign(JSON.stringify(guest));
  // Session cookie (no Max-Age) so it clears when the browser closes.
  return `${GUEST_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearGuestCookieString(): string {
  return `${GUEST_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// Read the current guest identity from the cookie, if any. Optionally require
// it to match a specific session code (guests are bound to one session).
export function getGuest(requireCode?: string): Guest | null {
  const token = cookies().get(GUEST_COOKIE)?.value;
  if (!token) return null;
  const guest = verify(token);
  if (!guest) return null;
  if (requireCode && guest.code !== requireCode) return null;
  return guest;
}
