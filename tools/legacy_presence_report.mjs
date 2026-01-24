#!/usr/bin/env node
/**
 * Legacy presence report (route-level)
 *
 * Reads docs/LEGACY_SYSTEM_MAP__patched366.v1.json (frozen route lists) and compares
 * them to the routes/pages that exist in THIS repo's Next.js app directory.
 *
 * Presence means: a page.tsx / route.ts exists with that route path.
 * It does not imply behavior is identical.
 */

import fs from 'node:fs';
import path from 'node:path';

function readJson(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const root = process.cwd();
const mapPath = path.join(root, 'docs', 'LEGACY_SYSTEM_MAP__patched366.v1.json');

if (!fs.existsSync(mapPath)) {
  console.error('[legacy:presence] missing legacy snapshot map:', mapPath);
  process.exit(1);
}

const legacy = readJson(mapPath);
const legacyPages = new Set(Array.isArray(legacy.pages) ? legacy.pages : []);
const legacyHandlers = new Set(Array.isArray(legacy.route_handlers) ? legacy.route_handlers : []);

const appDir = path.join(root, 'app');
if (!fs.existsSync(appDir)) {
  console.error('[legacy:presence] missing Next.js app directory:', appDir);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(fp));
    else out.push(fp);
  }
  return out;
}

function relFromApp(fp) {
  return path.relative(appDir, fp).split(path.sep).join('/');
}

function routeFromRel(rel, kind) {
  // kind: 'page' for **/page.tsx, 'handler' for **/route.ts
  // Convert:
  //   page.tsx at '' -> '/'
  //   about/page.tsx -> '/about'
  //   director/[...slug]/page.tsx -> '/director/[...slug]'
  const parts = rel.split('/');
  if (kind === 'page') parts.pop(); // remove page.tsx
  if (kind === 'handler') parts.pop(); // remove route.ts
  const route = '/' + parts.filter(Boolean).join('/');
  return route === '/' ? '/' : route;
}

const files = walk(appDir);
const currentPages = new Set();
const currentHandlers = new Set();

for (const fp of files) {
  if (fp.endsWith('/page.tsx')) currentPages.add(routeFromRel(relFromApp(fp), 'page'));
  if (fp.endsWith('/route.ts')) currentHandlers.add(routeFromRel(relFromApp(fp), 'handler'));
}

const pagesPresent = [...legacyPages].filter(r => currentPages.has(r));
const pagesMissing = [...legacyPages].filter(r => !currentPages.has(r));

const handlersPresent = [...legacyHandlers].filter(r => currentHandlers.has(r));
const handlersMissing = [...legacyHandlers].filter(r => !currentHandlers.has(r));

const report = {
  report_version: 'legacy_presence.report.v2',
  snapshot: legacy.legacy_repo || null,
  totals: {
    pages: { total: legacyPages.size, present: pagesPresent.length, missing: pagesMissing.length },
    route_handlers: { total: legacyHandlers.size, present: handlersPresent.length, missing: handlersMissing.length },
  },
  missing: {
    pages: pagesMissing,
    route_handlers: handlersMissing,
  },
};

const distDir = path.join(root, 'dist');
ensureDir(distDir);
const outPath = path.join(distDir, 'legacy_presence.report.v2.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(
  `[legacy:presence] pages ${pagesPresent.length}/${legacyPages.size} | routes ${handlersPresent.length}/${legacyHandlers.size} | report -> ${path.relative(root, outPath)}`
);
