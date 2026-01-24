"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Panel } from "../../components/Panel";
import { Callout } from "../../components/Callout";
import { DangerButton, SecondaryButton } from "../../components/Buttons";

import { getCurrentProjectId } from "../../lib/state";
import { setRepoWorkbenchPackBytes } from "../../lib/repo_pack_bytes_store";
import { getKitById, kitSelectOptions } from "../../lib/kits";
import { addEnabledKit } from "../../lib/project_kits";
import { createRepoPackFromVirtualFiles, RepoPack } from "../../lib/repo_pack_io";
import { buildRepoSeedFiles, defaultRepoSeedToggles, repoSeedTemplates, RepoSeedTemplateId, RepoSeedToggleId } from "../../lib/repo_seeds";

const LS_BUILDER_NAME = "kindred.repo_builder.repo_name.v1";
const LS_BUILDER_KIT = "kindred.repo_builder.kit_id.v1";
const LS_BUILDER_KIT_TEMPLATE = "kindred.repo_builder.kit_template_id.v1";
const LS_BUILDER_TEMPLATE = "kindred.repo_builder.template_id.v1";
const LS_BUILDER_TOGGLES = "kindred.repo_builder.toggles.v1";


function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

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

export default function RepoBuilderPage() {
  const router = useRouter();

  const [projectId, setProjectId] = useState<string>(() => {
    try {
      return getCurrentProjectId();
    } catch {
      return "";
    }
  });

  const pid = projectId || "default";

  React.useEffect(() => {
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

  const [repoName, setRepoName] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_BUILDER_NAME) || "";
    } catch {
      return "";
    }
  });

  
  const [kitId, setKitId] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_BUILDER_KIT) || "";
    } catch {
      return "";
    }
  });

  const [kitTemplateId, setKitTemplateId] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_BUILDER_KIT_TEMPLATE) || "";
    } catch {
      return "";
    }
  });

const [templateId, setTemplateId] = useState<RepoSeedTemplateId>(() => {
    try {
      const raw = localStorage.getItem(LS_BUILDER_TEMPLATE) || "";
      return (raw === "docs_first" || raw === "kernel_minimal") ? raw : "kernel_minimal";
    } catch {
      return "kernel_minimal";
    }
  });

  const [toggles, setToggles] = useState<Record<RepoSeedToggleId, boolean>>(() => {
    const def = defaultRepoSeedToggles();
    try {
      const raw = localStorage.getItem(LS_BUILDER_TOGGLES) || "";
      const parsed = safeJsonParse<any>(raw);
      if (!parsed || typeof parsed !== "object") return def;
      const next: Record<RepoSeedToggleId, boolean> = { ...def };
      (Object.keys(def) as RepoSeedToggleId[]).forEach((k) => {
        if (typeof parsed[k] === "boolean") next[k] = parsed[k];
      });
      return next;
    } catch {
      return def;
    }
  });

  const [pack, setPack] = useState<RepoPack | null>(null);
  const [zipBytes, setZipBytes] = useState<Uint8Array | null>(null);

  const kitOptions = useMemo(() => kitSelectOptions(), []);
  const selectedKit = useMemo(() => getKitById(kitId), [kitId]);
  const selectedKitTemplates = useMemo(() => (selectedKit ? selectedKit.repo_seed_templates : []), [selectedKit]);
  const selectedKitTemplate = useMemo(() => {
    if (!selectedKit) return null;
    return selectedKitTemplates.find((t) => t.id === kitTemplateId) || (selectedKitTemplates.length ? selectedKitTemplates[0] : null);
  }, [selectedKit, selectedKitTemplates, kitTemplateId]);

  const templates = useMemo(() => repoSeedTemplates(), []);

  function persistInputs(nextName: string, nextKitId: string, nextKitTemplateId: string, nextTemplate: RepoSeedTemplateId, nextToggles: Record<RepoSeedToggleId, boolean>) {
    try {
      localStorage.setItem(LS_BUILDER_NAME, nextName);
      localStorage.setItem(LS_BUILDER_KIT, nextKitId);
      localStorage.setItem(LS_BUILDER_KIT_TEMPLATE, nextKitTemplateId);
      localStorage.setItem(LS_BUILDER_TEMPLATE, nextTemplate);
      localStorage.setItem(LS_BUILDER_TOGGLES, JSON.stringify(nextToggles));
    } catch {
      // ignore
    }
  }

  async function generate() {
    const name = String(repoName || "").trim() || "Untitled Repo";
    setBusy(true);
    setNotice({ kind: "info", title: "Generating deterministic Repo Pack…" });
    setPack(null);
    setZipBytes(null);

    try {
      persistInputs(name, kitId, kitTemplateId, templateId, toggles);

      // Record kit usage for backup/export portability.
      try {
        if (kitId) addEnabledKit(pid, kitId);
      } catch {
        // ignore
      }

      let seed:
        | { files: Array<{ path: string; text: string }>; rules: any }
        | { files: Array<{ path: string; text: string }>; rules: any };

      if (selectedKit && selectedKitTemplate) {
        seed = selectedKitTemplate.build({ repo_name: name, toggles });
      } else {
        seed = buildRepoSeedFiles({ repo_name: name, template_id: templateId, toggles });
      }
      const r = await createRepoPackFromVirtualFiles({
        rules: seed.rules,
        files: seed.files.map((f) => ({ path: f.path, text: f.text })),
      });
      if (!r.ok) {
        setNotice({ kind: "error", title: r.error.message, details: r.error.details.slice(0, 30) });
        return;
      }
      setPack(r.pack);
      setZipBytes(r.zipBytes);
      setNotice({ kind: r.pack.warnings.length ? "warn" : "success", title: "Repo Pack generated", details: r.pack.warnings });
    } catch (e: any) {
      setNotice({ kind: "error", title: "Generate failed", details: [String(e?.message || e)] });
    } finally {
      setBusy(false);
    }
  }

  function exportNow() {
    if (!pack || !zipBytes) return;
    const short = pack.manifest.repo_id.replace(/^sha256:/, "").slice(0, 12);
    const name = safeFileName(`repo_pack__${short}__${pack.pack_sha256.slice(0, 10)}`) + ".zip";
    downloadBytes(name, zipBytes, "application/zip");
  }

  async function sendToWorkbenchBase() {
    if (!pack || !zipBytes) return;
    setBusy(true);
    try {
      await setRepoWorkbenchPackBytes(pid, "base", zipBytes, {
        name: `${safeFileName(repoName || "repo")} (generated)`,
        repo_id: pack.manifest.repo_id,
        pack_sha256: pack.pack_sha256,
        total_bytes: pack.manifest.totals.total_bytes,
        file_count: pack.manifest.totals.file_count,
      });
      router.push("/repo-workbench");
    } catch {
      setNotice({ kind: "warn", title: "Could not persist Base pack", details: ["Your browser may not allow IndexedDB storage in this context."] });
    } finally {
      setBusy(false);
    }
  }

  function toggleLabel(id: RepoSeedToggleId): string {
    if (id === "include_contracts") return "Contracts folder";
    if (id === "include_docs") return "Docs folder";
    if (id === "include_src") return "Src folder";
    if (id === "include_verify_tools") return "Include tools/verify placeholder";
    if (id === "include_ci_placeholder") return "Include CI placeholder (.github/workflows)";
    return id;
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Repo Builder</h1>
        <p>Create a deterministic Repo Pack from scratch (no filesystem edits required).</p>
        <p className="small">
          Generated packs can be inspected, diffed, and locked in <a href="/repo-workbench">Repo Workbench</a>.
        </p>
      </div>

      {notice ? (
        <div style={{ marginBottom: 18 }}>
          <Callout kind={notice.kind} title={notice.title}>
            {notice.details && notice.details.length ? (
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {notice.details.map((d, idx) => (
                  <li key={idx}>{d}</li>
                ))}
              </ul>
            ) : null}
          </Callout>
        </div>
      ) : null}

      <div className="grid">
        <Panel title="1) Basics">
          <div className="field">
            <label>Repo name</label>
            <input value={repoName} onChange={(e) => setRepoName(e.target.value)} placeholder="My Repo" disabled={busy} />
            <p className="small">Used in README only. Repo IDs are content-hash based.</p>
          </div>
        </Panel>

        <Panel title="2) Kit">
          <div className="field">
            <label>Kit</label>
            <select
              value={kitId}
              onChange={(e) => {
                const nextKit = String(e.target.value || "");
                const k = getKitById(nextKit);
                const nextKitTemplate = k && k.repo_seed_templates && k.repo_seed_templates.length ? k.repo_seed_templates[0].id : "";
                setKitId(nextKit);
                setKitTemplateId(nextKitTemplate);
                persistInputs(String(repoName || "").trim(), nextKit, nextKitTemplate, templateId, toggles);
              }}
              disabled={busy}
            >
              {kitOptions.map((k) => (
                <option key={k.id || "none"} value={k.id}>
                  {k.title}
                </option>
              ))}
            </select>
            <p className="small">{kitOptions.find((k) => k.id === kitId)?.description || ""}</p>
            {kitId ? (
              <p className="small">
                Selected Kit ID: <code>{kitId}</code>
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel title="3) Seed template">
          {kitId && selectedKit ? (
            <div className="field">
              <label>Kit template</label>
              <select
                value={selectedKitTemplate ? selectedKitTemplate.id : ""}
                onChange={(e) => {
                  const nextTpl = String(e.target.value || "");
                  setKitTemplateId(nextTpl);
                  persistInputs(String(repoName || "").trim(), kitId, nextTpl, templateId, toggles);
                }}
                disabled={busy || selectedKitTemplates.length <= 1}
              >
                {selectedKitTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <p className="small">{selectedKitTemplate?.description || ""}</p>
              <p className="small">
                Templates come from the selected Kit. Core remains repo-agnostic: no SDDE-specific branching in Kindred core code.
              </p>
            </div>
          ) : (
            <div className="field">
              <label>Template</label>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value as RepoSeedTemplateId)} disabled={busy}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <p className="small">{templates.find((t) => t.id === templateId)?.description || ""}</p>
            </div>
          )}</Panel>

        <Panel title="4) Capability toggles">
          <div className="field">
            <label>Include</label>
            <div className="small">
              {(Object.keys(toggles) as RepoSeedToggleId[]).map((k) => (
                <div key={k} className="row" style={{ alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!toggles[k]}
                    disabled={busy || (!!kitId && !!selectedKitTemplate && !selectedKitTemplate.supports_toggles)}
                    onChange={(e) => {
                      const next = { ...toggles, [k]: e.target.checked };
                      setToggles(next);
                      persistInputs(String(repoName || "").trim(), kitId, kitTemplateId, templateId, next);
                    }}
                  />
                  <span>{toggleLabel(k)}</span>
                </div>
              ))}
            </div>
            <p className="small">These are kernel-neutral folders and placeholders. Language/tooling comes later (often via Kits).</p>
            {kitId && selectedKitTemplate && !selectedKitTemplate.supports_toggles ? (
              <p className="small">
                Note: this Kit template controls the scaffold. Capability toggles are disabled for this selection.
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel title="5) Generate">
          <div className="row" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <button className="btn primary" onClick={generate} disabled={busy}>
              Generate Repo Pack
            </button>
            <button className="btn" onClick={exportNow} disabled={!pack || !zipBytes || busy}>
              Download Repo Pack ZIP
            </button>
            <SecondaryButton onClick={sendToWorkbenchBase} disabled={!pack || !zipBytes || busy}>
              Open as Repo Workbench Base
            </SecondaryButton>
            <DangerButton
              onClick={() => {
                setPack(null);
                setZipBytes(null);
                setNotice(null);
              }}
              disabled={busy}
            >
              Clear
            </DangerButton>
          </div>

          {pack ? (
            <div style={{ marginTop: 14 }}>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <div className="badge">
                  <strong>Pack SHA</strong> <span>{pack.pack_sha256.slice(0, 10)}…</span>
                </div>
                <div className="badge">
                  <strong>Repo ID</strong> <span>{pack.manifest.repo_id.replace(/^sha256:/, "").slice(0, 12)}…</span>
                </div>
                <div className="badge">
                  <strong>Files</strong> <span>{pack.manifest.totals.file_count}</span>
                </div>
                <div className="badge">
                  <strong>Total</strong> <span>{formatBytes(pack.manifest.totals.total_bytes)}</span>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <p className="small" style={{ marginBottom: 6 }}>
                  Files (first 120)
                </p>
                <div className="small" style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 10, maxHeight: 260, overflow: "auto" }}>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {pack.files
                      .slice()
                      .sort((a, b) => a.path.localeCompare(b.path))
                      .slice(0, 120)
                      .map((f) => (
                        <li key={f.path}>
                          <code>{f.path}</code> <span style={{ opacity: 0.7 }}>(sha {f.sha256.slice(0, 8)}… · {formatBytes(f.size)})</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
