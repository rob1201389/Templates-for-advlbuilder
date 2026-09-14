import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * APP 11 field-level encryption (CLAUDE.md §2).
 *
 * AES-256-GCM with a random 12-byte IV per value. Output format:
 *   v1:<iv b64>:<auth tag b64>:<ciphertext b64>
 * The version prefix allows future key/algorithm rotation.
 *
 * PII_ENCRYPTION_KEY must be 32 bytes, base64-encoded (generate with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
 * Keep it in the secret store, never in the repo.
 */

const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) throw new Error("PII_ENCRYPTION_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("PII_ENCRYPTION_KEY must be 32 bytes (base64)");
  return k;
}

export function encryptPii(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptPii(payload: string): string {
  const [version, ivB64, tagB64, ctB64] = payload.split(":");
  if (version !== VERSION) throw new Error(`Unsupported ciphertext version: ${version}`);
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** SHA-256 hex digest — used for inventory API keys (never store raw keys). */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time comparison for API-key digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
