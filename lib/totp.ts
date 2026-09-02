// TOTP (RFC 6238) for local accounts, plus at-rest encryption of the shared
// secret and hashed single-use backup codes.
//
// Implemented directly on node:crypto rather than pulling a dependency — the
// algorithm is short and well-specified, and this avoids trusting an extra
// package with authentication secrets.
//
// The shared secret is encrypted with AES-256-GCM before storage. Storing it in
// plaintext would mean a database leak alone is enough to mint valid codes,
// which defeats the point of the second factor.

import crypto from "crypto";
import bcrypt from "bcryptjs";

const STEP_SECONDS = 30;
const DIGITS = 6;
// Accept the adjacent windows so a slightly-off device clock still works.
const DRIFT_WINDOWS = 1;

// --- base32 (authenticator apps expect the secret in base32) ---

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = B32.indexOf(c);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// --- secret encryption at rest ---

function encryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to encrypt TOTP secrets");
  // Derive a stable 32-byte key; SESSION_SECRET itself is an arbitrary string.
  return crypto.createHash("sha256").update(`totp:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv.tag.ciphertext, all base64url
  return [iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed stored secret");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

// --- TOTP ---

export function generateSecret(): string {
  // 20 bytes = 160 bits, the RFC 4226 recommendation.
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);

  const hmac = crypto.createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Verify a code against the secret, allowing one window of clock drift. */
export function verifyTotp(base32Secret: string, code: string): boolean {
  const cleaned = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;

  let key: Buffer;
  try {
    key = base32Decode(base32Secret);
  } catch {
    return false;
  }

  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let w = -DRIFT_WINDOWS; w <= DRIFT_WINDOWS; w++) {
    const expected = hotp(key, counter + w);
    // Constant-time compare — both are fixed-length digit strings.
    if (
      expected.length === cleaned.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleaned))
    ) {
      return true;
    }
  }
  return false;
}

/** The URI an authenticator app scans. */
export function otpauthUri(secret: string, accountLabel: string, issuer = "PBR Ops Tool"): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// --- backup codes ---

/** Ten single-use codes. Returned once in plaintext; only hashes are stored. */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  // Cost 8 rather than 12: these are high-entropy random codes, not
  // user-chosen passwords, so the work factor is about rate-limiting a stolen
  // hash rather than resisting dictionary attack — and login must verify
  // against up to ten of them.
  return Promise.all(codes.map((c) => bcrypt.hash(normaliseBackupCode(c), 8)));
}

export function normaliseBackupCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Find which stored hash a supplied backup code matches, or -1.
 * The caller removes that hash so the code can't be reused.
 */
export async function matchBackupCode(code: string, hashes: string[]): Promise<number> {
  const norm = normaliseBackupCode(code);
  if (norm.length < 8) return -1;
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(norm, hashes[i])) return i;
  }
  return -1;
}
