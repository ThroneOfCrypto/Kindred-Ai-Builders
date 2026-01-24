"use client";

export type FailureRuleV1 = {
  id: string;
  title: string;
  // A conservative regex; keep rules stable.
  pattern: RegExp;
  diagnosis: string;
  suggested_actions: string[];
  // Optional: allow a link to a docs page in-app.
  docs_href?: string;
};

// Deterministic, kernel-neutral rules for common build/deploy/runtime failures.
// These are intentionally conservative: they match the *symptom* and suggest
// a small set of safe next actions. No speculative fixes.
//
// NOTE: Rules should remain generic. Provider specifics (Vercel, GitHub, etc.)
// can be described as *optional paths* in Kits or Docs, but the rule itself
// should remain platform-neutral.
export const FAILURE_RULES_V1: FailureRuleV1[] = [
  {
    id: "env_missing_database_url",
    title: "Missing DATABASE_URL / db connection string",
    pattern: /PrismaClientConstructorValidationError[\s\S]*datasource\s+\"db\"[\s\S]*undefined/i,
    diagnosis:
      "A database connection string is missing at runtime/build time. This usually means DATABASE_URL (or the datasource URL env var) is not set in the environment where the build/deploy is running.",
    suggested_actions: [
      "Check the required environment variables for the target repo (DATABASE_URL or datasource URL).",
      "If deploying, set env vars in your deployment environment and redeploy.",
      "If building locally, add a .env file (or export env vars) and rebuild.",
      "If you intentionally do not want a database yet, remove DB-dependent routes from the build target or gate them behind runtime-only execution.",
    ],
    docs_href: "/docs/deploy",
  },
  {
    id: "module_not_found",
    title: "Module not found / import resolution",
    pattern: /Cannot\s+find\s+module\s+['"][^'"]+['"]|Module\s+not\s+found/i,
    diagnosis:
      "A required package/module could not be resolved. This can be caused by a missing dependency, a wrong import path, or a build environment mismatch.",
    suggested_actions: [
      "Run the build locally (or in Codespaces) to reproduce, then verify package.json dependencies and lockfile are present.",
      "Check for incorrect relative imports or case-sensitivity differences (Linux vs macOS).",
      "If using a monorepo or workspaces, confirm the build root and dependency installation path.",
    ],
    docs_href: "/docs/deploy",
  },
  {
    id: "node_version_mismatch",
    title: "Node version mismatch",
    pattern: /(Unsupported\s+engine|requires\s+node\s+version|Node\.js\s+version)/i,
    diagnosis:
      "The build environment is using a Node.js version that doesn't satisfy the project's engine requirements or dependencies.",
    suggested_actions: [
      "Set the Node.js engine version in package.json (engines.node) for the target repo, and ensure your deploy platform honors it.",
      "If using a lockfile, reinstall dependencies under the intended Node version to avoid mismatched native builds.",
    ],
    docs_href: "/docs/deploy",
  },
  {
    id: "nextjs_prerender_api",
    title: "Next.js attempted to prerender an API route / server-only dependency",
    pattern: /(Failed\s+to\s+collect\s+page\s+data|prerender|collect\s+page\s+data)/i,
    diagnosis:
      "Next.js failed while collecting page data. This often happens when a route that should be runtime-only is evaluated during build (e.g., uses server-only environment variables or a DB client).",
    suggested_actions: [
      "Ensure runtime-only code is in route handlers/server components and not executed during static build.",
      "If the target product needs runtime behavior, configure it for dynamic rendering or avoid build-time evaluation.",
      "Confirm required env vars exist at build time when applicable.",
    ],
    docs_href: "/docs/deploy",
  },
];

export type FailureDiagnosisV1 = {
  schema: "kindred.failure_diagnosis.v1";
  matched_rule_ids: string[];
  matched_titles: string[];
  suggested_actions: string[];
};

export function diagnoseFailureV1(logsText: string): FailureDiagnosisV1 {
  const logs = String(logsText || "");
  const matched = FAILURE_RULES_V1.filter((r) => r.pattern.test(logs));

  const ids: string[] = [];
  const titles: string[] = [];
  const actions: string[] = [];

  for (const r of matched) {
    ids.push(r.id);
    titles.push(r.title);
    for (const a of r.suggested_actions) {
      if (!actions.includes(a)) actions.push(a);
    }
  }

  return {
    schema: "kindred.failure_diagnosis.v1",
    matched_rule_ids: ids,
    matched_titles: titles,
    suggested_actions: actions,
  };
}
