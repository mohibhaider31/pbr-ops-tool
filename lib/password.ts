// Credential handling for local (stakeholder) accounts.
//
// These accounts exist because many stakeholders have no Atlassian licence and
// buying Jira seats so they can READ a roadmap isn't reasonable. They are
// deliberately read-only: they hold no Atlassian token, so they cannot act in
// Jira at all (see lib/guard.ts for the explicit enforcement).

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const BCRYPT_COST = 12;

// --- passwords ---

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type PasswordProblem = string | null;

// The passwords that actually get guessed. A full breach-list check would need
// an external service (e.g. HaveIBeenPwned's k-anonymity API); this catches the
// realistic offenders without a network dependency in the signup path.
const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "letmein", "welcome",
  "qwerty", "qwerty123", "qwertyuiop", "123456", "1234567890", "12345678",
  "iloveyou", "admin", "administrator", "changeme", "secret", "abc123",
  "monkey", "dragon", "sunshine", "princess", "football", "baseball",
  "trustno1", "master", "shadow", "superman", "starwars", "whatever",
  "pbropstool", "opstool", "roadmap", "logiciel", "atlassian", "jira",
]);

function normalise(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Length carries most of the value, but reject the obvious cases too: a
 * 12-character common password or the person's own email is technically
 * compliant and practically worthless.
 */
export function validatePassword(pw: string, context?: { email?: string | null; name?: string | null }): PasswordProblem {
  if (pw.length < 12) return "Password must be at least 12 characters";
  if (pw.length > 200) return "Password is too long";
  if (!/[a-zA-Z]/.test(pw)) return "Password must contain a letter";
  if (!/[0-9]/.test(pw)) return "Password must contain a number";

  const n = normalise(pw);
  if (COMMON.has(n)) return "That password is too common — please choose another";
  // Catch "password1234", "qwerty123456" etc.
  for (const c of COMMON) {
    if (c.length >= 6 && n.startsWith(c)) return "That password is too easy to guess";
  }
  // A single repeated character or a simple run.
  if (/^(.)\1+$/.test(pw)) return "Password can't be a single repeated character";

  const local = context?.email ? normalise(context.email.split("@")[0]) : "";
  if (local.length >= 4 && n.includes(local)) return "Password can't contain your email name";
  const name = context?.name ? normalise(context.name) : "";
  if (name.length >= 5 && n.includes(name)) return "Password can't contain your own name";

  return null;
}

// --- invite tokens ---
//
// The raw token is emailed/shared once and never stored; we keep only its
// sha256. A leaked database therefore doesn't yield usable invite links.

export function generateInviteToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Check a password against HaveIBeenPwned's breach corpus using their
 * k-anonymity range API.
 *
 * Only the first 5 hex characters of the SHA-1 are transmitted; the API returns
 * every suffix in that bucket and we match locally, so the password itself
 * never leaves this process.
 *
 * FAILS OPEN deliberately: if the API is slow or unreachable we accept the
 * password rather than block someone from setting one up. The local common-list
 * check in validatePassword() still applies either way.
 */
export async function isBreachedPassword(pw: string): Promise<{ breached: boolean; count?: number }> {
  try {
    const sha1 = crypto.createHash("sha1").update(pw, "utf8").digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" }, // uniform response size
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { breached: false };

    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, countStr] = line.trim().split(":");
      if (hashSuffix === suffix) {
        const count = parseInt(countStr, 10) || 0;
        // Padded entries come back with a count of 0 - not a real hit.
        if (count > 0) return { breached: true, count };
      }
    }
    return { breached: false };
  } catch {
    return { breached: false }; // fail open
  }
}

// --- login throttling ---
//
// DB-backed on purpose: in-memory counters live per serverless instance, so
// they'd be trivially bypassed by hitting a different one.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

export async function isLockedOut(email: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const failures = await prisma.loginAttempt.count({
    where: { email: email.toLowerCase(), success: false, createdAt: { gte: since } },
  });
  return failures >= MAX_FAILURES;
}

export async function recordAttempt(email: string, success: boolean, ip?: string | null) {
  await prisma.loginAttempt.create({
    data: { email: email.toLowerCase(), success, ip: ip ?? null },
  });
  // Opportunistic cleanup so the table doesn't grow without bound.
  if (Math.random() < 0.05) {
    await prisma.loginAttempt
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
      .catch(() => {});
  }
}

/** Clear the failure window after a successful login. */
export async function clearFailures(email: string) {
  await prisma.loginAttempt
    .deleteMany({ where: { email: email.toLowerCase(), success: false } })
    .catch(() => {});
}
