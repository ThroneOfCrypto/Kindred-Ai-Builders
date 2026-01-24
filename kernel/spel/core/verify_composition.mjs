import fs from 'node:fs';
import path from 'node:path';
import { composeMeaning } from './compose_meaning.mjs';

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// Minimal deterministic composition evidence.
const A = { a: 1, shared: { x: 1 } };
const B_same = { b: 2, shared: { x: 1 } };
const B_conflict = { b: 2, shared: { x: 2 } };

const report = {
  ok: {},
  expected_failures: {}
};

report.ok.deny_overrides_same = composeMeaning(A, B_same, 'DenyOverrides');
report.ok.permit_overrides_conflict = composeMeaning(A, B_conflict, 'PermitOverrides');

for (const strategy of ['DenyOverrides', 'OnlyOneApplicable']) {
  try {
    composeMeaning(A, B_conflict, strategy);
    report.expected_failures[strategy] = { failed: false, error: null };
  } catch (e) {
    report.expected_failures[strategy] = { failed: true, error: String(e?.message ?? e) };
  }
}

const evidenceDir = path.join(process.cwd(), 'evidence');
ensureDir(evidenceDir);
fs.writeFileSync(path.join(evidenceDir, 'spel_composition.json'), JSON.stringify(report, null, 2));

// Hard assertions: our two failure cases must fail.
if (!report.expected_failures.DenyOverrides?.failed) throw new Error('Expected DenyOverrides conflict to fail');
if (!report.expected_failures.OnlyOneApplicable?.failed) throw new Error('Expected OnlyOneApplicable collision to fail');

console.log('[spel] composition evidence written: evidence/spel_composition.json');
