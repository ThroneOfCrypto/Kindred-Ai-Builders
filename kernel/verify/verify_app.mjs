#!/usr/bin/env node
import process from 'node:process';

if (process.env.VERCEL !== '1') {
  console.error('Application layer executes only on Vercel');
  process.exit(1);
}

console.log('[APP VERIFY OK] Vercel execution confirmed');

import '../spel/verify/verify_spel.mjs';
