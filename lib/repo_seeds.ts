"use client";

import { RepoPackRulesV1 } from "./repo_pack";

export type RepoSeedTemplateId = "kernel_minimal" | "docs_first";

export type RepoSeedToggleId =
  | "include_contracts"
  | "include_docs"
  | "include_src"
  | "include_verify_tools"
  | "include_ci_placeholder";

export type RepoSeedVirtualFile = { path: string; text: string };

export type RepoSeedOptions = {
  repo_name: string;
  template_id: RepoSeedTemplateId;
  toggles: Record<RepoSeedToggleId, boolean>;
};

function normalizeName(name: string): string {
  const n = String(name || "").trim();
  return n || "Untitled Repo";
}

function slug(s: string): string {
  const x = String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 48);
  return x || "repo";
}

function lf(lines: string[]): string {
  return lines.join("\n") + "\n";
}

function baseReadme(repoName: string): string {
  const n = normalizeName(repoName);
  return lf([
    `# ${n}`,
    "",
    "This repository was scaffolded from Kindred AI Builders (Repo Builder v1).",
    "",
    "## What’s here",
    "- `contracts/` — your project’s normative definitions (schemas, milestones, policies)",
    "- `tools/` — local-first scripts (verify, formatting, release helpers)",
    "- `docs/` — operator docs (how to run, deploy, and evolve)",
    "- `src/` — source code (application/library/automation)",
    "",
    "## Next steps",
    "1. Decide what this repo is (app, library, docs, automation).",
    "2. Define your first contracts in `contracts/`.",
    "3. Implement `tools/verify.*` to produce a machine-readable report.",
    "",
    "Kindred’s core stays repo-agnostic. Language/tooling is a later choice (often via Kits).",
  ]);
}

function contractsReadme(): string {
  return lf([
    "# Contracts",
    "",
    "Contracts are the normative truth for this repository.",
    "",
    "Typical contents:",
    "- Schemas (JSON Schema) for artefacts the project emits",
    "- Milestones / definition-of-done",
    "- Policies (security, governance, release rules)",
    "",
    "Keep contracts small, explicit, and versioned.",
  ]);
}

function docsReadme(repoName: string): string {
  const n = normalizeName(repoName);
  return lf([
    `# ${n} docs`,
    "",
    "Operator docs live here.",
    "",
    "Suggested pages:",
    "- `QUICKSTART.md`",
    "- `ARCHITECTURE.md`",
    "- `RUNBOOK.md`",
    "- `RELEASE.md`",
  ]);
}

function docsQuickstart(): string {
  return lf([
    "# Quickstart",
    "",
    "This repo is a scaffold. Replace these steps with real instructions.",
    "",
    "## Verify",
    "Run the local verify script to produce a report:",
    "",
    "```bash",
    "bash tools/verify.sh",
    "```",
    "",
    "The placeholder writes `dist/verify_report.json`.",
  ]);
}

function srcReadme(): string {
  return lf([
    "# Source",
    "",
    "Put your application/library code here.",
    "",
    "Keep the repo kernel-neutral: language/tooling selection is a conscious decision.",
  ]);
}

function verifyScript(): string {
  return lf([
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "# Placeholder local-first verification script.",
    "#",
    "# Replace this with real checks (tests, lint, build, gates) and write a machine-readable report.",
    "",
    "mkdir -p dist",
    "cat > dist/verify_report.json <<'JSON'",
    "{",
    "  \"schema\": \"example.verify_report.v1\",",
    "  \"status\": \"pass\",",
    "  \"generated_at_utc\": \"1980-01-01T00:00:00.000Z\",",
    "  \"notes\": [\"placeholder verify script\"]",
    "}",
    "JSON",
    "",
    "echo \"Wrote dist/verify_report.json\"",
  ]);
}

function gitignore(): string {
  return lf([
    "# build artefacts",
    "dist/",
    "build/",
    "coverage/",
    "",
    "# editor",
    ".DS_Store",
    "*.swp",
  ]);
}

function ciPlaceholder(): string {
  return lf([
    "name: CI",
    "on:",
    "  push:",
    "  pull_request:",
    "jobs:",
    "  verify:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - name: Verify",
    "        run: bash tools/verify.sh",
  ]);
}

export function defaultRepoSeedToggles(): Record<RepoSeedToggleId, boolean> {
  return {
    include_contracts: true,
    include_docs: true,
    include_src: true,
    include_verify_tools: true,
    include_ci_placeholder: false,
  };
}

export function repoSeedTemplates(): Array<{ id: RepoSeedTemplateId; title: string; description: string }> {
  return [
    {
      id: "kernel_minimal",
      title: "Kernel-neutral minimal repo",
      description: "A general scaffold with contracts/tools/docs/src. No language assumptions.",
    },
    {
      id: "docs_first",
      title: "Docs-first repo",
      description: "A documentation-oriented scaffold (heavier docs, lighter src).",
    },
  ];
}

export function buildRepoSeedFiles(opts: RepoSeedOptions): { files: RepoSeedVirtualFile[]; rules: RepoPackRulesV1 } {
  const repoName = normalizeName(opts.repo_name);
  const id = opts.template_id;
  const t = opts.toggles;

  const files: RepoSeedVirtualFile[] = [];
  files.push({ path: "README.md", text: baseReadme(repoName) });
  files.push({ path: ".gitignore", text: gitignore() });

  if (t.include_contracts) {
    files.push({ path: "contracts/README.md", text: contractsReadme() });
    files.push({ path: "contracts/.keep", text: "" });
  }

  if (t.include_docs) {
    files.push({ path: "docs/README.md", text: docsReadme(repoName) });
    files.push({ path: "docs/QUICKSTART.md", text: docsQuickstart() });
  }

  if (t.include_src) {
    files.push({ path: "src/README.md", text: srcReadme() });
  } else if (id === "docs_first") {
    files.push({ path: "src/.keep", text: "" });
  }

  if (t.include_verify_tools) {
    files.push({ path: "tools/verify.sh", text: verifyScript() });
    files.push({ path: "tools/README.md", text: lf(["# Tools", "", "Local-first scripts live here (verify, release helpers, etc.)."]) });
  }

  if (t.include_ci_placeholder) {
    files.push({ path: ".github/workflows/ci.yml", text: ciPlaceholder() });
  }

  // Minimal, safe defaults. Users can widen these later.
  const rules: RepoPackRulesV1 = {
    allow_globs: [],
    deny_globs: [
      "__MACOSX/**",
      ".DS_Store",
      "node_modules/**",
      ".next/**",
      "dist/**",
      "build/**",
      "coverage/**",
      ".git/**",
    ],
    caps: {
      max_file_count: 10000,
      max_total_bytes: 104857600,
      max_file_bytes: 5242880,
      allow_binary: false,
    },
  };

  // Deterministic: keep content stable, avoid embedding timestamps.
  // The repo name influences README only.
  void slug(repoName);

  return { files, rules };
}
