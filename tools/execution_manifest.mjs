#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

const files = fs.readdirSync('evidence').filter(f => f.endsWith('.json'));
const manifest = {};

for (const f of files) {
  const data = fs.readFileSync(`evidence/${f}`, 'utf8');
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  manifest[f] = hash;
}

fs.writeFileSync(
  'evidence/manifest.json',
  JSON.stringify(manifest, null, 2)
);

console.log('[MANIFEST WRITTEN]', Object.keys(manifest).length, 'records');
