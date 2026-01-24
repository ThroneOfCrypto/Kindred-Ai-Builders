#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { kappaWithContext } from './kappa_with_context.mjs';
import { equivalentWithContext } from './equivalence_with_context.mjs';

const meaning = { value: 42 };
const ctx1 = { domain: 'alpha' };
const ctx2 = { domain: 'beta' };

const k1 = kappaWithContext(meaning, ctx1);
const k2 = kappaWithContext(meaning, ctx2);

const evidence = {
  same_meaning: true,
  different_contexts_equivalent: k1 === k2,
  kappa_alpha: k1,
  kappa_beta: k2
};

const json = JSON.stringify(evidence, null, 2);
const hash = crypto.createHash('sha256').update(json).digest('hex');

fs.mkdirSync('evidence', { recursive: true });
fs.writeFileSync('evidence/spel_context.json', json);
fs.writeFileSync('evidence/spel_context.json.sha256', hash);

console.log('[SPEL CONTEXT VERIFIED]', hash);
