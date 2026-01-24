#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import process from 'node:process';

function fail(msg) {
  console.error('[EVIDENCE ERROR]', msg);
  process.exit(1);
}

const name = process.argv[2];
if (!name) fail('Evidence name required');

const payload = {
  name,
  timestamp: new Date(0).toISOString(), // frozen time
  node: process.version,
  env: {
    vercel: process.env.VERCEL === '1'
  }
};

const json = JSON.stringify(payload, null, 2);
const hash = crypto.createHash('sha256').update(json).digest('hex');

const outPath = `evidence/${name}.json`;
fs.writeFileSync(outPath, json);
fs.writeFileSync(`${outPath}.sha256`, hash);

console.log('[EVIDENCE EMITTED]', name, hash);
