#!/usr/bin/env node
import crypto from 'node:crypto';

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

/**
 * κ_ctx: canonicalize meaning WITH context
 * Context is prepended into the canonical structure.
 */
export function kappaWithContext(obj, context) {
  if (!context) {
    throw new Error('Context is required');
  }
  const canonical = JSON.stringify({
    context: sortDeep(context),
    meaning: sortDeep(obj)
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}
