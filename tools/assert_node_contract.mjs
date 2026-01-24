// tools/assert_node_contract.mjs
// Node contract guard.
//
// Why this exists:
// - `engine-strict=true` helps, but it is not uniformly enforced across all environments.
// - Vercel is the authoritative executor for this kernel and must run Node 24.x.
// - Local/dev may run Node 20/22/24, but results are NON-AUTHORITATIVE unless produced on Vercel.

function parseMajor(versionStr) {
  const m = String(versionStr ?? '').match(/^([0-9]+)\./);
  return m ? Number(m[1]) : NaN;
}

const nodeVersion = process.versions.node;
const major = parseMajor(nodeVersion);

const isVercel = process.env.VERCEL === '1';

// Authoritative lane: hard require Node 24.x
if (isVercel) {
  if (major !== 24) {
    const msg = [
      '[kindred-deterministic-core] Node contract violation (authoritative lane).',
      `Detected Node ${nodeVersion} (major ${Number.isFinite(major) ? major : 'unknown'}).`,
      'Vercel execution MUST run Node 24.x for this repo.',
      'Fix: In Vercel Project Settings → Build and Deployment → Node.js Version → select 24.x.',
    ].join('\n');
    console.error(msg);
    process.exit(1);
  }

  // Keep stdout tiny and deterministic.
  process.stdout.write('[kindred-deterministic-core] Node contract OK (VERCEL=1, Node 24.x)\n');
  process.exit(0);
}

// Non-authoritative lane: allow Node 20/22/24 (warn if not 24)
if (![20, 22, 24].includes(major)) {
  const msg = [
    '[kindred-deterministic-core] Node contract violation (local/dev lane).',
    `Detected Node ${nodeVersion} (major ${Number.isFinite(major) ? major : 'unknown'}).`,
    'Local/dev is allowed only on Node 20.x, 22.x, or 24.x.',
    'Vercel-authoritative builds MUST be Node 24.x.',
  ].join('\n');
  console.error(msg);
  process.exit(1);
}

if (major !== 24) {
  console.error(
    `[kindred-deterministic-core] NOTE: Non-authoritative runtime detected (Node ${nodeVersion}).\n` +
      'Authoritative results are only produced on Vercel with Node 24.x.\n'
  );
}

process.stdout.write('[kindred-deterministic-core] Node contract OK (local/dev)\n');
process.exit(0);
