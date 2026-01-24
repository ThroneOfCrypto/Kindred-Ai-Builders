"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "../../components/Panel";
import { Callout } from "../../components/Callout";
import { PrimaryButton, SecondaryButton } from "../../components/Buttons";

import { APP_VERSION } from "../../lib/version";
import { sha256Hex } from "../../lib/hash";
import { buildProjectBackupZip, restoreProjectBackupZip, type ProjectBackupMetaV2 } from "../../lib/project_backup";
import { getBackupHistory, recordBackupExport, type BackupHistoryV1 } from "../../lib/backup_history";

import { getCurrentProjectId, loadProjectStateById } from "../../lib/state";
import { getPackGovernance, getLockedPackB64 } from "../../lib/pack_governance";
import { loadVerifyStore } from "../../lib/verify";
import { listSnapshots } from "../../lib/snapshots";
import { getDogfoodReport } from "../../lib/dogfood";
import { loadEnabledKits } from "../../lib/project_kits";
import { decodeBase64 } from "../../lib/spec_pack";

import { getRepoPackGovernance } from "../../lib/repo_pack_governance";
import { getRepoWorkbenchPackBytes, getLockedRepoPackBytes } from "../../lib/repo_pack_bytes_store";

type Notice =
  | { kind: "info" | "success" | "warn" | "error"; title: string; details?: string[] }
  | null;

function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
  const blob = new Blob([bytes], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 800);
}

function safeFileName(s: string): string {
  const x = String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]+/g, "-")
    .replace(/\-+/g, "-")
    .slice(0, 60);
  return x || "project";
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

type HealthCheckRow = {
  label: string;
  status: "ok" | "missing" | "warn";
  details?: string;
};

export default function BackupPage() {
  const [projectId, setProjectId] = useState<string>(() => {
    try {
      return getCurrentProjectId();
    } catch {
      return "";
    }
  });

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
  const [backupMeta, setBackupMeta] = useState<ProjectBackupMetaV2 | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupHistoryV1 | null>(null);
  const [restoreMeta, setRestoreMeta] = useState<any>(null);
  const [restoreWarnings, setRestoreWarnings] = useState<string[]>([]);

  const [healthRows, setHealthRows] = useState<HealthCheckRow[] | null>(null);

  const projectName = useMemo(() => {
    if (!projectId) return "";
    try {
      return loadProjectStateById(projectId)?.project?.name || projectId;
    } catch {
      return projectId;
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setBackupHistory(null);
      return;
    }
    const refresh = () => {
      try {
        setBackupHistory(getBackupHistory(projectId));
      } catch {
        setBackupHistory(null);
      }
    };
    refresh();
    window.addEventListener("kindred_backup_history_changed", refresh);
    return () => window.removeEventListener("kindred_backup_history_changed", refresh);
  }, [projectId]);

  async function downloadBackup() {
    if (!projectId) {
      setNotice({ kind: "warn", title: "No current project selected." });
      return;
    }
    setBusy(true);
    setNotice({ kind: "info", title: "Building backup ZIP…" });
    setBackupMeta(null);
    try {
      const r = await buildProjectBackupZip(projectId);
      if (!r.ok) {
        setNotice({ kind: "error", title: r.error, details: r.details });
        return;
      }
      setBackupMeta(r.meta);
      try {
        const hist = await recordBackupExport({ projectId, zipBytes: r.zipBytes, meta: r.meta });
        if (hist) setBackupHistory(hist);
      } catch {
        // ignore
      }
      const date = new Date().toISOString().slice(0, 10);
      const safeName = safeFileName(r.meta.project_name || projectId);
      downloadBytes(`kindred_backup__${safeName}__${projectId}__${date}.zip`, r.zipBytes, "application/zip");
      setNotice({ kind: "success", title: "Backup ZIP downloaded", details: ["Schema: kindred.project_backup.v2", "Restore via this page."] });
    } finally {
      setBusy(false);
    }
  }

  async function onRestoreFile(file: File) {
    if (!file) return;
    setBusy(true);
    setNotice({ kind: "info", title: "Reading backup ZIP…" });
    setRestoreMeta(null);
    setRestoreWarnings([]);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await restoreProjectBackupZip(bytes);
      if (!r.ok) {
        setNotice({ kind: "error", title: r.error, details: r.details });
        return;
      }
      setRestoreMeta(r.meta);
      setRestoreWarnings(r.warnings);
      setNotice({ kind: r.warnings.length ? "warn" : "success", title: "Restore complete", details: r.warnings.length ? r.warnings : ["Project selected and local state restored."] });
    } finally {
      setBusy(false);
    }
  }

  async function runHealthCheck() {
    if (!projectId) {
      setNotice({ kind: "warn", title: "No current project selected." });
      return;
    }
    setBusy(true);
    setNotice({ kind: "info", title: "Running backup health check…" });
    const rows: HealthCheckRow[] = [];
    try {
      // Project state
      try {
        const st = loadProjectStateById(projectId);
        rows.push({ label: "Project state", status: "ok", details: `${st.project?.name || "(unnamed)"} (${projectId})` });
      } catch {
        rows.push({ label: "Project state", status: "missing", details: "Could not read project state." });
      }

      // Spec packs
      let baseB64 = "";
      let proposalB64 = "";
      let lockedB64 = "";
      try {
        baseB64 = localStorage.getItem(`kindred_last_spec_pack_b64_v1:${projectId}`) || "";
      } catch {
        baseB64 = "";
      }
      try {
        proposalB64 = localStorage.getItem(`kindred_last_proposal_pack_b64_v1:${projectId}`) || "";
      } catch {
        proposalB64 = "";
      }
      try {
        lockedB64 = getLockedPackB64(projectId) || "";
      } catch {
        lockedB64 = "";
      }

      if (baseB64) {
        const bytes = decodeBase64(baseB64);
        const h = await sha256Hex(bytes);
        rows.push({ label: "Spec Base pack", status: "ok", details: `${formatBytes(bytes.byteLength)} sha256:${h.slice(0, 12)}…` });
      } else {
        rows.push({ label: "Spec Base pack", status: "missing", details: "No cached Base zip found." });
      }
      if (proposalB64) {
        const bytes = decodeBase64(proposalB64);
        const h = await sha256Hex(bytes);
        rows.push({ label: "Spec Proposal pack", status: "ok", details: `${formatBytes(bytes.byteLength)} sha256:${h.slice(0, 12)}…` });
      } else {
        rows.push({ label: "Spec Proposal pack", status: "missing", details: "No cached Proposal zip found." });
      }
      if (lockedB64) {
        const bytes = decodeBase64(lockedB64);
        const h = await sha256Hex(bytes);
        rows.push({ label: "Spec Locked snapshot", status: "ok", details: `${formatBytes(bytes.byteLength)} sha256:${h.slice(0, 12)}…` });
      } else {
        rows.push({ label: "Spec Locked snapshot", status: "missing", details: "No locked snapshot bytes found." });
      }
      try {
        const gov = getPackGovernance(projectId);
        rows.push({ label: "Spec governance", status: gov ? "ok" : "missing", details: gov ? `locked=${gov.status === "locked" ? "yes" : "no"}` : "No governance record." });
      } catch {
        rows.push({ label: "Spec governance", status: "warn", details: "Could not read governance." });
      }

      // Repo packs (IndexedDB)
      const repoBase = await getRepoWorkbenchPackBytes(projectId, "base");
      if (repoBase) {
        const h = await sha256Hex(repoBase);
        rows.push({ label: "Repo Base pack", status: "ok", details: `${formatBytes(repoBase.byteLength)} sha256:${h.slice(0, 12)}…` });
      } else {
        rows.push({ label: "Repo Base pack", status: "missing", details: "No Base bytes in IndexedDB." });
      }

      const repoProposal = await getRepoWorkbenchPackBytes(projectId, "proposal");
      if (repoProposal) {
        const h = await sha256Hex(repoProposal);
        rows.push({ label: "Repo Proposal pack", status: "ok", details: `${formatBytes(repoProposal.byteLength)} sha256:${h.slice(0, 12)}…` });
      } else {
        rows.push({ label: "Repo Proposal pack", status: "missing", details: "No Proposal bytes in IndexedDB." });
      }

      const repoLocked = await getLockedRepoPackBytes(projectId);
      if (repoLocked) {
        const h = await sha256Hex(repoLocked);
        rows.push({ label: "Repo Locked snapshot", status: "ok", details: `${formatBytes(repoLocked.byteLength)} sha256:${h.slice(0, 12)}…` });
      } else {
        rows.push({ label: "Repo Locked snapshot", status: "missing", details: "No locked Repo bytes in IndexedDB." });
      }

      try {
        const rg = getRepoPackGovernance(projectId);
        rows.push({ label: "Repo governance", status: rg ? "ok" : "missing", details: rg ? `locked=${rg.locked ? "yes" : "no"}` : "No governance record." });
      } catch {
        rows.push({ label: "Repo governance", status: "warn", details: "Could not read Repo governance." });
      }

      // Verify + kits + dogfood + snapshots
      try {
        const store = loadVerifyStore(projectId);
        rows.push({ label: "Verify reports", status: store.reports.length ? "ok" : "missing", details: `${store.reports.length} report(s)` });
      } catch {
        rows.push({ label: "Verify reports", status: "warn", details: "Could not read verify store." });
      }

      try {
        const kits = loadEnabledKits(projectId);
        rows.push({ label: "Enabled kits", status: kits.kit_ids.length ? "ok" : "missing", details: kits.kit_ids.length ? kits.kit_ids.join(", ") : "No kits recorded." });
      } catch {
        rows.push({ label: "Enabled kits", status: "warn", details: "Could not read enabled kits." });
      }

      try {
        const snaps = listSnapshots(projectId);
        rows.push({ label: "Snapshots", status: snaps.length ? "ok" : "missing", details: `${snaps.length} snapshot(s)` });
      } catch {
        rows.push({ label: "Snapshots", status: "warn", details: "Could not list snapshots." });
      }

      try {
        const rep = getDogfoodReport(projectId);
        rows.push({ label: "Dogfood report", status: rep ? "ok" : "missing", details: rep ? rep.overall?.summary || "present" : "Not captured." });
      } catch {
        rows.push({ label: "Dogfood report", status: "warn", details: "Could not read dogfood report." });
      }

      setHealthRows(rows);
      const missing = rows.filter((r) => r.status === "missing").length;
      setNotice({ kind: missing ? "warn" : "success", title: missing ? `Health check: ${missing} missing item(s)` : "Health check: OK", details: missing ? ["Missing items won't be included in a backup."] : ["Everything important is present for export."] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Backup</h1>
        <p>Project export/import (portable ZIP). Includes Spec Packs, Repo Packs (IndexedDB export), and local artefacts.</p>
        <p className="small">App version: <code>{APP_VERSION}</code></p>
      </div>

      {notice ? (
        <div style={{ marginBottom: 18 }}>
          <Callout kind={notice.kind} title={notice.title}>
            {notice.details && notice.details.length ? (
              <ul>
                {notice.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            ) : null}
          </Callout>
        </div>
      ) : null}

      <div className="grid">
        <Panel title="Export (project backup ZIP)">
          <p className="small">
            Current project: <strong>{projectName || projectId || "(none)"}</strong>
          </p>
          <div className="row">
            <PrimaryButton onClick={() => void downloadBackup()} disabled={busy || !projectId}>
              Download backup ZIP
            </PrimaryButton>
            <SecondaryButton onClick={() => void runHealthCheck()} disabled={busy || !projectId}>
              Run health check
            </SecondaryButton>
          </div>
          {backupHistory ? (
            <div className="small" style={{ marginTop: 12 }}>
              <p><strong>Last backup (this device)</strong></p>
              <ul>
                <li>Exported: {backupHistory.last_backup_at_utc}</li>
                <li>ZIP sha256: <code>{backupHistory.backup_zip_sha256.slice(0, 12)}</code>…</li>
                {backupHistory.meta ? (
                  <li>Included: Spec Base={backupHistory.meta.includes.spec.base ? "yes" : "no"}, Repo Base={backupHistory.meta.includes.repo.base ? "yes" : "no"}</li>
                ) : null}
              </ul>
            </div>
          ) : backupMeta ? (
            <div className="small" style={{ marginTop: 12 }}>
              <p><strong>Last export meta</strong></p>
              <ul>
                <li>Schema: {backupMeta.schema}</li>
                <li>Created: {backupMeta.created_at_utc}</li>
                <li>Included: Spec Base={backupMeta.includes.spec.base ? "yes" : "no"}, Repo Base={backupMeta.includes.repo.base ? "yes" : "no"}</li>
              </ul>
            </div>
          ) : (
            <p className="small" style={{ marginTop: 12 }}>No backup exported yet for this project on this device.</p>
          )}
        </Panel>

        <Panel title="Import (restore backup ZIP)">
          <p className="small">Restore a backup ZIP into this browser storage. This does not touch your filesystem or Git repo.</p>
          <input
            type="file"
            accept="application/zip,.zip"
            onChange={(e) => {
              const f = e.target.files && e.target.files.length ? e.target.files[0] : null;
              if (f) void onRestoreFile(f);
              e.currentTarget.value = "";
            }}
            disabled={busy}
          />
          {restoreMeta ? (
            <div className="small" style={{ marginTop: 12 }}>
              <p><strong>Restored meta</strong></p>
              <ul>
                <li>Schema: {String(restoreMeta.schema || "")}</li>
                <li>Project: {String(restoreMeta.project_name || "")} ({String(restoreMeta.project_id || "")})</li>
              </ul>
              {restoreWarnings.length ? (
                <div>
                  <p><strong>Warnings</strong></p>
                  <ul>
                    {restoreWarnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </Panel>

        <Panel title="Backup health check">
          <p className="small">
            This is a local-only check: it tells you what would be included if you exported right now.
          </p>
          {healthRows ? (
            <table className="table" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {healthRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.label}</td>
                    <td>{r.status}</td>
                    <td className="small">{r.details || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="small">Run the health check to see counts and hashes.</p>
          )}
        </Panel>

        <Panel title="Restore test instructions">
          <ol className="small">
            <li>Export a backup ZIP for a project that has Spec Packs + Repo Packs + at least one verify report.</li>
            <li>In a fresh browser profile (or after clearing site data), open <code>/backup</code> and restore the ZIP.</li>
            <li>Check: <code>/workbench</code> shows Base/Proposal + governance; <code>/repo-workbench</code> shows Repo Base/Proposal + governance; <code>/verify</code> shows restored reports.</li>
            <li>Run “Run health check” again: the same items should show present, and hashes should match the backup meta hashes.</li>
          </ol>
          <p className="small">
            If IndexedDB is blocked (private mode, strict browser policy), Repo bytes may not restore — the screen will show warnings.
          </p>
        </Panel>
      </div>
    </div>
  );
}
