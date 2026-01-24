#!/usr/bin/env node
import { kappa } from './kappa.mjs';

export function equivalent(a, b) {
  return kappa(a) === kappa(b);
}
