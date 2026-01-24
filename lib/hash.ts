"use client";

/**
 * Client-side hashing helpers.
 *
 * - Works offline (WebCrypto)
 * - Used for deterministic pack hashes and per-file hashes
 */

export async function sha256Hex(bytesOrText: Uint8Array | string): Promise<string> {
  const bytes = typeof bytesOrText === "string" ? new TextEncoder().encode(bytesOrText) : bytesOrText;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < arr.length; i++) {
    out += arr[i].toString(16).padStart(2, "0");
  }
  return out;
}
