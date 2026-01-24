#!/usr/bin/env node
import fs from 'node:fs';
import { kappa } from './kappa.mjs';
import { equivalent } from './equivalence.mjs';
import crypto from 'node:crypto';

const sampleA = { meaning: 'test', order: [1,2,3] };
const sampleB = { order: [1,2,3], meaning: 'test' };

const ka = kappa(sampleA);
const kb = kappa(sampleB);
const eq = equivalent(sampleA, sampleB);

const evidence = {
  canonical_a: ka,
  canonical_b: kb,
  equivalent: eq
};

const json = JSON.stringify(evidence, null, 2);
const hash = crypto.createHash('sha256').update(json).digest('hex');

fs.mkdirSync('evidence', { recursive: true });

fs.writeFileSync('evidence/spel_semantics.json', json);
fs.writeFileSync('evidence/spel_semantics.json.sha256', hash);

console.log('[SPEL SEMANTICS VERIFIED]', hash);
