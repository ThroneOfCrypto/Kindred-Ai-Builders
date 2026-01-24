#!/usr/bin/env node
/**
 * target_pack.mjs
 *
 * Emits a deterministic "Target Kit Pack" into dist/target_packs/<kit_id>/.
 *
 * Why this exists:
 * - Option A: this repo is Vercel-only authoritative kernel.
 * - Option B: the wider Kindred system may export repos that target other environments.
 *
 * A Target Kit Pack is a hashable artifact that declares the execution contract
 * for a target lane, without forcing this repo to become multi-platform.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function walkFiles(rootDir) {
  const out = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const full = path.join(rootDir, rel);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(full).sort()) {
        const childRel = rel ? path.join(rel, name) : name;
        stack.push(childRel);
      }
      continue;
    }
    out.push(rel);
  }
  return out.sort();
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function stableJsonStringify(value) {
  // Minimal stable stringify: sorted keys recursively.
  // This is intentionally tiny and dependency-free.
  const seen = new WeakSet();
  const normalize = (v) => {
    if (v === null) return null;
    if (typeof v !== 'object') return v;
    if (seen.has(v)) throw new Error('stableJsonStringify: cycle detected');
    seen.add(v);
    if (Array.isArray(v)) return v.map(normalize);
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = normalize(v[k]);
    return out;
  };
  return JSON.stringify(normalize(value), null, 2) + '\n';
}

function parseArgs(argv) {
  const args = { kit: 'vercel-node24' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--kit' && argv[i + 1]) {
      args.kit = argv[++i];
      continue;
    }
    if (a === '--help' || a === '-h') {
      args.help = true;
      continue;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
if (args.help) {
  process.stdout.write(
    [
      'Usage:',
      '  npm run target:pack -- --kit <kit_id>',
      '',
      'Examples:',
      '  npm run target:pack -- --kit vercel-node24',
      '  npm run target:pack -- --kit docker-node24',
      ''
    ].join('\n')
  );
  process.exit(0);
}

const repoRoot = process.cwd();
const kitPath = path.join(repoRoot, 'kits', args.kit, 'kit.json');
if (!fs.existsSync(kitPath)) {
  process.stderr.write(`[target_pack] ERROR: kit not found: ${kitPath}\n`);
  process.exit(2);
}

const kitRaw = fs.readFileSync(kitPath);
const kit = JSON.parse(kitRaw.toString('utf8'));

const kitDir = path.dirname(kitPath);

const pkgPath = path.join(repoRoot, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const outDir = path.join(repoRoot, 'dist', 'target_packs', args.kit);
fs.mkdirSync(outDir, { recursive: true });

const readme = `# Target Kit Pack: ${kit.kit_id}\n\nThis pack declares an execution contract for an export target lane.\n\n- Repo: ${pkg.name}\n- Kernel version: ${pkg.version}\n- Kit status: ${kit.status}\n\n## Contract\n\n${stableJsonStringify(kit.contract)}\n\n## Notes\n\n- This is a **declarative kit pack**, not a full application export.\n- It exists to preserve the legacy intent (exports can target non-Vercel) while keeping this repo authoritative on Vercel.\n- For details, see: docs/EXPORT_TARGET_KITS.md\n`;

const pack = {
  pack_id: `kitpack:${kit.kit_id}:${pkg.version}`,
  kernel: {
    name: pkg.name,
    version: pkg.version
  },
  kit,
  kit_payload: [],
  files: []
};

// Write outputs deterministically
fs.writeFileSync(path.join(outDir, 'kit.json'), stableJsonStringify(kit));
fs.writeFileSync(path.join(outDir, 'README_TARGET.md'), readme);

// Copy kit payload files (everything in kits/<kit_id>/ except kit.json)
const payloadOutDir = path.join(outDir, 'payload');
fs.mkdirSync(payloadOutDir, { recursive: true });

for (const rel of walkFiles(kitDir)) {
  if (rel === 'kit.json') continue;
  const src = path.join(kitDir, rel);
  const dst = path.join(payloadOutDir, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const buf = fs.readFileSync(src);
  fs.writeFileSync(dst, buf);
  pack.kit_payload.push({
    path: `payload/${rel.replace(/\\/g, '/')}`,
    bytes: buf.length,
    sha256: sha256(buf)
  });
}

// Build manifest with digests
for (const file of ['kit.json', 'README_TARGET.md']) {
  const full = path.join(outDir, file);
  const buf = fs.readFileSync(full);
  pack.files.push({
    path: file,
    bytes: buf.length,
    sha256: sha256(buf)
  });
}

for (const payloadEntry of pack.kit_payload) {
  const full = path.join(outDir, payloadEntry.path);
  const buf = fs.readFileSync(full);
  pack.files.push({
    path: payloadEntry.path,
    bytes: buf.length,
    sha256: sha256(buf)
  });
}

// Deterministic ordering
pack.kit_payload.sort((a, b) => a.path.localeCompare(b.path));
pack.files.sort((a, b) => a.path.localeCompare(b.path));

const packJson = stableJsonStringify(pack);
fs.writeFileSync(path.join(outDir, 'target_kit_pack.v1.json'), packJson);

const digest = sha256(Buffer.from(packJson, 'utf8'));

process.stdout.write(
  `[target_pack] kit=${kit.kit_id} status=${kit.status} digest=${digest} -> dist/target_packs/${args.kit}/target_kit_pack.v1.json\n`
);
