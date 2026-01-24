"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { appendAiReceipt, estimateTokensFromText, estimateUsdFromUsage, loadAiBudget, preflightAiSpend } from "../../lib/ai_spend";

import { Panel } from "../../components/Panel";
import { Callout } from "../../components/Callout";
import { SecondaryButton, DangerButton } from "../../components/Buttons";
import { Stepper } from "../../components/Stepper";

import { getCurrentProjectId } from "../../lib/state";
import {
  clearRepoWorkbenchPack,
  getRepoWorkbenchPackBytes,
  getLockedRepoPackBytes,
  getRepoWorkbenchPackMeta,
  setRepoWorkbenchPackBytes,
} from "../../lib/repo_pack_bytes_store";
import {
  defaultRepoPackRules,
  createRepoPackFromVirtualFiles,
  exportRepoPackZip,
  importRepoZipAsPack,
  isRepoPackZip,
  readRepoPackZip,
  RepoPack,
  RepoPackImportError,
} from "../../lib/repo_pack_io";
import { getRepoPackGovernance, isRepoPackLocked } from "../../lib/repo_pack_governance";
import { lockFromApplyableRepoPatch } from "../../lib/repo_pack_governance";
import { stableJsonText } from "../../lib/stable_json";
import {
  createDogfoodPatchForBasePack,
  createDogfoodReport,
  getDogfoodReport,
  setDogfoodReport,
} from "../../lib/dogfood";
import { brownfieldScanFromRepoPack, brownfieldReportText } from "../../lib/brownfield_scan";
import { brownfieldHeuristicInferenceV1 } from "../../lib/brownfield_infer";
import { brownfieldRouteMapFromRepoPack, brownfieldRouteMapText, brownfieldSPELSkeletonFromRepoPack } from "../../lib/brownfield_routes";
import { clearBrownfieldReport, getBrownfieldReport, setBrownfieldReport } from "../../lib/brownfield_store";

function safeFileName(s: string): string {
  const x = String(s || "")
    .trim()
    .replace(/[^a-z0-9\- _]+/gi, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return x || "repo_pack";
}

function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
  const blob = new Blob([bytes], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 800);
}

function formatBytes(n: number): string {
  const x = Number(n || 0);
  if (!isFinite(x) || x <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = x;
  while (v >= 1024 && i < units.length - 1) {
    v = v / 1024;
    i += 1;
  }
  const s = i === 0 ? String(Math.round(v)) : v.toFixed(v < 10 ? 2 : 1);
  return `${s} ${units[i]}`;
}

type Notice =
  | { kind: "info" | "success" | "warn" | "error"; title: string; details?: string[] }
  | null;

async function normalizeAnyZipToRepoPack(bytes: Uint8Array): Promise<{ ok: true; pack: RepoPack; zipBytes: Uint8Array } | { ok: false; error: RepoPackImportError }> {
  if (isRepoPackZip(bytes)) {
    const r = await readRepoPackZip(bytes);
    if (!r.ok) return r;
    const canonical = exportRepoPackZip({ manifest: r.pack.manifest, files: r.pack.files });
    return { ok: true, pack: r.pack, zipBytes: canonical };
  }
  const imp = await importRepoZipAsPack({ zipBytes: bytes, rules: defaultRepoPackRules() });
  if (!imp.ok) return imp;
  const canonical = exportRepoPackZip({ manifest: imp.pack.manifest, files: imp.pack.files });
  return { ok: true, pack: imp.pack, zipBytes: canonical };
}

export default function RepoHubPage() {
  const router = useRouter();

  const [projectId, setProjectId] = useState<string>(() => {
    try {
      return getCurrentProjectId();
    } catch {
      return "";
    }
  });

  const [refresh, setRefresh] = useState<number>(0);

  const pid = projectId || "default";

  useEffect(() => {
    const onProjectChange = () => {
      try {
        setProjectId(getCurrentProjectId());
      } catch {
        setProjectId("");
      }
      setRefresh((x) => x + 1);
    };
    const onRefresh = () => setRefresh((x) => x + 1);

    window.addEventListener("kindred_project_changed", onProjectChange);
    window.addEventListener("kindred_repo_workbench_changed", onRefresh);
    window.addEventListener("kindred_repo_governance_changed", onRefresh);
    window.addEventListener("kindred_dogfood_report_changed", onRefresh);
    window.addEventListener("kindred_brownfield_report_changed", onRefresh);
    return () => {
      window.removeEventListener("kindred_project_changed", onProjectChange);
      window.removeEventListener("kindred_repo_workbench_changed", onRefresh);
      window.removeEventListener("kindred_repo_governance_changed", onRefresh);
      window.removeEventListener("kindred_dogfood_report_changed", onRefresh);
      window.removeEventListener("kindred_brownfield_report_changed", onRefresh);
    };
  }, []);

  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const baseMeta = useMemo(() => getRepoWorkbenchPackMeta(pid, "base"), [pid, refresh]);
  const propMeta = useMemo(() => getRepoWorkbenchPackMeta(pid, "proposal"), [pid, refresh]);
  const gov = useMemo(() => getRepoPackGovernance(pid), [pid, refresh]);
  const locked = useMemo(() => isRepoPackLocked(pid), [pid, refresh]);
  const dogfood = useMemo(() => getDogfoodReport(pid), [pid, refresh]);
  const brownfield = useMemo(() => getBrownfieldReport(pid), [pid, refresh]);

  const step = useMemo<"create" | "rules" | "workbench" | "lock">(() => {
    if (!baseMeta) return "create";
    if (!propMeta) return "workbench";
    if (!locked) return "lock";
    return "lock";
  }, [baseMeta, propMeta, locked]);

  async function quickSetBaseZip(file: File) {
    setBusy(true);
    setNotice({ kind: "info", title: "Importing base ZIP…" });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await normalizeAnyZipToRepoPack(bytes);
      if (!r.ok) {
        setNotice({ kind: "error", title: r.error.message, details: r.error.details.slice(0, 40) });
        return;
      }
      await setRepoWorkbenchPackBytes(pid, "base", r.zipBytes, {
        name: file.name || "base",
        repo_id: r.pack.manifest.repo_id,
        pack_sha256: r.pack.pack_sha256,
        total_bytes: r.pack.manifest.totals.total_bytes,
        file_count: r.pack.manifest.totals.file_count,
      });
      setNotice({ kind: "success", title: "Base pack saved", details: r.pack.warnings.length ? r.pack.warnings.slice(0, 12) : undefined });
      router.push("/repo-workbench");
    } catch (e: any) {
      setNotice({ kind: "error", title: "Import failed", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  async function clearBase() {
    setBusy(true);
    try {
      await clearRepoWorkbenchPack(pid, "base");
      setNotice({ kind: "success", title: "Cleared Base" });
    } finally {
      setBusy(false);
    }
  }

  async function clearProposal() {
    setBusy(true);
    try {
      await clearRepoWorkbenchPack(pid, "proposal");
      setNotice({ kind: "success", title: "Cleared Proposal" });
    } finally {
      setBusy(false);
    }
  }

  async function runBrownfieldScan() {
    if (!baseMeta) {
      setNotice({
        kind: "warn",
        title: "Load a Base repo first",
        details: ["Brownfield scan needs a Base Repo Pack.", "Upload an existing repo ZIP above, then scan it."],
      });
      return;
    }

    setBusy(true);
    setNotice({
      kind: "info",
      title: "Scanning Base repo…",
      details: ["This is static analysis. It does not execute code.", "It helps SDDE plan a safe brownfield upgrade."],
    });
    try {
      const baseZipBytes = await getRepoWorkbenchPackBytes(pid, "base");
      if (!baseZipBytes) {
        setNotice({ kind: "error", title: "Base pack bytes missing", details: ["Re-import the Base ZIP and try again."] });
        return;
      }

      const baseRead = await readRepoPackZip(baseZipBytes);
      if (!baseRead.ok) {
        setNotice({ kind: "error", title: baseRead.error.message, details: baseRead.error.details.slice(0, 40) });
        return;
      }

      const report = brownfieldScanFromRepoPack(baseRead.pack);
      setBrownfieldReport(pid, report);

      setNotice({
        kind: "success",
        title: "Brownfield scan complete",
        details: ["Review the summary below.", "Next: move into Repo Workbench to apply a safe patch series."],
      });
    } catch (e: any) {
      setNotice({ kind: "error", title: "Scan failed", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  async function clearBrownfield() {
    setBusy(true);
    try {
      clearBrownfieldReport(pid);
      setNotice({ kind: "success", title: "Cleared Brownfield report" });
    } finally {
      setBusy(false);
    }
  }

  async function downloadBrownfieldRouteMap() {
    if (!baseMeta) {
      setNotice({
        kind: "warn",
        title: "Load a Base repo first",
        details: ["Route map generation needs a Base Repo Pack.", "Use the upload box above to set Base."],
      });
      return;
    }
    setBusy(true);
    setNotice({ kind: "info", title: "Generating route map…", details: ["Static extraction only (no execution)."] });
    try {
      const baseZipBytes = await getRepoWorkbenchPackBytes(pid, "base");
      if (!baseZipBytes) {
        setNotice({ kind: "error", title: "Base pack bytes missing", details: ["Re-import the Base ZIP and try again."] });
        return;
      }
      const baseRead = await readRepoPackZip(baseZipBytes);
      if (!baseRead.ok) {
        setNotice({ kind: "error", title: baseRead.error.message, details: baseRead.error.details.slice(0, 40) });
        return;
      }
      const map = brownfieldRouteMapFromRepoPack(baseRead.pack);
      downloadBytes("brownfield_route_map.json", new TextEncoder().encode(brownfieldRouteMapText(map)), "application/json");
      setNotice({ kind: "success", title: "Route map ready", details: ["Downloaded brownfield_route_map.json"] });
    } catch (e: any) {
      setNotice({ kind: "error", title: "Route map failed", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  async function downloadBrownfieldSPELSkeleton() {
    if (!baseMeta) {
      setNotice({
        kind: "warn",
        title: "Load a Base repo first",
        details: ["SPEL skeleton generation needs a Base Repo Pack.", "Use the upload box above to set Base."],
      });
      return;
    }
    setBusy(true);
    setNotice({
      kind: "info",
      title: "Generating SPEL skeleton…",
      details: ["This is conservative: it extracts routes only.", "It does not infer semantics from your code."],
    });
    try {
      const baseZipBytes = await getRepoWorkbenchPackBytes(pid, "base");
      if (!baseZipBytes) {
        setNotice({ kind: "error", title: "Base pack bytes missing", details: ["Re-import the Base ZIP and try again."] });
        return;
      }
      const baseRead = await readRepoPackZip(baseZipBytes);
      if (!baseRead.ok) {
        setNotice({ kind: "error", title: baseRead.error.message, details: baseRead.error.details.slice(0, 40) });
        return;
      }
      const spel = brownfieldSPELSkeletonFromRepoPack(baseRead.pack);
      downloadBytes("brownfield_spel_skeleton.spel", new TextEncoder().encode(spel), "text/plain");
      setNotice({ kind: "success", title: "SPEL skeleton ready", details: ["Downloaded brownfield_spel_skeleton.spel"] });
    } catch (e: any) {
      setNotice({ kind: "error", title: "SPEL skeleton failed", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }







  async function runBrownfieldInferProposal() {
    if (!baseMeta) {
      setNotice({
        kind: "warn",
        title: "Load a Base repo first",
        details: ["Inference needs a Base Repo Pack.", "Upload an existing repo ZIP above, then infer a proposal pack."],
      });
      return;
    }

    setBusy(true);
    setNotice({
      kind: "info",
      title: "Inferring SPEL proposal…",
      details: ["This creates a Proposal pack. It does not modify Base.", "If AI is enabled, it produces a *proposal* only."],
    });

    try {
      const baseZipBytes = await getRepoWorkbenchPackBytes(pid, "base");
      if (!baseZipBytes) {
        setNotice({ kind: "error", title: "Base pack bytes missing", details: ["Re-import the Base ZIP and try again."] });
        return;
      }

      const baseRead = await readRepoPackZip(baseZipBytes);
      if (!baseRead.ok) {
        setNotice({ kind: "error", title: baseRead.error.message, details: baseRead.error.details.slice(0, 40) });
        return;
      }

      const report = brownfieldScanFromRepoPack(baseRead.pack);
      const route_map = brownfieldRouteMapFromRepoPack(baseRead.pack);

      // Local deterministic baseline.
      const heuristic = brownfieldHeuristicInferenceV1({ report, route_map });

      // Spend preflight (local-only, non-custodial)
      try {
        const inputTok = Math.min(15000, estimateTokensFromText(JSON.stringify({ report, route_map }), 15000));
        const estUsage = {
          prompt_tokens: 1500 + inputTok,
          completion_tokens: 2500,
          total_tokens: 1500 + inputTok + 2500,
        };
        const pf = preflightAiSpend({ estimated_usage: estUsage, route: "/api/ai/brownfield-propose" });
        const fmtUsd = (n: number) => (Number.isFinite(n) ? "$" + (n < 1 ? n.toFixed(4) : n.toFixed(2)) : "$0.00");
        if (!pf.allow) {
          if (pf.hard) {
            setNotice({
              kind: "warn",
              title: "AI inference blocked by hard cap",
              details: [`Est. run=${fmtUsd(pf.estimated_cost_usd)}`, `Window=${fmtUsd(pf.window_total_usd)} / Hard=${fmtUsd(pf.budget.hard_cap_usd)}`, "Adjust caps/rates at /usage."],
            });
            setBusy(false);
            return;
          }
          const ok = confirm(
            `${pf.reason}\n\nThis run is estimated at ${fmtUsd(pf.estimated_cost_usd)}. Your window total is ${fmtUsd(pf.window_total_usd)} (soft cap ${fmtUsd(pf.budget.soft_cap_usd)}).\n\nRun anyway?`
          );
          if (!ok) {
            setNotice({ kind: "info", title: "Cancelled (soft cap)", details: ["Adjust caps/rates at /usage."] });
            setBusy(false);
            return;
          }
        }
      } catch {
        // guard failure shouldn't block
      }

      // Optional AI refinement (server decides mode).
      let inferred = { mode: "offline", palettes: heuristic.palettes, spel: heuristic.spel, notes_md: heuristic.notes_md } as any;
      try {
        const resp = await fetch("/api/ai/brownfield-propose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ report, route_map }),
        });
        const j = await resp.json();
        if (j && j.ok) {
          inferred = j;
          // Local receipt (if provider returned usage)
          try {
            if (j?.usage && typeof j.usage === "object") {
              const usage = {
                prompt_tokens: typeof j.usage.prompt_tokens === "number" ? j.usage.prompt_tokens : undefined,
                completion_tokens: typeof j.usage.completion_tokens === "number" ? j.usage.completion_tokens : undefined,
                total_tokens: typeof j.usage.total_tokens === "number" ? j.usage.total_tokens : undefined,
              };
              const budget = loadAiBudget();
              const estCost = estimateUsdFromUsage(usage, budget);
              appendAiReceipt({
                schema: "kindred.ai_receipt.v1",
                ts_utc: new Date().toISOString(),
                route: "/api/ai/brownfield-propose",
                mode: (j?.mode === "offline" || j?.mode === "hosted" || j?.mode === "local" ? j.mode : "unknown") as any,
                model: typeof j?.model === "string" ? j.model : undefined,
                usage,
                estimated_cost_usd: estCost,
                note: "repo:infer_brownfield",
              });
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore; fall back to heuristic
      }

      // Build a Proposal repo pack: Base files + brownfield evidence + inferred SPEL module.
      const files = baseRead.pack.files.map((f) => ({ path: f.path, bytes: f.bytes }));
      const encoder = new TextEncoder();
      files.push({ path: ".kindred/brownfield/report.v1.json", bytes: encoder.encode(brownfieldReportText(report)) });
      files.push({ path: ".kindred/brownfield/route_map.v1.json", bytes: encoder.encode(brownfieldRouteMapText(route_map)) });
      files.push({ path: ".kindred/brownfield/inferred_module.spel", bytes: encoder.encode(String(inferred?.spel || heuristic.spel)) });
      files.push({ path: ".kindred/brownfield/inference_notes.md", bytes: encoder.encode(String(inferred?.notes_md || heuristic.notes_md)) });
      files.push({
        path: ".kindred/brownfield/inference_receipt.v1.json",
        bytes: encoder.encode(
          stableJsonText(
            {
              schema: "kindred.brownfield_inference_receipt.v1",
              created_utc: "1980-01-01T00:00:00.000Z",
              mode: String(inferred?.mode || "offline"),
              warning: inferred?.warning ? String(inferred.warning) : "",
            },
            2
          )
        ),
      });

      const built = await createRepoPackFromVirtualFiles({
        files,
        rules: baseRead.pack.manifest.rules || defaultRepoPackRules(),
      });

      if (!built.ok) {
        setNotice({ kind: "error", title: "Proposal pack build failed", details: [built.error.message, ...(built.error.details || []).slice(0, 40)] });
        return;
      }

      const zip = exportRepoPackZip(built.pack);
      const ok = await setRepoWorkbenchPackBytes(pid, "proposal", zip, {
        name: safeFileName((baseMeta?.name || "proposal") + "__brownfield_inferred"),
        repo_id: built.pack.manifest.repo_id,
        pack_sha256: built.pack.pack_sha256,
        total_bytes: built.pack.manifest.totals.total_bytes,
        file_count: built.pack.manifest.totals.file_count,
      });

      if (!ok) {
        setNotice({ kind: "error", title: "Failed to store Proposal pack", details: ["IndexedDB write failed. Try again."] });
        return;
      }

      setNotice({
        kind: "success",
        title: "Proposal pack created",
        details: ["Open Repo Workbench to diff Base vs Proposal.", `Inference mode: ${String(inferred?.mode || "offline")}`],
      });
      router.push("/repo-workbench");
    } catch (e: any) {
      setNotice({ kind: "error", title: "Inference failed", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

   async function runDogfood() {
    if (!baseMeta) {
      setNotice({ kind: "warn", title: "Load a Base repo first", details: ["Dogfood mode needs a Base Repo Pack.", "Use the upload box above to set Base."] });
      return;
    }

    setBusy(true);
    setNotice({ kind: "info", title: "Running Dogfood…", details: ["Generating patch, applying, locking, and adopting as new Base."] });
    try {
      const baseZipBytes = await getRepoWorkbenchPackBytes(pid, "base");
      if (!baseZipBytes) {
        setNotice({ kind: "error", title: "Base pack bytes missing", details: ["Re-import the Base ZIP and try again."] });
        return;
      }

      const baseRead = await readRepoPackZip(baseZipBytes);
      if (!baseRead.ok) {
        setNotice({ kind: "error", title: baseRead.error.message, details: baseRead.error.details.slice(0, 40) });
        return;
      }

      const basePack = baseRead.pack;
      const { patch, operation, path } = await createDogfoodPatchForBasePack(basePack);

      const lockedResult = await lockFromApplyableRepoPatch({
        projectId: pid,
        basePack,
        baseZipBytes,
        patch,
      });
      if (!lockedResult.ok) {
        setNotice({ kind: "error", title: lockedResult.error, details: lockedResult.details || [] });
        return;
      }

      // Adopt: set new Base = locked merged pack, clear Proposal.
      await setRepoWorkbenchPackBytes(pid, "base", lockedResult.mergedZip, {
        name: `${baseMeta.name || "base"} (dogfood)`,
        repo_id: lockedResult.mergedPack.manifest.repo_id,
        pack_sha256: lockedResult.mergedPack.pack_sha256,
        total_bytes: lockedResult.mergedPack.manifest.totals.total_bytes,
        file_count: lockedResult.mergedPack.manifest.totals.file_count,
      });
      await clearRepoWorkbenchPack(pid, "proposal");

      const report = await createDogfoodReport({
        projectId: pid,
        basePack,
        operation,
        path,
        patch,
        lockedZipBytes: lockedResult.mergedZip,
        lockedPackSha256: lockedResult.mergedPack.pack_sha256,
        lockedRepoId: lockedResult.mergedPack.manifest.repo_id,
        lockedFileCount: lockedResult.mergedPack.manifest.totals.file_count,
        lockedTotalBytes: lockedResult.mergedPack.manifest.totals.total_bytes,
      });
      setDogfoodReport(pid, report);

      setNotice({
        kind: "success",
        title: "Dogfood complete",
        details: [
          `Changed: ${operation.toUpperCase()} ${path}`,
          `Locked pack_sha256: ${lockedResult.mergedPack.pack_sha256}`,
          "Download the locked pack ZIP and Dogfood report below.",
        ],
      });
    } catch (e: any) {
      setNotice({ kind: "error", title: "Dogfood failed", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }




  return (
    <div className="container">
      <div className="hero">
        <h1>Repos (experimental)</h1>
        <p>
          Repo-as-first-class projects: deterministic Repo Packs, workbench diff/patch/adopt/lock, and seed Kits.
        </p>
      </div>

      {notice ? (
        <Callout title={notice.title} tone={notice.kind === "error" ? "danger" : notice.kind === "warn" ? "warn" : "info"}>
          {notice.details && notice.details.length ? <pre style={{ whiteSpace: "pre-wrap" }}>{notice.details.join("\n")}</pre> : null}
        </Callout>
      ) : null}

      <Stepper
        steps={[
          { id: "create", label: "Create / import" },
          { id: "rules", label: "Rules" },
          { id: "workbench", label: "Workbench" },
          { id: "lock", label: "Lock / export" },
        ]}
        active={step}
      />

      <div className="grid2">
        <Panel title="Current state">
          <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div className="badge">
              <strong>Project</strong> <span>{pid}</span>
            </div>
            <div className="badge">
              <strong>Base</strong> <span>{baseMeta ? "loaded" : "none"}</span>
            </div>
            <div className="badge">
              <strong>Proposal</strong> <span>{propMeta ? "loaded" : "none"}</span>
            </div>
            <div className="badge">
              <strong>Locked</strong> <span>{locked ? "yes" : "no"}</span>
            </div>
          </div>

          {baseMeta ? (
            <div style={{ marginTop: 12 }}>
              <div>
                <strong>Base:</strong> {baseMeta.name}
              </div>
              <div className="small" style={{ opacity: 0.9 }}>
                {baseMeta.repo_id ? `${baseMeta.repo_id}, ` : ""}
                {typeof baseMeta.file_count === "number" ? `${baseMeta.file_count} files, ` : ""}
                {typeof baseMeta.total_bytes === "number" ? `${formatBytes(baseMeta.total_bytes)} ` : ""}
              </div>
            </div>
          ) : null}

          {propMeta ? (
            <div style={{ marginTop: 12 }}>
              <div>
                <strong>Proposal:</strong> {propMeta.name}
              </div>
              <div className="small" style={{ opacity: 0.9 }}>
                {propMeta.repo_id ? `${propMeta.repo_id}, ` : ""}
                {typeof propMeta.file_count === "number" ? `${propMeta.file_count} files, ` : ""}
                {typeof propMeta.total_bytes === "number" ? `${formatBytes(propMeta.total_bytes)} ` : ""}
              </div>
            </div>
          ) : null}

          {gov?.last_locked ? (
            <div style={{ marginTop: 12 }}>
              <div>
                <strong>Last locked:</strong> {gov.last_locked.locked_at_utc}
              </div>
              <div className="small" style={{ opacity: 0.9 }}>
                {gov.last_locked.pack_sha256}
              </div>
            </div>
          ) : null}

          <div className="row" style={{ marginTop: 14, gap: 12, flexWrap: "wrap" }}>
            <SecondaryButton disabled={busy} onClick={() => router.push("/repo-workbench")}>Open Workbench</SecondaryButton>
            <SecondaryButton disabled={busy} onClick={() => router.push("/repo-builder")}>Open Builder</SecondaryButton>
            <SecondaryButton disabled={busy} onClick={() => router.push("/repo-projects")}>Open Rules / Import</SecondaryButton>
            <DangerButton disabled={busy || !baseMeta} onClick={clearBase}>Clear Base</DangerButton>
            <DangerButton disabled={busy || !propMeta} onClick={clearProposal}>Clear Proposal</DangerButton>
          </div>
        </Panel>

        <Panel title="Quick start">
          <p className="small" style={{ marginTop: 0 }}>
            If you already have a repo ZIP (GitHub download ZIP is fine), you can set it as the Base pack and jump straight into Workbench.
          </p>
          <div className="field">
            <label>Upload base repo ZIP</label>
            <input
              disabled={busy}
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void quickSetBaseZip(f);
                e.currentTarget.value = "";
              }}
            />
          </div>

          {gov?.last_locked ? (
            <div style={{ marginTop: 12 }}>
              <SecondaryButton
                disabled={busy}
                onClick={async () => {
                  const bytes = await getLockedRepoPackBytes(pid);
                  if (!bytes) {
                    setNotice({ kind: "warn", title: "Locked pack bytes not available", details: ["Re-lock a snapshot in Repo Workbench to restore the locked ZIP bytes."] });
                    return;
                  }
                  downloadBytes(`locked_repo_pack_${safeFileName(gov.last_locked.pack_sha256)}.zip`, bytes, "application/zip");
                }}
              >
                Download locked pack
              </SecondaryButton>
              <SecondaryButton
                disabled={busy}
                onClick={() => {
                  const json = stableJsonText(gov.last_locked, 2);
                  downloadBytes("locked_repo_pack_snapshot.json", new TextEncoder().encode(json), "application/json");
                }}
              >
                Download snapshot JSON
              </SecondaryButton>
            </div>
          ) : null}
        </Panel>
      </div>


<Panel title="Brownfield scan (existing code intake)">
  <p className="small" style={{ marginTop: 0 }}>
    Brownfield means you already have a codebase. SDDE starts with a deterministic <em>static</em> scan to identify drift risks (lockfiles,
    engines, secrets, monorepo signals) before it proposes any patch series. No code is executed here.
  </p>

  <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
    <SecondaryButton disabled={busy || !baseMeta} onClick={runBrownfieldScan}>
      Run Brownfield scan
    </SecondaryButton>

    <SecondaryButton disabled={busy || !baseMeta} onClick={downloadBrownfieldRouteMap}>
      Download route map
    </SecondaryButton>
    <SecondaryButton disabled={busy || !baseMeta} onClick={downloadBrownfieldSPELSkeleton}>
      Download SPEL skeleton
    </SecondaryButton>

    <SecondaryButton disabled={busy || !baseMeta} onClick={runBrownfieldInferProposal}>
      Infer Proposal pack (SPEL module)
    </SecondaryButton>

    {brownfield ? (
      <>
        <SecondaryButton
          disabled={busy}
          onClick={() => {
            downloadBytes("brownfield_report.json", new TextEncoder().encode(brownfieldReportText(brownfield)), "application/json");
          }}
        >
          Download scan report
        </SecondaryButton>
        <DangerButton disabled={busy} onClick={clearBrownfield}>
          Clear scan report
        </DangerButton>
      </>
    ) : null}
  </div>

  {brownfield ? (
    <div style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div className="badge">
          <strong>Files</strong> <span>{brownfield.totals.file_count}</span>
        </div>
        <div className="badge">
          <strong>Size</strong> <span>{formatBytes(brownfield.totals.total_bytes)}</span>
        </div>
        <div className="badge">
          <strong>Risk</strong>{" "}
          <span>{brownfield.signals.filter((s) => s.severity === "risk").length}</span>
        </div>
        <div className="badge">
          <strong>Warn</strong>{" "}
          <span>{brownfield.signals.filter((s) => s.severity === "warn").length}</span>
        </div>
      </div>

      {brownfield.frameworks.length || brownfield.tooling.length ? (
        <div className="small" style={{ marginTop: 10, opacity: 0.95 }}>
          <div>
            <strong>Frameworks:</strong> {brownfield.frameworks.length ? brownfield.frameworks.join(", ") : "none detected"}
          </div>
          <div>
            <strong>Tooling:</strong> {brownfield.tooling.length ? brownfield.tooling.join(", ") : "none detected"}
          </div>
        </div>
      ) : null}

      {brownfield.signals.length ? (
        <div style={{ marginTop: 10 }}>
          <strong>Signals</strong>
          <ul className="small">
            {brownfield.signals.slice(0, 12).map((s, i) => (
              <li key={i}>
                <code className="md_inline_code">{s.severity}</code> <strong>{s.key}</strong>: {s.value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="small" style={{ opacity: 0.85 }}>
        Next: open <a href="/repo-workbench">Repo Workbench</a> and apply a minimal patch series (engines, lockfile, lanes, receipts) without
        rewriting the app.
      </div>
    </div>
  ) : (
    <div className="small" style={{ marginTop: 12, opacity: 0.9 }}>
      No scan report yet. Upload a Base repo ZIP above, then run the scan.
    </div>
  )}
</Panel>
      <Panel title="Dogfood mode (self-evolution proof)">
        <p className="small" style={{ marginTop: 0 }}>
          Dogfood proves the Repo Pack loop can evolve any repo (including this one) without special cases. It generates a small deterministic patch
          (add/edit <code>docs/DOGFOOD_PROOF.md</code>), applies it, locks the result, and adopts the locked pack as the new Base.
        </p>

        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <SecondaryButton disabled={busy || !baseMeta} onClick={runDogfood}>
            Run Dogfood
          </SecondaryButton>

          {dogfood ? (
            <SecondaryButton
              disabled={busy}
              onClick={() => {
                downloadBytes("dogfood_report.json", new TextEncoder().encode(stableJsonText(dogfood, 2)), "application/json");
              }}
            >
              Download Dogfood report
            </SecondaryButton>
          ) : null}

          {gov?.last_locked ? (
            <SecondaryButton
              disabled={busy}
              onClick={async () => {
                const bytes = await getLockedRepoPackBytes(pid);
                if (!bytes) {
                  setNotice({ kind: "warn", title: "Locked pack bytes not available", details: ["Re-run Dogfood or lock a snapshot in Repo Workbench."] });
                  return;
                }
                downloadBytes(`locked_repo_pack_${safeFileName(gov.last_locked.pack_sha256)}.zip`, bytes, "application/zip");
              }}
            >
              Download locked pack ZIP
            </SecondaryButton>
          ) : null}
        </div>

        {dogfood ? (
          <div style={{ marginTop: 12 }} className="small">
            <div>
              <strong>Last Dogfood:</strong> {dogfood.ran_at_utc}
            </div>
            <div>
              <strong>Base pack:</strong> {dogfood.base.pack_sha256}
            </div>
            <div>
              <strong>Patch ops:</strong> {dogfood.patch.ops_sha256}
            </div>
            <div>
              <strong>Locked pack:</strong> {dogfood.locked.pack_sha256}
            </div>
            <div>
              <strong>Locked ZIP sha:</strong> {dogfood.locked.zip_sha256}
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
