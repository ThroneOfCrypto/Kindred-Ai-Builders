import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assertNodeRange, assertVercelBuildEnvironment } from './vercel_env.mjs';

// This is the single entrypoint for validating SPEL in the *Vercel build environment*.
// It intentionally does three things:
// 1) Assert environment contract (Node major, Vercel signals)
// 2) Run core verifiers that emit machine-checkable evidence
// 3) Fail fast with unambiguous errors (no "maybe passed" nonsense)

const ROOT = process.cwd();

function runVerifier(relPath) {
  const abs = path.join(ROOT, relPath);
  execFileSync(process.execPath, [abs], { stdio: 'inherit' });
}

try {
  assertNodeRange(process.versions.node, { minMajor: 24, maxMajor: 24 });
  assertVercelBuildEnvironment();

  // Core semantics
  runVerifier('app/spel/core/verify_semantics.mjs');

  // Context semantics
  runVerifier('app/spel/core/verify_context.mjs');

  // Composition semantics
  runVerifier('app/spel/core/verify_composition.mjs');

  console.log('SPEL verification passed: environment + semantics + context + composition.');
} catch (err) {
  console.error('SPEL verification failed.');
  console.error(err?.message ?? err);
  process.exit(1);
}
