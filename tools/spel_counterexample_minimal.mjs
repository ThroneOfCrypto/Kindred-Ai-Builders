#!/usr/bin/env node
/**
 * Minimal counterexample harness.
 *
 * This enforces an important construction rule:
 *   - Weak equivalence may hold for identical meaning encodings
 *   - Strong equivalence MUST NOT hold when context differs
 *
 * It writes a deterministic report to dist/ and hard-fails if the expected
 * properties do not hold.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function runJsonNode(args, cwd) {
  const res = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`command failed (${args.join(' ')}): ${(res.stderr || res.stdout || '').trim()}`);
  }
  try {
    return JSON.parse((res.stdout || '').trim());
  } catch (e) {
    throw new Error(`failed to parse JSON output: ${(e && e.message) || e}`);
  }
}

function main() {
  const ROOT = process.cwd();
  const dist = path.join(ROOT, 'dist');
  ensureDir(dist);

  // Two files with identical meaning but different declared context.
  const meaning = { schema: 'spel.meaning.v1', payload: { hello: 'world', n: 7 } };
  const A = meaning;
  const B = { payload: { n: 7, hello: 'world' }, schema: 'spel.meaning.v1' };

  const ctxA = { domain: 'alpha', purpose: 'test' };
  const ctxB = { domain: 'beta', purpose: 'test' };

  const aPath = path.join(dist, 'equiv_alpha.meaning.json');
  const bPath = path.join(dist, 'equiv_beta.meaning.json');
  const ctxAPath = path.join(dist, 'equiv_alpha.ctx.json');
  const ctxBPath = path.join(dist, 'equiv_beta.ctx.json');

  fs.writeFileSync(aPath, JSON.stringify(A, null, 2));
  fs.writeFileSync(bPath, JSON.stringify(B, null, 2));
  fs.writeFileSync(ctxAPath, JSON.stringify(ctxA, null, 2));
  fs.writeFileSync(ctxBPath, JSON.stringify(ctxB, null, 2));

  const outWeak = path.join(dist, 'spel_equiv_weak.report.json');
  const outStrong = path.join(dist, 'spel_equiv_strong.report.json');

  const weak = runJsonNode(['tools/spel_equiv.mjs', '--mode', 'weak', aPath, bPath, '--json', '--out', outWeak], ROOT);
  const strong = runJsonNode([
    'tools/spel_equiv.mjs',
    '--mode',
    'strong',
    aPath,
    bPath,
    '--ctxA',
    ctxAPath,
    '--ctxB',
    ctxBPath,
    '--json',
    '--out',
    outStrong,
  ], ROOT);

  // Expectations:
  // - Weak must be equivalent (same meaning under κ)
  // - Strong must be NOT equivalent (different context participates in κ_ctx)
  const expectations = {
    weak_equivalent: true,
    strong_equivalent: false,
  };

  const okWeak = weak?.equivalent === expectations.weak_equivalent;
  const okStrong = strong?.equivalent === expectations.strong_equivalent;

  const report = {
    schema: 'spel.counterexample_minimal_report.v1',
    expectations,
    observed: {
      weak_equivalent: weak?.equivalent,
      strong_equivalent: strong?.equivalent,
    },
    ok: okWeak && okStrong,
    artifacts: {
      meaning_a: aPath,
      meaning_b: bPath,
      ctx_a: ctxAPath,
      ctx_b: ctxBPath,
      weak_report: outWeak,
      strong_report: outStrong,
    },
  };

  const out = path.join(dist, 'spel_counterexample_minimal.report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  if (!okWeak) throw new Error('Counterexample failed: weak equivalence expected true but was false');
  if (!okStrong) throw new Error('Counterexample failed: strong equivalence expected false but was true');

  console.log('[spel] minimal counterexample ok:', out);
}

main();
