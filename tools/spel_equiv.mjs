#!/usr/bin/env node
/**
 * SPEL Equivalence checker (deterministic + Vercel-safe).
 *
 * Contract (ported from legacy, adapted to deterministic core):
 *   node tools/spel_equiv.mjs --mode weak|strong A.json B.json --json
 *
 * Weak equivalence:
 *   - κ(A) == κ(B)
 *
 * Strong equivalence:
 *   - κ_ctx(A, ctxA) == κ_ctx(B, ctxB)
 *     where ctxA/ctxB are explicit context JSON objects.
 *
 * Output (deterministic):
 *   - schema: spel.equiv_report.v1
 *   - mode: weak|strong
 *   - equivalent: true|false
 *   - equiv_digest: <sha256 hex>
 *   - reasons: [...] (bounded)
 *
 * Vercel safety:
 *   - Default stdout is compact.
 *   - Full JSON only prints when requested.
 *   - When --out is used, JSON is written to file and stdout remains compact
 *     unless --stdout-json is supplied.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { kappa } from '../kernel/spel/core/kappa.mjs';
import { kappaWithContext } from '../kernel/spel/core/kappa_with_context.mjs';

function sortDeep(x) {
  if (Array.isArray(x)) return x.map(sortDeep);
  if (x && typeof x === 'object') {
    return Object.keys(x).sort().reduce((acc, k) => {
      acc[k] = sortDeep(x[k]);
      return acc;
    }, {});
  }
  return x;
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function readJsonFile(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

function parseArgs(argv) {
  const args = {
    json: false,
    stdoutJson: false,
    mode: null,
    ctxA: null,
    ctxB: null,
    out: null,
    // legacy compatibility
    semantic: false,
    semanticStrong: false,
    help: false,
  };

  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--stdout-json') args.stdoutJson = true;
    else if (a === '--mode') {
      args.mode = String(argv[i + 1] || '').trim();
      if (!args.mode) fail('--mode requires value weak|strong');
      i++;
    }
    else if (a.startsWith('--mode=')) {
      args.mode = String(a.split('=')[1] || '').trim();
    }
    else if (a === '--ctxA') {
      args.ctxA = String(argv[i + 1] || '').trim() || null;
      if (!args.ctxA) fail('--ctxA requires a path');
      i++;
    }
    else if (a === '--ctxB') {
      args.ctxB = String(argv[i + 1] || '').trim() || null;
      if (!args.ctxB) fail('--ctxB requires a path');
      i++;
    }
    else if (a === '--out') {
      args.out = String(argv[i + 1] || '').trim() || null;
      if (!args.out) fail('--out requires a path');
      i++;
    }
    // legacy flags
    else if (a === '--semantic') {
      args.semantic = true;
    }
    else if (a === '--semantic-strong') {
      args.semantic = true;
      args.semanticStrong = true;
    }
    else if (a === '-h' || a === '--help') {
      args.help = true;
    }
    else if (a.startsWith('-')) {
      fail(`unknown flag: ${a}`);
    }
    else {
      positionals.push(a);
    }
  }

  return { args, positionals };
}

function main() {
  const { args, positionals } = parseArgs(process.argv.slice(2));

  if (args.help || positionals.length !== 2) {
    console.log(
      `usage: node tools/spel_equiv.mjs --mode weak|strong <A.json> <B.json> [--json] [--out dist/report.json] [--stdout-json]\n` +
      `       node tools/spel_equiv.mjs <A.json> <B.json> [--json] [--semantic] [--semantic-strong]\n\n` +
      `Weak: κ(A) == κ(B)\n` +
      `Strong: κ_ctx(A, ctxA) == κ_ctx(B, ctxB) (requires --ctxA/--ctxB)\n\n` +
      `Legacy flags kept: --semantic => weak, --semantic-strong => strong\n`
    );
    process.exit(positionals.length === 2 ? 0 : 2);
  }

  const [aPath, bPath] = positionals;

  const mode = (
    args.mode ||
    (args.semanticStrong ? 'strong' : (args.semantic ? 'weak' : null)) ||
    'weak'
  );

  if (mode !== 'weak' && mode !== 'strong') {
    fail(`invalid --mode: ${mode} (expected weak|strong)`);
  }

  const aObj = readJsonFile(aPath);
  const bObj = readJsonFile(bPath);

  const aKappa = kappa(aObj);
  const bKappa = kappa(bObj);

  let aStrong = null;
  let bStrong = null;

  const reasons = [];

  if (mode === 'strong') {
    if (!args.ctxA || !args.ctxB) {
      reasons.push({ code: 'missing_context', detail: 'strong mode requires --ctxA and --ctxB' });
    } else {
      const ctxA = readJsonFile(args.ctxA);
      const ctxB = readJsonFile(args.ctxB);
      aStrong = kappaWithContext(aObj, ctxA);
      bStrong = kappaWithContext(bObj, ctxB);
    }
  }

  let equivalent = false;
  if (mode === 'weak') {
    equivalent = aKappa === bKappa;
    if (!equivalent) reasons.push({ code: 'kappa_mismatch', a: aKappa, b: bKappa });
  } else {
    if (!aStrong || !bStrong) {
      equivalent = false;
    } else {
      equivalent = aStrong === bStrong;
      if (!equivalent) reasons.push({ code: 'kappa_ctx_mismatch', a: aStrong, b: bStrong });
    }
  }

  const boundedReasons = reasons.slice(0, 10);

  const digestInput = sortDeep({
    schema: 'spel.equiv_result.v1',
    mode,
    a: {
      path: aPath,
      kappa_hash_sha256: aKappa,
      kappa_ctx_hash_sha256: aStrong,
    },
    b: {
      path: bPath,
      kappa_hash_sha256: bKappa,
      kappa_ctx_hash_sha256: bStrong,
    },
    equivalent,
  });

  const equivDigest = sha256Hex(JSON.stringify(digestInput));

  const report = {
    schema: 'spel.equiv_report.v1',
    mode,
    equivalent,
    equiv_digest: equivDigest,
    reasons: boundedReasons,
    a: {
      path: aPath,
      kappa_hash_sha256: aKappa,
      kappa_ctx_hash_sha256: aStrong,
    },
    b: {
      path: bPath,
      kappa_hash_sha256: bKappa,
      kappa_ctx_hash_sha256: bStrong,
    },
  };

  // Optional file emission
  if (args.out) {
    const outPath = path.resolve(process.cwd(), args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  }

  // Output selection
  if (args.json) {
    // If output is going to a file and stdout-json isn't explicitly requested,
    // keep stdout compact to protect CI/Vercel log budgets.
    if (args.out && !args.stdoutJson) {
      process.stdout.write(
        JSON.stringify({
          schema: report.schema,
          mode: report.mode,
          equivalent: report.equivalent,
          equiv_digest: report.equiv_digest,
          out: args.out,
        }) + '\n'
      );
    } else {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    }
  } else {
    console.log(`equivalent: ${equivalent ? 'true' : 'false'}`);
    console.log(`mode: ${mode}`);
    console.log(`equiv_digest: ${equivDigest}`);
    if (args.out) console.log(`report: ${args.out}`);
  }

  // Strong mode missing context should be treated as a construction failure.
  if (mode === 'strong' && (!args.ctxA || !args.ctxB)) {
    process.exit(2);
  }
}

main();
