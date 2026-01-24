"use client";

import React, { useMemo, useState } from "react";

import { Panel } from "../../components/Panel";
import { Callout } from "../../components/Callout";
import { DangerButton } from "../../components/Buttons";

import { RepoPackRulesV1 } from "../../lib/repo_pack";
import {
  defaultRepoPackRules,
  exportRepoPackZip,
  importRepoZipAsPack,
  isRepoPackZip,
  readRepoPackZip,
  RepoPack,
  RepoPackImportError,
} from "../../lib/repo_pack_io";

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

function parseLines(text: string): string[] {
  return String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

type Notice =
  | { kind: "info" | "success" | "warn" | "error"; title: string; details?: string[] }
  | null;

export default function RepoProjectsPage() {

  const [rules, setRules] = useState<RepoPackRulesV1>(() => defaultRepoPackRules());
  const [allowText, setAllowText] = useState<string>(() => defaultRepoPackRules().allow_globs.join("\n"));
  const [denyText, setDenyText] = useState<string>(() => defaultRepoPackRules().deny_globs.join("\n"));

  const [pack, setPack] = useState<RepoPack | null>(null);
  const [lastZipName, setLastZipName] = useState<string>("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const effectiveRules = useMemo<RepoPackRulesV1>(() => {
    return {
      ...rules,
      allow_globs: parseLines(allowText),
      deny_globs: parseLines(denyText),
      caps: {
        ...rules.caps,
        max_file_count: Math.max(0, Math.floor(rules.caps.max_file_count || 0)),
        max_total_bytes: Math.max(0, Math.floor(rules.caps.max_total_bytes || 0)),
        max_file_bytes: Math.max(0, Math.floor(rules.caps.max_file_bytes || 0)),
      },
    };
  }, [rules, allowText, denyText]);

  function clear() {
    setPack(null);
    setLastZipName("");
    setNotice(null);
  }

  function showError(err: RepoPackImportError) {
    const lines = (err.details || []).slice(0, 60);
    const more = err.details && err.details.length > lines.length ? [`…and ${err.details.length - lines.length} more`] : [];
    setNotice({ kind: "error", title: err.message, details: lines.concat(more) });
  }

  async function onUploadZip(file: File) {
    setBusy(true);
    setNotice({ kind: "info", title: "Importing ZIP…" });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setLastZipName(file.name);

      // If it is already a Repo Pack ZIP, load + canonicalize its hash.
      if (isRepoPackZip(bytes)) {
        const r = await readRepoPackZip(bytes);
        if (!r.ok) {
          showError(r.error);
          setBusy(false);
          return;
        }
        setPack(r.pack);
        setNotice({
          kind: r.pack.warnings.length ? "warn" : "success",
          title: r.pack.warnings.length ? "Repo Pack loaded (with warnings)" : "Repo Pack loaded",
          details: r.pack.warnings.slice(0, 12),
        });
        setBusy(false);
        return;
      }

      // Otherwise, normalize a raw repo ZIP into a Repo Pack.
      const r = await importRepoZipAsPack({ zipBytes: bytes, rules: effectiveRules });
      if (!r.ok) {
        showError(r.error);
        setBusy(false);
        return;
      }
      setPack(r.pack);
      setNotice({
        kind: r.pack.warnings.length ? "warn" : "success",
        title: r.pack.warnings.length ? "Repo imported (with warnings)" : "Repo imported",
        details: r.pack.warnings.slice(0, 12),
      });
    } catch (e: any) {
      setNotice({ kind: "error", title: "Import failed", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  function exportNow() {
    if (!pack) return;
    const zip = exportRepoPackZip(pack);
    const short = pack.manifest.repo_id.replace(/^sha256:/, "").slice(0, 12);
    const name = safeFileName(`repo_pack__${short}__${pack.pack_sha256.slice(0, 10)}`) + ".zip";
    downloadBytes(name, zip, "application/zip");
  }

  const fileRows = useMemo(() => {
    if (!pack) return [];
    return pack.files.slice(0, 500);
  }, [pack]);

  return (
    <div className="container">
      <div className="hero">
        <h1>Repo Projects</h1>
        <p>
          Import any repository ZIP, normalize it into a deterministic <strong>Repo Pack</strong>, and export a stable snapshot.
        </p>
        <p className="small">
          Use <a href="/repo-builder">Repo Builder</a> to scaffold a repo from scratch, or <a href="/repo-workbench">Repo Workbench</a> to diff/patch/adopt/lock.
        </p>
      </div>

      {notice && (
        <div style={{ marginBottom: 18 }}>
          <Callout kind={notice.kind} title={notice.title}>
            {notice.details && notice.details.length > 0 ? (
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {notice.details.map((d, idx) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            ) : (
              <></>
            )}
          </Callout>
        </div>
      )}

      <div className="grid">
        <Panel title="Repo Pack import/export">
          <div className="field">
            <label>Import repo ZIP (or Repo Pack ZIP)</label>
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadZip(f);
              }}
            />
            <p className="small">
              Input can be a normal repo ZIP (GitHub download ZIP) or a Kindred Repo Pack ZIP.
            </p>
          </div>

          <div className="row" style={{ alignItems: "center" }}>
            <button className="btn primary" onClick={exportNow} disabled={!pack}>
              Export deterministic Repo Pack ZIP
            </button>
            <button className="btn" onClick={clear} disabled={busy && !!pack}>
              Clear
            </button>
            {pack ? (
              <div className="badge">
                <strong>Pack SHA</strong> <span>{pack.pack_sha256.slice(0, 10)}…</span>
              </div>
            ) : null}
          </div>

          {pack && (
            <div style={{ marginTop: 14 }}>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <div className="badge">
                  <strong>Repo ID</strong> <span>{pack.manifest.repo_id.replace(/^sha256:/, "").slice(0, 12)}…</span>
                </div>
                <div className="badge">
                  <strong>Files</strong> <span>{pack.manifest.totals.file_count}</span>
                </div>
                <div className="badge">
                  <strong>Total</strong> <span>{formatBytes(pack.manifest.totals.total_bytes)}</span>
                </div>
                {lastZipName ? (
                  <div className="badge">
                    <strong>Source</strong> <span>{lastZipName}</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Normalization rules (applied on import)">
          <div className="field">
            <label>allow_globs (one per line; empty = allow all)</label>
            <textarea value={allowText} onChange={(e) => setAllowText(e.target.value)} disabled={busy} />
          </div>

          <div className="field">
            <label>deny_globs (one per line)</label>
            <textarea value={denyText} onChange={(e) => setDenyText(e.target.value)} disabled={busy} />
          </div>

          <div className="field">
            <label>Caps</label>
            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1, minWidth: 170 }}>
                <label className="small">max_file_count</label>
                <input
                  type="number"
                  value={rules.caps.max_file_count}
                  onChange={(e) => setRules({ ...rules, caps: { ...rules.caps, max_file_count: Number(e.target.value) } })}
                  disabled={busy}
                />
              </div>
              <div style={{ flex: 1, minWidth: 170 }}>
                <label className="small">max_total_bytes</label>
                <input
                  type="number"
                  value={rules.caps.max_total_bytes}
                  onChange={(e) => setRules({ ...rules, caps: { ...rules.caps, max_total_bytes: Number(e.target.value) } })}
                  disabled={busy}
                />
              </div>
              <div style={{ flex: 1, minWidth: 170 }}>
                <label className="small">max_file_bytes</label>
                <input
                  type="number"
                  value={rules.caps.max_file_bytes}
                  onChange={(e) => setRules({ ...rules, caps: { ...rules.caps, max_file_bytes: Number(e.target.value) } })}
                  disabled={busy}
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={rules.caps.allow_binary}
                onChange={(e) => setRules({ ...rules, caps: { ...rules.caps, allow_binary: e.target.checked } })}
                disabled={busy}
                style={{ width: "auto", marginRight: 8 }}
              />
              allow_binary
            </label>
            <p className="small" style={{ marginBottom: 0 }}>
              If false, binary files are rejected on import with a recoverable error (flip the toggle or deny the paths).
            </p>
          </div>

          <div className="hr" />

          <DangerButton
            onClick={() => {
              const ok = confirm("Reset rules to defaults?");
              if (!ok) return;
              const d = defaultRepoPackRules();
              setRules(d);
              setAllowText(d.allow_globs.join("\n"));
              setDenyText(d.deny_globs.join("\n"));
            }}
          >
            Reset defaults
          </DangerButton>
        </Panel>
      </div>

      {pack && (
        <div style={{ marginTop: 18 }}>
          <Panel title="Repo Pack viewer">
            <p className="small">
              Files are stored under <code>repo/</code> in the exported ZIP, alongside <code>repo_pack_manifest.json</code>. The
              pack hash is the SHA-256 of the deterministic ZIP bytes.
            </p>

            <div className="row" style={{ marginBottom: 10, alignItems: "center" }}>
              <div className="badge">
                <strong>Created</strong> <span>{pack.manifest.created_at_utc}</span>
              </div>
              <div className="badge">
                <strong>Format</strong> <span>{pack.manifest.repo_pack_version}</span>
              </div>
              <div className="badge">
                <strong>Allow binary</strong> <span>{String(pack.manifest.rules.caps.allow_binary)}</span>
              </div>
            </div>

            {pack.warnings.length > 0 && (
              <Callout kind="warn" title="Warnings" compact>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                  {pack.warnings.slice(0, 20).map((w, i) => (
                    <li key={`${i}-${w}`}>{w}</li>
                  ))}
                  {pack.warnings.length > 20 ? <li>…and {pack.warnings.length - 20} more</li> : null}
                </ul>
              </Callout>
            )}

            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>Size</th>
                    <th>sha256</th>
                    <th>text?</th>
                  </tr>
                </thead>
                <tbody>
                  {fileRows.map((f) => (
                    <tr key={f.path}>
                      <td><code>{f.path}</code></td>
                      <td>{formatBytes(f.size)}</td>
                      <td><code>{f.sha256.slice(0, 12)}…</code></td>
                      <td>{f.is_text ? "yes" : "no"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pack.files.length > 500 ? (
              <p className="small" style={{ marginTop: 10 }}>
                Showing first 500 files (of {pack.files.length}). Export the pack to inspect the full manifest.
              </p>
            ) : null}
          </Panel>
        </div>
      )}
    </div>
  );
}
