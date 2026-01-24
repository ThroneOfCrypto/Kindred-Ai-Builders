"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { PrimaryButton, SecondaryButton } from "../../../components/Buttons";

import { getCurrentProjectId, loadProjectStateById } from "../../../lib/state";
import { getRigorConfig, type RigorLevelV1 } from "../../../lib/rigor";
import { buildPublishReadyProofBundleZip } from "../../../lib/publish_ready_bundle";
import { buildProofRequestBundleZip } from "../../../lib/proof_request_bundle";
import { loadSelection } from "../../../lib/library_selection";

function safeFileName(s: string): string {
  const x = String(s || "")
    .trim()
    .replace(/[^a-z0-9\- _]+/gi, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return x || "project";
}

function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
  const blob = new Blob([bytes], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 800);
}

export default function DirectorProofRequestPage() {
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

  const pid = projectId || "default";

  const state = useMemo(() => {
    try {
      return loadProjectStateById(pid) as any;
    } catch {
      return null;
    }
  }, [pid]);

  const projectName = safeFileName(String(state?.project?.name || pid));

  const rigor: RigorLevelV1 = useMemo(() => {
    try {
      return getRigorConfig(pid).level;
    } catch {
      return "safe";
    }
  }, [pid]);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "warn" | "danger"; title: string; details?: string[] } | null>(null);

  const [includeLibraryLock, setIncludeLibraryLock] = useState(true);
  const selectionCount = useMemo(() => {
    try {
      return loadSelection().length;
    } catch {
      return 0;
    }
  }, []);

  async function onDownloadProofRequestBundle() {
    setBusy(true);
    setNotice({ tone: "info", title: "Building Proof Request bundle…" });
    try {
      const pr = await buildPublishReadyProofBundleZip(pid);
      if (!pr.ok) {
        setNotice({ tone: "danger", title: pr.error, details: pr.details });
        return;
      }

      let libraryLockBytes: Uint8Array | undefined;
      let libraryLockEntries = 0;
      if (includeLibraryLock) {
        const sel = loadSelection();
        if (sel.length > 0) {
          const resp = await fetch("/api/library/lockfile", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ items: sel }),
          });
          const j = await resp.json();
          if (j?.ok && j?.lock) {
            const txt = JSON.stringify(j.lock, null, 2) + "\n";
            libraryLockBytes = new TextEncoder().encode(txt);
            libraryLockEntries = Array.isArray(j.lock?.entries) ? j.lock.entries.length : 0;
          }
        }
      }

      const r = await buildProofRequestBundleZip({
        projectId: pid,
        projectName,
        rigor,
        publishReadyZipBytes: pr.zipBytes,
        publishReadyMeta: pr.meta,
        libraryLockJsonBytes: libraryLockBytes,
        libraryLockEntries,
      });

      const date = new Date().toISOString().slice(0, 10);
      const fname = `proof_request_bundle__${projectName}__${date}.zip`;
      downloadBytes(fname, r.zipBytes, "application/zip");

      setNotice({
        tone: r.request.intent === "proof" ? "info" : "warn",
        title: "Proof Request bundle downloaded",
        details: [
          `project_id: ${r.request.project_id}`,
          `rigor: ${r.request.rigor_level}`,
          `node_required: ${r.request.executor_contract.node}`,
          `commands: ${r.request.proof_steps.length}`,
        ],
      });
    } catch (e: any) {
      setNotice({ tone: "danger", title: "Failed to build Proof Request bundle", details: [String(e?.message || e || "unknown error")] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Proof Request</h1>
        <p>
          This creates a single downloadable bundle that a physics-compliant executor (CI or local Node 24) can run to produce authoritative proof evidence.
        </p>
      </div>

      {notice ? (
        <Callout title={notice.title} tone={notice.tone}>
          {notice.details?.length ? <pre className="prewrap">{notice.details.join("\n")}</pre> : null}
        </Callout>
      ) : null}

      <Panel title="Generate bundle">
        <p className="small mb0">
          Current project: <strong>{projectName}</strong> <span className="muted">({pid})</span>
          <br />
          Current rigor: <strong>{rigor}</strong>
        </p>

        <div className="hr" />

        <div className="field">
          <label>
            <input type="checkbox" checked={includeLibraryLock} onChange={(e) => setIncludeLibraryLock(e.target.checked)} />{" "}
            Include Marketplace selection as <code>library.lock.json</code>
          </label>
          <div className="small">
            Current selection: <strong>{selectionCount}</strong> item(s). Add items in <a href="/marketplace">Marketplace</a> or review in{" "}
            <a href="/director/library-lock">Library Lock</a>.
          </div>
        </div>

        <div className="row">
          <PrimaryButton onClick={onDownloadProofRequestBundle} disabled={busy}>
            Download Proof Request bundle
          </PrimaryButton>
          <SecondaryButton href="/director/ship" disabled={busy}>
            Back to Ship
          </SecondaryButton>
        </div>

        <div className="hr" />
        <p className="small">
          After downloading, run the included runner script from this repo:
          <br />
          <code>node tools/run_proof_request_bundle.mjs path/to/proof_request_bundle__*.zip</code>
        </p>
      </Panel>

      <Panel title="What this is (and what it is not)">
        <ul className="small">
          <li>
            <strong>Draft lane:</strong> this page runs in the browser, so it can export state and packs, but it cannot produce authoritative build proofs.
          </li>
          <li>
            <strong>Proof lane:</strong> the runner executes the proof steps on Node 24 and captures evidence logs under <code>dist/evidence/</code>.
          </li>
          <li>
            <strong>Deploy lane:</strong> Vercel is for deployment only. No filesystem writes outside <code>/tmp</code> at runtime.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
