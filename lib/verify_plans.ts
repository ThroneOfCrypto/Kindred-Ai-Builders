import { ZIP_MTIME_UTC, APP_VERSION } from "./version";
import type { VerifyPlan } from "./verify";
import { availableKits } from "./kits";

export function builtInVerifyPlans(): VerifyPlan[] {
  const created_at_utc = ZIP_MTIME_UTC;

  const mapping = {
    required_step_fail: "fail" as const,
    required_step_warn: "warn" as const,
    required_step_skip: "warn" as const,
    optional_step_fail: "warn" as const,
    optional_step_warn: "warn" as const,
    all_pass: "pass" as const,
  };

  const manual: VerifyPlan = {
    schema: "kindred.verify_plan.v1",
    plan_id: "manual_v1",
    plan_version: "1.0.0",
    title: "Manual verification (generic)",
    description: "Run your repo’s verification commands locally and record the results.",
    created_at_utc,
    steps: [
      {
        id: "build",
        title: "Build",
        required: true,
        commands: ["<your build command here>"],
        expect: ["Exit code 0"],
      },
    ],
    mapping,
    provenance: {
      app_version: APP_VERSION,
    },
  };

  const nodeBuild: VerifyPlan = {
    schema: "kindred.verify_plan.v1",
    plan_id: "node_build_v1",
    plan_version: "1.0.0",
    title: "Node project build (example)",
    description: "Example plan for a Node-based repo: install deps, build, and lint.",
    created_at_utc,
    steps: [
      {
        id: "install",
        title: "Install dependencies",
        required: true,
        commands: ["npm ci"],
        expect: ["Exit code 0", "No lockfile drift (package-lock.json in sync)."],
      },
      {
        id: "build",
        title: "Build",
        required: true,
        commands: ["npm run build"],
        expect: ["Exit code 0"],
      },
      {
        id: "lint",
        title: "Lint (optional)",
        required: false,
        commands: ["npm run lint"],
        expect: ["Exit code 0"],
      },
    ],
    mapping,
    provenance: {
      app_version: APP_VERSION,
    },
  };

  return [manual, nodeBuild];
}

export function allVerifyPlans(): VerifyPlan[] {
  const base = builtInVerifyPlans();
  const kitPlans = availableKits().flatMap((k) => (k.verify_plans ? k.verify_plans : []));

  // Dedupe by plan_id; kits can override built-ins by shipping a newer plan.
  const byId = new Map<string, VerifyPlan>();
  for (const p of base) byId.set(p.plan_id, p);
  for (const p of kitPlans) byId.set(p.plan_id, p);

  return Array.from(byId.values());
}
