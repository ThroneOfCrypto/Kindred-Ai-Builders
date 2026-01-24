"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "../../components/Panel";
import { Callout } from "../../components/Callout";
import { DangerButton, SecondaryButton } from "../../components/Buttons";

import { getCurrentProjectId } from "../../lib/state";
import {
  clearAllRepoWorkbenchPacks,
  clearRepoWorkbenchPack,
  getLockedRepoPackBytes,
  getRepoWorkbenchPackBytes,
  getRepoWorkbenchPackMeta,
  migrateRepoWorkbenchLocalStorageToIndexedDb,
  setRepoWorkbenchPackBytes,
} from "../../lib/repo_pack_bytes_store";
import {
  defaultRepoPackRules,
  exportRepoPackZip,
  importRepoZipAsPack,
  isRepoPackZip,
  readRepoPackZip,
  RepoPack,
  RepoPackImportError,
} from "../../lib/repo_pack_io";
import { diffRepoPacks, buildRepoPackPatchFromPacks } from "../../lib/repo_pack_workbench";
import type { RepoPackPatchV1 } from "../../lib/repo_pack_patch";
import {
  getRepoPackGovernance,
  isRepoPackLocked,
  lockCurrentBaseRepoPack,
  lockFromApplyableRepoPatch,
  unlockRepoPack,
} from "../../lib/repo_pack_governance";
import { stableJsonText } from "../../lib/stable_json";


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

export default function RepoWorkbenchPage() {

  const [projectId, setProjectId] = useState<string>(() => {
    try {
      return getCurrentProjectId();
    } catch {
      return "";
    }
  });

  const pid = projectId || "default";

  useEffect(() => {
    const onChange = () => {
      try {
        setProjectId(getCurrentProjectId());
      } catch {
        setProjectId("");
      }
    };
    window.addEventListener("kindred_project_changed", onChange);
    return () => window.removeEventListener("kindred_project_changed", onChange);
  }, []);

  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const [basePack, setBasePack] = useState<RepoPack | null>(null);
  const [baseZipBytes, setBaseZipBytes] = useState<Uint8Array | null>(null);
  const [baseName, setBaseName] = useState<string>("");

  const [propPack, setPropPack] = useState<RepoPack | null>(null);
  const [propZipBytes, setPropZipBytes] = useState<Uint8Array | null>(null);
  const [propName, setPropName] = useState<string>("");

  const [summary, setSummary] = useState<string>("Repo patch");
  const [patch, setPatch] = useState<RepoPackPatchV1 | null>(null);
  const [diffText, setDiffText] = useState<string>("");
  const [diffStats, setDiffStats] = useState<string>("");

  const [mergedPack, setMergedPack] = useState<RepoPack | null>(null);
  const [mergedZipBytes, setMergedZipBytes] = useState<Uint8Array | null>(null);
  const [mergeWarnings, setMergeWarnings] = useState<string[]>([]);

  const [lockRefresh, setLockRefresh] = useState<number>(0);

  useEffect(() => {
    // Restore workbench state (IndexedDB) scoped per project.
    // Reset all derived state when switching projects.
    setBasePack(null);
    setBaseZipBytes(null);
    setBaseName("");
    setPropPack(null);
    setPropZipBytes(null);
    setPropName("");
    setMergedPack(null);
    setMergedZipBytes(null);
    setMergeWarnings([]);
    setPatch(null);
    setDiffText("");
    setDiffStats("");

    let cancelled = false;
    (async () => {
      // Back-compat: migrate localStorage (v1.0.7 and earlier) to IndexedDB.
      await migrateRepoWorkbenchLocalStorageToIndexedDb(pid);

      try {
        const meta = getRepoWorkbenchPackMeta(pid, "base");
        const bytes = await getRepoWorkbenchPackBytes(pid, "base");
        if (bytes) {
          const r = await normalizeAnyZipToRepoPack(bytes);
          if (!cancelled && r.ok) {
            setBasePack(r.pack);
            setBaseZipBytes(r.zipBytes);
            setBaseName(meta?.name || "base");
          }
        }
      } catch {
        // ignore
      }

      try {
        const meta = getRepoWorkbenchPackMeta(pid, "proposal");
        const bytes = await getRepoWorkbenchPackBytes(pid, "proposal");
        if (bytes) {
          const r = await normalizeAnyZipToRepoPack(bytes);
          if (!cancelled && r.ok) {
            setPropPack(r.pack);
            setPropZipBytes(r.zipBytes);
            setPropName(meta?.name || "proposal");
          }
        }
      } catch {
        // ignore
      }

      setLockRefresh((x) => x + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [pid]);

  useEffect(() => {
    // Compute diff + patch when both sides exist.
    let cancelled = false;
    (async () => {
      if (!basePack || !propPack) {
        setPatch(null);
        setDiffText("");
        setDiffStats("");
        return;
      }
      const d = await diffRepoPacks(basePack, propPack);
      if (cancelled) return;
      setDiffText(d.fullPatch || "(no text diff available)");
      setDiffStats(`added ${d.stats.added}, deleted ${d.stats.deleted}, moved ${d.stats.moved}, edited ${d.stats.edited}, unchanged ${d.stats.unchanged}`);

      const p = await buildRepoPackPatchFromPacks({ base: basePack, proposal: propPack, summary, patch_text: d.fullPatch });
      if (cancelled) return;
      setPatch(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [basePack, propPack, summary]);

  const lockState = useMemo(() => {
    const locked = isRepoPackLocked(pid);
    const gov = getRepoPackGovernance(pid);
    return { locked, gov };
  }, [lockRefresh, pid]);

  async function clearAll() {
    setNotice(null);
    setBasePack(null);
    setBaseZipBytes(null);
    setBaseName("");
    setPropPack(null);
    setPropZipBytes(null);
    setPropName("");
    setPatch(null);
    setDiffText("");
    setDiffStats("");
    setMergedPack(null);
    setMergedZipBytes(null);
    setMergeWarnings([]);
    await clearAllRepoWorkbenchPacks(pid);
  }

  async function clearSide(side: "base" | "proposal") {
    if (side === "base") {
      setBasePack(null);
      setBaseZipBytes(null);
      setBaseName("");
    } else {
      setPropPack(null);
      setPropZipBytes(null);
      setPropName("");
    }
    setPatch(null);
    setDiffText("");
    setDiffStats("");
    setMergedPack(null);
    setMergedZipBytes(null);
    setMergeWarnings([]);
    await clearRepoWorkbenchPack(pid, side);
  }

  function showError(err: RepoPackImportError) {
    const lines = (err.details || []).slice(0, 60);
    const more = err.details && err.details.length > lines.length ? [`…and ${err.details.length - lines.length} more`] : [];
    setNotice({ kind: "error", title: err.message, details: lines.concat(more) });
  }

  async function setSideFromZip(side: "base" | "proposal", file: File) {
    setBusy(true);
    setNotice({ kind: "info", title: `Importing ${side} ZIP…` });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await normalizeAnyZipToRepoPack(bytes);
      if (!r.ok) {
        showError(r.error);
        return;
      }
      if (side === "base") {
        setBasePack(r.pack);
        setBaseZipBytes(r.zipBytes);
        setBaseName(file.name || "base");
        await setRepoWorkbenchPackBytes(pid, "base", r.zipBytes, {
          name: file.name || "base",
          repo_id: r.pack.manifest.repo_id,
          pack_sha256: r.pack.pack_sha256,
          total_bytes: r.pack.manifest.totals.total_bytes,
          file_count: r.pack.manifest.totals.file_count,
        });
      } else {
        setPropPack(r.pack);
        setPropZipBytes(r.zipBytes);
        setPropName(file.name || "proposal");
        await setRepoWorkbenchPackBytes(pid, "proposal", r.zipBytes, {
          name: file.name || "proposal",
          repo_id: r.pack.manifest.repo_id,
          pack_sha256: r.pack.pack_sha256,
          total_bytes: r.pack.manifest.totals.total_bytes,
          file_count: r.pack.manifest.totals.file_count,
        });
      }
      setMergedPack(null);
      setMergedZipBytes(null);
      setMergeWarnings([]);

      setNotice({ kind: "success", title: `Loaded ${side} Repo Pack`, details: r.pack.warnings.length ? r.pack.warnings : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function applyPatchPreview() {
    if (!basePack || !patch) return;
    setBusy(true);
    setNotice({ kind: "info", title: "Applying patch…" });
    try {
      const { applyRepoPatchToPack } = await import("../../lib/repo_pack_workbench");
      const r = await applyRepoPatchToPack(basePack, patch);
      if (!r.ok) {
        setNotice({ kind: "error", title: r.error, details: r.details });
        return;
      }
      setMergedPack(r.mergedPack);
      setMergedZipBytes(r.mergedZip);
      setMergeWarnings(r.warnings);
      setNotice({ kind: "success", title: "Patch applied (preview ready)", details: r.warnings.length ? r.warnings : undefined });
    } finally {
      setBusy(false);
    }
  }

  function adoptPatchedAsBase() {
    if (!mergedPack || !mergedZipBytes) return;
    setBasePack(mergedPack);
    setBaseZipBytes(mergedZipBytes);
    setBaseName(`patched_${safeFileName(baseName || "base")}`);
    setPropPack(null);
    setPropZipBytes(null);
    setPropName("");
    setMergedPack(null);
    setMergedZipBytes(null);
    setMergeWarnings([]);
    void setRepoWorkbenchPackBytes(pid, "base", mergedZipBytes, {
      name: `patched_${safeFileName(baseName || "base")}.zip`,
      repo_id: mergedPack.manifest.repo_id,
      pack_sha256: mergedPack.pack_sha256,
      total_bytes: mergedPack.manifest.totals.total_bytes,
      file_count: mergedPack.manifest.totals.file_count,
    });
    void clearRepoWorkbenchPack(pid, "proposal");
    setNotice({ kind: "success", title: "Adopted patched pack as Base" });
  }

  function adoptProposalAsBase() {
    if (!propPack || !propZipBytes) return;
    setBasePack(propPack);
    setBaseZipBytes(propZipBytes);
    setBaseName(propName || "proposal");
    setPropPack(null);
    setPropZipBytes(null);
    setPropName("");
    setMergedPack(null);
    setMergedZipBytes(null);
    setMergeWarnings([]);
    void setRepoWorkbenchPackBytes(pid, "base", propZipBytes, {
      name: propName || "proposal",
      repo_id: propPack.manifest.repo_id,
      pack_sha256: propPack.pack_sha256,
      total_bytes: propPack.manifest.totals.total_bytes,
      file_count: propPack.manifest.totals.file_count,
    });
    void clearRepoWorkbenchPack(pid, "proposal");
    setNotice({ kind: "success", title: "Adopted Proposal as Base" });
  }

  async function lockBase() {
    if (!basePack || !baseZipBytes) return;
    setBusy(true);
    setNotice({ kind: "info", title: "Locking Base snapshot…" });
    try {
      const r = await lockCurrentBaseRepoPack({ projectId: pid, basePack, baseZipBytes });
      if (!r.ok) {
        setNotice({ kind: "error", title: r.error });
        return;
      }
      setLockRefresh((x) => x + 1);
      setNotice({ kind: "success", title: "Locked Base snapshot" });
    } finally {
      setBusy(false);
    }
  }

  async function lockFromPatch() {
    if (!basePack || !baseZipBytes || !patch) return;
    setBusy(true);
    setNotice({ kind: "info", title: "Applying patch + locking snapshot…" });
    try {
      const r = await lockFromApplyableRepoPatch({ projectId: pid, basePack, baseZipBytes, proposalZipBytes: propZipBytes || undefined, patch });
      if (!r.ok) {
        setNotice({ kind: "error", title: r.error, details: r.details });
        return;
      }
      setMergedPack(r.mergedPack);
      setMergedZipBytes(r.mergedZip);
      setMergeWarnings([]);
      setLockRefresh((x) => x + 1);
      setNotice({ kind: "success", title: "Locked patched snapshot (preview also available)" });
    } finally {
      setBusy(false);
    }
  }

  function unlock() {
    unlockRepoPack(pid);
    setLockRefresh((x) => x + 1);
    setNotice({ kind: "success", title: "Unlocked" });
  }

  const baseSummary = basePack
    ? `${basePack.files.length} files, ${formatBytes(basePack.manifest.totals.total_bytes)}, ${basePack.manifest.repo_id}, pack ${basePack.pack_sha256.slice(0, 12)}…`
    : "";
  const propSummary = propPack
    ? `${propPack.files.length} files, ${formatBytes(propPack.manifest.totals.total_bytes)}, ${propPack.manifest.repo_id}, pack ${propPack.pack_sha256.slice(0, 12)}…`
    : "";
  const mergedSummary = mergedPack
    ? `${mergedPack.files.length} files, ${formatBytes(mergedPack.manifest.totals.total_bytes)}, ${mergedPack.manifest.repo_id}, pack ${mergedPack.pack_sha256.slice(0, 12)}…`
    : "";

  return (
    <div className="container">
      <div className="hero">
        <h1>Repo Workbench (experimental)</h1>
        <p>Deterministic diff → patch ops → apply → adopt → lock for Repo Packs.</p>
      </div>

      {notice ? (
        <Callout title={notice.title} tone={notice.kind === "error" ? "danger" : notice.kind === "warn" ? "warn" : "info"}>
          {notice.details && notice.details.length ? <pre style={{ whiteSpace: "pre-wrap" }}>{notice.details.join("\n")}</pre> : null}
        </Callout>
      ) : null}

      <Panel title="Lock status">
        <div className="row" style={{ alignItems: "center", gap: 12 }}>
          <div>
            <strong>Status:</strong> {lockState.locked ? "locked" : "unlocked"}
          </div>
          <SecondaryButton disabled={busy || !basePack || !baseZipBytes} onClick={lockBase}>
            Lock Base
          </SecondaryButton>
          <SecondaryButton disabled={busy || !basePack || !baseZipBytes || !patch} onClick={lockFromPatch}>
            Apply + Lock (patched)
          </SecondaryButton>
          <SecondaryButton disabled={busy || !lockState.locked} onClick={unlock}>
            Unlock
          </SecondaryButton>
          <DangerButton disabled={busy} onClick={clearAll}>
            Reset Workbench
          </DangerButton>
        </div>
        {lockState.gov?.last_locked ? (
          <div style={{ marginTop: 12 }}>
            <div>
              <strong>Last locked:</strong> {lockState.gov.last_locked.locked_at_utc}
            </div>
            <div>
              <strong>Locked pack:</strong> {lockState.gov.last_locked.pack_sha256}
            </div>
            <div className="row" style={{ marginTop: 8, gap: 12 }}>
              <SecondaryButton
                onClick={async () => {
                  const bytes = await getLockedRepoPackBytes(pid);
                  if (!bytes) {
                    setNotice({
                      kind: "warn",
                      title: "Locked pack bytes not available",
                      details: ["Your browser storage may have been cleared. Re-lock a snapshot to restore the locked ZIP bytes."],
                    });
                    return;
                  }
                  downloadBytes(`locked_repo_pack_${safeFileName(lockState.gov?.last_locked?.pack_sha256 || "")}.zip`, bytes, "application/zip");
                }}
              >
                Download locked pack
              </SecondaryButton>
              <SecondaryButton
                disabled={!lockState.gov?.last_locked}
                onClick={() => {
                  const json = stableJsonText(lockState.gov?.last_locked, 2);
                  downloadBytes("locked_repo_pack_snapshot.json", new TextEncoder().encode(json), "application/json");
                }}
              >
                Download snapshot JSON
              </SecondaryButton>
            </div>
          </div>
        ) : null}
      </Panel>

      <div className="grid2">
        <Panel title="Base Repo Pack">
          {!basePack ? (
            <Callout title="No Base pack" tone="info">
              Upload a Repo Pack ZIP (or any repo ZIP — it will be normalized). You can also use the <a href="/repo-projects">Repo Projects</a> page to tune allow/deny/caps.
            </Callout>
          ) : (
            <div>
              <div>
                <strong>{baseName || "base"}</strong>
              </div>
              <div style={{ opacity: 0.85 }}>{baseSummary}</div>
              {basePack.warnings.length ? <pre style={{ whiteSpace: "pre-wrap" }}>{basePack.warnings.join("\n")}</pre> : null}
              <div className="row" style={{ marginTop: 8, gap: 12 }}>
                <SecondaryButton
                  disabled={busy || !baseZipBytes}
                  onClick={() => {
                    if (!baseZipBytes) return;
                    downloadBytes(`base_repo_pack_${safeFileName(baseName || "base")}.zip`, baseZipBytes, "application/zip");
                  }}
                >
                  Download Base pack
                </SecondaryButton>
                <SecondaryButton disabled={busy} onClick={() => clearSide("base")}>
                  Clear Base
                </SecondaryButton>
              </div>
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <input
              disabled={busy}
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                setSideFromZip("base", f);
                e.currentTarget.value = "";
              }}
            />
          </div>
        </Panel>

        <Panel title="Proposal Repo Pack">
          {!propPack ? (
            <Callout title="No Proposal pack" tone="info">
              Upload a second repo ZIP to compare against Base. The diff will become deterministic patch operations.
            </Callout>
          ) : (
            <div>
              <div>
                <strong>{propName || "proposal"}</strong>
              </div>
              <div style={{ opacity: 0.85 }}>{propSummary}</div>
              {propPack.warnings.length ? <pre style={{ whiteSpace: "pre-wrap" }}>{propPack.warnings.join("\n")}</pre> : null}
              <div className="row" style={{ marginTop: 8, gap: 12 }}>
                <SecondaryButton
                  disabled={busy || !propZipBytes}
                  onClick={() => {
                    if (!propZipBytes) return;
                    downloadBytes(`proposal_repo_pack_${safeFileName(propName || "proposal")}.zip`, propZipBytes, "application/zip");
                  }}
                >
                  Download Proposal pack
                </SecondaryButton>
                <SecondaryButton disabled={busy || !propPack || !propZipBytes} onClick={adoptProposalAsBase}>
                  Adopt Proposal as Base
                </SecondaryButton>
                <SecondaryButton disabled={busy} onClick={() => clearSide("proposal")}>
                  Clear Proposal
                </SecondaryButton>
              </div>
            </div>
          )}

          <div style={{ marginTop: 10 }}>
            <input
              disabled={busy}
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                setSideFromZip("proposal", f);
                e.currentTarget.value = "";
              }}
            />
          </div>
        </Panel>
      </div>

      <Panel title="Diff → Patch ops">
        {!basePack || !propPack ? (
          <Callout title="Need both Base and Proposal" tone="info">
            Upload Base and Proposal packs to compute a deterministic diff and patch operations.
          </Callout>
        ) : (
          <div>
            <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>Stats:</strong> {diffStats}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ opacity: 0.85 }}>Summary:</span>
                <input value={summary} onChange={(e) => setSummary(e.target.value)} style={{ minWidth: 260 }} />
              </div>
              <SecondaryButton disabled={busy || !patch || !basePack} onClick={applyPatchPreview}>
                Apply patch (preview)
              </SecondaryButton>
            </div>

            <div className="grid2" style={{ marginTop: 12 }}>
              <div>
                <details>
                  <summary>
                    <strong>Patch ops JSON</strong> (click to expand)
                  </summary>
                  <pre style={{ whiteSpace: "pre-wrap" }}>{patch ? stableJsonText(patch, 2) : "(no patch)"}</pre>
                </details>
              </div>
              <div>
                <details>
                  <summary>
                    <strong>Unified diff text</strong> (click to expand)
                  </summary>
                  <pre style={{ whiteSpace: "pre-wrap" }}>{diffText}</pre>
                </details>
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Patched preview">
        {!mergedPack ? (
          <Callout title="No patched preview yet" tone="info">
            Click <strong>Apply patch (preview)</strong> to produce a patched Repo Pack, then adopt it as Base or download it.
          </Callout>
        ) : (
          <div>
            <div>
              <strong>Patched pack:</strong> {mergedSummary}
            </div>
            {mergeWarnings.length ? <pre style={{ whiteSpace: "pre-wrap" }}>{mergeWarnings.join("\n")}</pre> : null}
            <div className="row" style={{ marginTop: 10, gap: 12 }}>
              <SecondaryButton
                disabled={busy || !mergedZipBytes}
                onClick={() => {
                  if (!mergedZipBytes) return;
                  downloadBytes(`patched_repo_pack_${safeFileName(baseName || "base")}.zip`, mergedZipBytes, "application/zip");
                }}
              >
                Download patched pack
              </SecondaryButton>
              <SecondaryButton disabled={busy || !mergedPack || !mergedZipBytes} onClick={adoptPatchedAsBase}>
                Adopt patched as Base
              </SecondaryButton>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
