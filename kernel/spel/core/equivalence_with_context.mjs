#!/usr/bin/env node
import { kappaWithContext } from './kappa_with_context.mjs';

export function equivalentWithContext(a, ctxA, b, ctxB) {
  return kappaWithContext(a, ctxA) === kappaWithContext(b, ctxB);
}
