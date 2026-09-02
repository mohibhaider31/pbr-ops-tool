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

/** Minimum viable policy. Length carries most of the value here. */
export function validatePassword(pw: string): PasswordProblem {
  if (pw.length < 12) return "Password must be at least 12 characters";
  if (pw.length > 200) return "Password is too long";
  if (!/[a-zA-Z]/.test(pw)) return "Password must contain a letter";
  if (!/[0-9]/.test(pw)) return "Password must contain a number";
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
