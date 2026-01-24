"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { strToU8, strFromU8, unzipSync } from "fflate";

import { decodeBase64, encodeBase64 } from "../lib/spec_pack";
import { zipDeterministic } from "../lib/deterministic_zip";
import { stableJsonText } from "../lib/stable_json";
import {
  ProjectIndexEntry,
  archiveProject,
  createProject,
  duplicateProject,
  getCurrentProjectId,
  lastBasePackKeyForProject,
  lastProposalPackKeyForProject,
  listProjects,
  loadProjectStateById,
  renameProject,
  saveProjectStateById,
  setCurrentProjectId,
} from "../lib/state";
import { ProjectState } from "../lib/types";
import { isPackLocked, lockedPackB64KeyForProject, packGovernanceKeyForProject } from "../lib/pack_governance";

function safeFileName(s: string): string {
  const x = String(s || "")
    .trim()
    .replace(/[^a-z0-9\- _]+/gi, "_")
    .replace(/\s+/g, " ")
    .slice(0, 60);
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

function readLocalStorage(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeLocalStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function buildExportZip(project: ProjectIndexEntry, state: ProjectState): Uint8Array {
  const baseB64 = readLocalStorage(lastBasePackKeyForProject(project.id));
  const proposalB64 = readLocalStorage(lastProposalPackKeyForProject(project.id));
  const govRaw = readLocalStorage(packGovernanceKeyForProject(project.id));
  const lockedPackB64 = readLocalStorage(lockedPackB64KeyForProject(project.id));

  const files: Record<string, Uint8Array> = {
    "project.json": strToU8(
      stableJsonText(
        {
          schema: "kindred.project_export.v1",
          exported_at_utc: new Date().toISOString(),
          project,
        },
        2
      )
    ),
    "builder_state.json": strToU8(stableJsonText(state, 2)),
  };

  if (baseB64) {
    try {
      files["packs/base_pack.zip"] = decodeBase64(baseB64);
    } catch {
      // ignore
    }
  }
  if (proposalB64) {
    try {
      files["packs/proposal_pack.zip"] = decodeBase64(proposalB64);
    } catch {
      // ignore
    }
  }

  if (govRaw) {
    try {
      files["governance/pack_governance.json"] = strToU8(govRaw);
    } catch {
      // ignore
    }
  }

  if (lockedPackB64) {
    try {
      files["packs/locked_pack.zip"] = decodeBase64(lockedPackB64);
    } catch {
      // ignore
    }
  }

  return zipDeterministic(files, { level: 6 });
}

function tryParseJson<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function pickBundleProjectName(meta: any, state: any): string {
  const fromMeta = String(meta?.project?.name || "").trim();
  if (fromMeta) return fromMeta;
  const fromState = String(state?.project?.name || "").trim();
  if (fromState) return fromState;
  return "Imported Project";
}

export function ProjectSwitcher() {
  const [projects, setProjects] = useState<ProjectIndexEntry[]>([]);
  const [currentId, setCurrentId] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const current = useMemo(() => projects.find((p) => p.id === currentId) || null, [projects, currentId]);

  function refresh() {
    try {
      const pid = getCurrentProjectId();
      setCurrentId(pid);
      setProjects(listProjects({ includeArchived: false }));
    } catch {
      setProjects([]);
      setCurrentId("");
    }
  }

  useEffect(() => {
    refresh();
    const onAny = () => refresh();
    window.addEventListener("kindred_projects_changed", onAny);
    window.addEventListener("kindred_project_changed", onAny);
    return () => {
      window.removeEventListener("kindred_projects_changed", onAny);
      window.removeEventListener("kindred_project_changed", onAny);
    };
  }, []);

  async function onImportZip(file: File) {
    let bytes: Uint8Array;
    try {
      const buf = await file.arrayBuffer();
      bytes = new Uint8Array(buf);
    } catch {
      alert("Failed to read ZIP.");
      return;
    }

    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipSync(bytes);
    } catch {
      alert("Not a valid ZIP.");
      return;
    }

    const metaRaw = entries["project.json"] ? strFromU8(entries["project.json"]) : "";
    const stateRaw = entries["builder_state.json"] ? strFromU8(entries["builder_state.json"]) : (entries["state.json"] ? strFromU8(entries["state.json"]) : "");

    if (!stateRaw) {
      alert("ZIP is missing builder_state.json.");
      return;
    }

    const meta = metaRaw ? tryParseJson<any>(metaRaw) : null;
    const state = tryParseJson<ProjectState>(stateRaw);
    if (!state || state.schema !== "kindred.builder.state.v1") {
      alert("builder_state.json is not a Kindred Builder state (v1).");
      return;
    }

    const importName = pickBundleProjectName(meta, state);

    const created = createProject(importName);
    const newId = created.id;

    const fixed: ProjectState = {
      ...state,
      project: {
        ...state.project,
        id: newId,
        name: importName,
        created_at_utc: new Date().toISOString(),
      },
    };

    saveProjectStateById(newId, fixed);

    if (entries["packs/base_pack.zip"]) {
      try {
        writeLocalStorage(lastBasePackKeyForProject(newId), encodeBase64(entries["packs/base_pack.zip"]));
      } catch {
        // ignore
      }
    }

    if (entries["packs/proposal_pack.zip"]) {
      try {
        writeLocalStorage(lastProposalPackKeyForProject(newId), encodeBase64(entries["packs/proposal_pack.zip"]));
      } catch {
        // ignore
      }
    }

    // Governance / truth lock (optional)
    if (entries["governance/pack_governance.json"]) {
      try {
        const raw = strFromU8(entries["governance/pack_governance.json"]);
        if (raw.trim()) writeLocalStorage(packGovernanceKeyForProject(newId), raw);
      } catch {
        // ignore
      }
    }

    if (entries["packs/locked_pack.zip"]) {
      try {
        writeLocalStorage(lockedPackB64KeyForProject(newId), encodeBase64(entries["packs/locked_pack.zip"]));
      } catch {
        // ignore
      }
    }

    setCurrentProjectId(newId);
    window.location.reload();
  }

  function onNew() {
    const name = prompt("Project name", "Untitled Project") || "";
    const created = createProject(name);
    setCurrentProjectId(created.id);
    window.location.reload();
  }

  function onRename() {
    if (!current) return;
    const next = prompt("Rename project", current.name) || "";
    if (!next.trim()) return;
    renameProject(current.id, next);
    window.location.reload();
  }

  function onDuplicate() {
    if (!current) return;
    const dup = duplicateProject(current.id);
    if (dup) {
      setCurrentProjectId(dup.id);
      window.location.reload();
    }
  }

  function onArchive() {
    if (!current) return;
    const ok = confirm(`Archive "${current.name}"?`);
    if (!ok) return;
    archiveProject(current.id);
    window.location.reload();
  }

  function onExport() {
    if (!current) return;
    const st = loadProjectStateById(current.id);
    const zip = buildExportZip(current, st);
    const filename = `kindred_project__${safeFileName(current.name)}__${current.id}.zip`;
    downloadBytes(filename, zip, "application/zip");
  }

  function onSwitch(id: string) {
    if (id === currentId) return;
    setCurrentProjectId(id);
    window.location.reload();
  }

  return (
    <details className="projectMenu">
      <summary className="projectSummary">
        <span className="badge">
          <strong>Project</strong>
          <span>{current ? current.name : "(loading...)"}</span>
        </span>

        {current && isPackLocked(current.id) && (
          <span className="badge" style={{ marginLeft: 8 }}>
            <strong>LOCK</strong>
            <span>ED</span>
          </span>
        )}
      </summary>

      <div className="projectDropdown panel" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700 }}>Workspace</div>
            <div className="small">Offline, local-only. Import/export is a ZIP.</div>
          </div>
        </div>

        <div className="hr" />

        <div className="row">
          <button className="btn" onClick={onNew}>
            New
          </button>
          <button className="btn" onClick={onRename} disabled={!current}>
            Rename
          </button>
          <button className="btn" onClick={onDuplicate} disabled={!current}>
            Duplicate
          </button>
          <button className="btn" onClick={onExport} disabled={!current}>
            Export
          </button>
          <button className="btn danger" onClick={onArchive} disabled={!current}>
            Archive
          </button>
        </div>

        <div className="hr" />

        <div className="small" style={{ marginBottom: 8 }}>
          Switch project
        </div>

        <div className="projectList">
          {projects.map((p) => (
            <button
              key={p.id}
              className={`projectRow ${p.id === currentId ? "active" : ""}`}
              onClick={() => onSwitch(p.id)}
              title={p.id}
            >
              <span style={{ fontWeight: 700 }}>{p.name}</span>
              <span className="small" style={{ marginLeft: 8 }}>{p.id.slice(-8)}</span>
            </button>
          ))}
          {projects.length === 0 && <div className="small">No projects yet.</div>}
        </div>

        <div className="hr" />

        <div className="field">
          <label>Import project ZIP</label>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportZip(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
        </div>
      </div>
    </details>
  );
}
