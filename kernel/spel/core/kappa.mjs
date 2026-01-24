#!/usr/bin/env node
import crypto from 'node:crypto';

/**
 * κ: canonicalize a SPEL object by:
 * - deep sorting object keys
 * - stringifying in a stable way
 * - hashing with SHA-256
 */
export function kappa(obj) {
  function sortDeep(x) {
    if (Array.isArray(x)) return x.map(sortDeep);
    if (x && typeof x === 'object') {
      return Object.keys(x).sort().reduce((acc, k) => {
        acc[k] = sortDeep(x[k]);
        return acc;
      }, {});
    }
    return x;
  }

  const canonical = JSON.stringify(sortDeep(obj));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}
