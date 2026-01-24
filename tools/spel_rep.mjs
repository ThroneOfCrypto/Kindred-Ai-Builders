#!/usr/bin/env node
/**
 * SPEL Representative chooser.
 *
 * Given multiple JSON encodings, selects the deterministic representative for the
 * κ-equivalence class ordering by choosing the smallest κ hash (lexicographic).
 *
 * Contract:
 *   node tools/spel_rep.mjs <encoding1.json> [encoding2.json ...] [--json] [--out <path>]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { kappa } from '../kernel/spel/core/kappa.mjs';

function die(msg) {
  console.error(msg);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { json: false, out: null };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--out') {
      args.out = String(argv[i + 1] || '').trim() || null;
      i++;
    } else if (a === '-h' || a === '--help') args.help = true;
    else if (a.startsWith('-')) die(`unknown flag: ${a}`);
    else positionals.push(a);
  }
  return { args, positionals };
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function main() {
  const { args, positionals } = parseArgs(process.argv.slice(2));
  if (args.help || positionals.length < 1) {
    console.log(
      'usage: node tools/spel_rep.mjs <encoding1.json> [encoding2.json ...] [--json] [--out <path>]\n\n' +
      'Chooses the deterministic representative under κ ordering.'
    );
    process.exit(positionals.length >= 1 ? 0 : 2);
  }

  const items = positionals.map((p) => {
    const obj = readJson(p);
    const kh = kappa(obj);
    return { path: p, kappa_hash_sha256: kh };
  });

  items.sort((a, b) => (a.kappa_hash_sha256 < b.kappa_hash_sha256 ? -1 : a.kappa_hash_sha256 > b.kappa_hash_sha256 ? 1 : 0));
  const rep = items[0];

  const digestInput = {
    schema: 'spel.rep_result.v1',
    representative: rep,
    candidates: items,
  };
  const digest = sha256Hex(JSON.stringify(digestInput));

  const report = {
    schema: 'spel.rep_report.v1',
    rep_path: rep.path,
    rep_kappa_hash_sha256: rep.kappa_hash_sha256,
    rep_digest: digest,
    candidates: items,
  };

  if (args.out) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  }

  if (args.json) {
    if (args.out) {
      process.stdout.write(JSON.stringify({ ok: true, out: args.out, rep_path: report.rep_path, rep_kappa_hash_sha256: report.rep_kappa_hash_sha256 }) + '\n');
    } else {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    }
  } else {
    console.log(`rep_path: ${report.rep_path}`);
    console.log(`rep_kappa_hash_sha256: ${report.rep_kappa_hash_sha256}`);
    console.log(`rep_digest: ${report.rep_digest}`);
    if (args.out) console.log(`report: ${args.out}`);
  }
}

main();
