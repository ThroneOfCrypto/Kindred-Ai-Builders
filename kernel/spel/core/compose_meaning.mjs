// SPEL composition: deterministic, explicit, and strategy-bound.
// This is intentionally small. Composition is where most systems start lying.

import crypto from 'node:crypto';

/**
 * Canonical JSON stringifier.
 * 
 * Note: We keep this minimal to avoid dependency drift.
 * For objects, we sort keys; for arrays, preserve order.
 */
export function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(value[k])).join(',') + '}';
}

export function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/**
 * Strategies:
 * - DenyOverrides: if both define the same key with different values -> error
 * - PermitOverrides: later wins (b overrides a)
 * - OnlyOneApplicable: if both define any same key -> error (even if equal)
 */
export function composeMeaning(a, b, strategy = 'DenyOverrides') {
  const A = a ?? {};
  const B = b ?? {};

  if (typeof A !== 'object' || typeof B !== 'object' || Array.isArray(A) || Array.isArray(B)) {
    throw new Error('composeMeaning expects plain objects');
  }

  const out = { ...A };
  const collisions = [];

  for (const [k, vB] of Object.entries(B)) {
    if (!(k in A)) {
      out[k] = vB;
      continue;
    }

    const vA = A[k];
    const same = canonicalStringify(vA) === canonicalStringify(vB);
    collisions.push({ key: k, same });

    if (strategy === 'OnlyOneApplicable') {
      throw new Error(`OnlyOneApplicable collision on key: ${k}`);
    }

    if (strategy === 'DenyOverrides') {
      if (!same) throw new Error(`DenyOverrides conflict on key: ${k}`);
      out[k] = vA; // same value, keep deterministic
      continue;
    }

    if (strategy === 'PermitOverrides') {
      out[k] = vB; // later wins
      continue;
    }

    throw new Error(`Unknown strategy: ${strategy}`);
  }

  const aCanon = canonicalStringify(A);
  const bCanon = canonicalStringify(B);
  const outCanon = canonicalStringify(out);

  return {
    out,
    strategy,
    collisions,
    commitments: {
      a_sha256: sha256Hex(aCanon),
      b_sha256: sha256Hex(bCanon),
      out_sha256: sha256Hex(outCanon),
      out_canonical_json: outCanon,
    }
  };
}
