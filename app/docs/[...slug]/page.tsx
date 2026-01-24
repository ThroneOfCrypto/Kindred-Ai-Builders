import fs from "node:fs";
import path from "node:path";

import { Panel } from "../../../components/Panel";
import { Markdown } from "../../../components/Markdown";

type Params = { slug: string[] };

const REPO_ROOT = process.cwd();
const DOCS_ROOT = path.join(REPO_ROOT, "docs");

function slugify(seg: string): string {
  return String(seg || "")
    .toLowerCase()
    .trim()
    .replace(/\.(md|mdx)$/i, "")
    .replace(/__/g, "-")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9\-/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function walkDocs(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop() as string;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        // Never expose internal bootstrap scaffolding.
        if (path.relative(DOCS_ROOT, p).replaceAll(path.sep, "/").toLowerCase().startsWith("internal/")) continue;
        stack.push(p);
      } else if (e.isFile()) {
        if (!/\.mdx?$/i.test(e.name)) continue;
        out.push(p);
      }
    }
  }
  return out;
}

let cachedIndex: Map<string, string> | null = null;

function buildIndex(): Map<string, string> {
  if (cachedIndex) return cachedIndex;
  const idx = new Map<string, string>();
  const files = walkDocs(DOCS_ROOT);

  for (const abs of files) {
    const rel = path.relative(DOCS_ROOT, abs).replaceAll(path.sep, "/");
    if (rel.toLowerCase().startsWith("internal/")) continue;

    const parts = rel.split("/");
    const filename = parts[parts.length - 1];
    const dirParts = parts.slice(0, -1);

    const base = slugify(filename);
    const slugParts = dirParts.map(slugify).filter(Boolean);

    if (base === "readme" && slugParts.length) {
      // docs/director/README.md -> /docs/director
      idx.set(slugParts.join("/"), abs);
    } else {
      idx.set([...slugParts, base].filter(Boolean).join("/"), abs);
    }
  }

  cachedIndex = idx;
  return idx;
}

function resolveDocPath(slugParts: string[]): string | null {
  const key = slugParts.map(slugify).filter(Boolean).join("/");
  const idx = buildIndex();

  // direct hit
  if (idx.has(key)) return idx.get(key) || null;

  // common aliases
  const aliases: Record<string, string> = {
    "director-brief": "director-brief",
    "spec-pack": "spec-pack",
    "market-landscape": "market-landscape",
    "offline-first": "offline-first",
    "feedback-loop": "feedback-loop",
    "release": "release-checklist",
    "deploy": "deploy",
  };

  if (aliases[key] && idx.has(aliases[key])) return idx.get(aliases[key]) || null;

  return null;
}

function readText(p: string): string {
  return fs.readFileSync(p, "utf8");
}

export default function DocsSlugPage({ params }: { params: Params }) {
  const slugParts = params.slug || [];
  const docPath = resolveDocPath(slugParts);

  if (!docPath) {
    return (
      <div className="container">
        <div className="hero">
          <h1>Doc not found</h1>
          <p>That page doesn't exist (yet). The site is allergic to dead links, so this is a bug.</p>
        </div>
        <div className="grid">
          <Panel title="Try these">
            <div className="row">
              <a className="btn" href="/docs">Docs home</a>
              <a className="btn" href="/director">Director Mode</a>
              <a className="btn" href="/operator">Operator Mode</a>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  const markdown = readText(docPath);
  const rel = path.relative(DOCS_ROOT, docPath).replaceAll(path.sep, "/");

  return (
    <div className="container">
      <div className="hero">
        <h1>Docs</h1>
        <p>
          Viewing <code className="md_inline_code">{rel}</code>
        </p>
        <div className="row">
          <a className="btn" href="/docs">Back to docs</a>
          <a className="btn secondary" href="/director">Director</a>
          <a className="btn secondary" href="/operator">Operator</a>
        </div>
      </div>

      <div className="grid">
        <Panel title="Document">
          <Markdown markdown={markdown} />
        </Panel>
      </div>
    </div>
  );
}
