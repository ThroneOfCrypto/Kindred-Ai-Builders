"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { PrimaryButton, SecondaryButton } from "../../../components/Buttons";
import { WireframePreview } from "../../../components/WireframePreview";

import { getCurrentProjectId, loadProjectStateById, saveProjectStateById } from "../../../lib/state";
import type { ProjectState } from "../../../lib/types";
import { compileBlueprintPackFromState, type BlueprintPackV1, type BlueprintPageV1 } from "../../../lib/blueprint_pack";
import {
  getBlueprintPackMeta,
  getLatestBlueprintPackJson,
  setLatestBlueprintPack,
  type BlueprintPackStoreMetaV1,
} from "../../../lib/blueprint_pack_store";

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function clampIndex(n: number, max: number): number {
  if (!Number.isFinite(n)) return 0;
  if (max <= 0) return 0;
  if (n < 0) return 0;
  if (n >= max) return max - 1;
  return n;
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type PageRow = { page: BlueprintPageV1; depth: number };

function orderPagesForDisplay(pages: BlueprintPageV1[]): PageRow[] {
  const byId = new Map<string, BlueprintPageV1>();
  for (const p of pages) byId.set(String(p.id || ""), p);

  const children = new Map<string, BlueprintPageV1[]>();
  const ROOT = "__root__";

  function keyForParent(maybeParent: string | null | undefined): string {
    const pid = String(maybeParent || "").trim();
    return pid && byId.has(pid) ? pid : ROOT;
  }

  for (const p of pages) {
    const k = keyForParent(p.parent_id);
    const arr = children.get(k) || [];
    arr.push(p);
    children.set(k, arr);
  }

  for (const [k, arr] of children.entries()) {
    arr.sort((a, b) => {
      const ar = String(a.route_path || "");
      const br = String(b.route_path || "");
      if (ar && br && ar !== br) return ar.localeCompare(br);
      const at = String(a.title || "");
      const bt = String(b.title || "");
      if (at && bt && at !== bt) return at.localeCompare(bt);
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }

  const out: PageRow[] = [];

  function walk(parentKey: string, depth: number) {
    const arr = children.get(parentKey) || [];
    for (const p of arr) {
      out.push({ page: p, depth });
      walk(String(p.id || ""), depth + 1);
    }
  }

  walk(ROOT, 0);
  return out;
}

export default function DirectorBlueprintsPage() {
  const [projectId, setProjectId] = useState<string>("");
  const [state, setState] = useState<ProjectState | null>(null);

  const [status, setStatus] = useState<{ kind: "info" | "success" | "warn" | "error"; text: string } | null>(null);

  const [bpJson, setBpJson] = useState<string>("");
  const [bp, setBp] = useState<BlueprintPackV1 | null>(null);
  const [meta, setMeta] = useState<BlueprintPackStoreMetaV1 | null>(null);

  const [selectedVariantId, setSelectedVariantId] = useState<string>("balanced");
  const [selectedPageId, setSelectedPageId] = useState<string>("home");
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number>(0);

  async function loadFromStore(pid: string) {
    const json = await getLatestBlueprintPackJson(pid);
    const m = getBlueprintPackMeta(pid);
    setMeta(m);
    if (!json) {
      setBpJson("");
      setBp(null);
      return;
    }
    const parsed = safeJsonParse<any>(json);
    if (!parsed || parsed.schema !== "kindred.blueprint_pack.v1") {
      setBpJson(json);
      setBp(null);
      setStatus({ kind: "warn", text: "Stored blueprint pack is missing or invalid. Recompile to regenerate." });
      return;
    }

    const pack = parsed as BlueprintPackV1;
    setBpJson(json);
    setBp(pack);

    const nextVariant = String(pack.lofi?.active_variant_id || pack.lofi?.variant_ids?.[0] || "balanced");
    setSelectedVariantId(nextVariant);
    const firstPage = String(pack.pages?.[0]?.id || "home");
    setSelectedPageId(firstPage);
    setSelectedSectionIndex(0);
  }

  function persistDirectorMeta(pid: string, next: ProjectState, patch: any) {
    const merged: any = {
      ...next,
      director: {
        ...(next as any).director,
        schema: "kindred.director_state.v1",
        ...patch,
      },
    };
    saveProjectStateById(pid, merged);
    setState(merged);
    try {
      window.dispatchEvent(new CustomEvent("kindred_state_changed"));
    } catch {
      // ignore
    }
  }

  async function compileAndStore() {
    const pid = projectId || "default";
    let st: ProjectState | null = null;
    try {
      st = loadProjectStateById(pid);
    } catch {
      st = null;
    }
    if (!st) {
      setStatus({ kind: "error", text: "Project state unavailable." });
      return;
    }

    setStatus({ kind: "info", text: "Compiling deterministic Blueprint Pack…" });

    const r = await compileBlueprintPackFromState({ state: st });
    if (!r.ok) {
      setStatus({ kind: "error", text: `${r.error.message}: ${r.error.details.slice(0, 3).join(" • ")}` });
      return;
    }

    const saved = await setLatestBlueprintPack({
      project_id: pid,
      jsonText: r.jsonText,
      blueprint_pack_sha256: r.blueprint_pack_sha256,
      spec_pack_sha256: r.spec_pack_sha256,
      generated_at_utc: new Date().toISOString(),
    });

    persistDirectorMeta(pid, st, {
      last_blueprint_pack_sha256: r.blueprint_pack_sha256,
      last_blueprint_pack_spec_pack_sha256: r.spec_pack_sha256,
      last_blueprint_pack_generated_at_utc: new Date().toISOString(),
    });

    setMeta(saved);
    setBpJson(r.jsonText);
    setBp(r.pack);
    setSelectedVariantId(String(r.pack.lofi?.active_variant_id || r.pack.lofi?.variant_ids?.[0] || "balanced"));
    setSelectedPageId(String(r.pack.pages?.[0]?.id || "home"));
    setSelectedSectionIndex(0);

    setStatus({ kind: "success", text: `Blueprint Pack compiled and saved (sha256 ${r.blueprint_pack_sha256.slice(0, 12)}…).` });
  }

  useEffect(() => {
    try {
      const pid = getCurrentProjectId();
      setProjectId(pid);
      setState(loadProjectStateById(pid));
      loadFromStore(pid);
    } catch {
      setProjectId("default");
      try {
        setState(loadProjectStateById("default"));
      } catch {
        setState(null);
      }
    }

    const onProject = () => {
      try {
        const pid = getCurrentProjectId();
        setProjectId(pid);
        setState(loadProjectStateById(pid));
        loadFromStore(pid);
      } catch {
        // ignore
      }
    };
    const onBlueprint = () => {
      try {
        const pid = getCurrentProjectId();
        loadFromStore(pid);
      } catch {
        // ignore
      }
    };
    window.addEventListener("kindred_project_changed", onProject as any);
    window.addEventListener("kindred_blueprint_pack_changed", onBlueprint as any);
    return () => {
      window.removeEventListener("kindred_project_changed", onProject as any);
      window.removeEventListener("kindred_blueprint_pack_changed", onBlueprint as any);
    };
  }, []);

  const pageRows = useMemo(() => {
    if (!bp) return [];
    return orderPagesForDisplay(Array.isArray(bp.pages) ? bp.pages : []);
  }, [bp]);

  const variantIds = useMemo(() => {
    if (!bp) return [];
    const ids = Array.isArray(bp.lofi?.variant_ids) ? bp.lofi.variant_ids : [];
    return ids.length ? ids : [String(bp.lofi?.active_variant_id || "balanced")];
  }, [bp]);

  const selectedPage = useMemo(() => {
    if (!bp) return null;
    const pages = Array.isArray(bp.pages) ? bp.pages : [];
    return pages.find((p) => String(p.id) === String(selectedPageId)) || pages[0] || null;
  }, [bp, selectedPageId]);

  const selectedVariant = useMemo(() => {
    if (!selectedPage) return null;
    const vs = Array.isArray(selectedPage.variants) ? selectedPage.variants : [];
    return vs.find((v) => String(v.variant_id) === String(selectedVariantId)) || vs[0] || null;
  }, [selectedPage, selectedVariantId]);

  const sectionIds = useMemo(() => {
    if (!selectedVariant) return [];
    const secs = Array.isArray(selectedVariant.sections) ? selectedVariant.sections : [];
    return secs.map((s) => String(s.id || "")).filter((x) => x.length > 0);
  }, [selectedVariant]);

  const selectedSectionId = useMemo(() => {
    if (sectionIds.length === 0) return "";
    return sectionIds[clampIndex(selectedSectionIndex, sectionIds.length)] || "";
  }, [sectionIds, selectedSectionIndex]);

  const projectName = String(state?.project?.name || projectId || "project");

  return (
    <div className="container">
      <div className="hero">
        <h1>Blueprints</h1>
        <p>
          View a compiled <strong>UI Blueprint Pack</strong> (greyscale-first structure). This is deterministic output. The canonical truth remains
          the adopted Spec Pack + locked governance records.
        </p>
      </div>

      {status ? (
        <Callout title={status.kind === "error" ? "Error" : status.kind === "warn" ? "Warning" : status.kind === "success" ? "Done" : "Working"} tone={status.kind === "error" ? "danger" : status.kind === "warn" ? "warn" : "info"}>
          {status.text}
        </Callout>
      ) : null}

      <Panel title="Blueprint Pack">
        <div className="row" style={{ justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div className="small">
            <div>
              <strong>Project:</strong> {projectName}
            </div>
            <div>
              blueprint_pack_sha256: <code>{meta?.blueprint_pack_sha256 ? `${meta.blueprint_pack_sha256.slice(0, 12)}…` : "(none yet)"}</code>
            </div>
            <div>
              spec_pack_sha256: <code>{meta?.spec_pack_sha256 ? `${meta.spec_pack_sha256.slice(0, 12)}…` : "(unknown)"}</code>
            </div>
          </div>

          <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <PrimaryButton onClick={compileAndStore}>Compile / Refresh</PrimaryButton>
            <SecondaryButton href="/director/ship">Go to Ship</SecondaryButton>
            {bpJson ? (
              <SecondaryButton
                onClick={() => {
                  const fn = `${projectName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "") || "project"}__blueprint_pack.v1.json`;
                  downloadTextFile(fn, bpJson);
                }}
              >
                Download JSON
              </SecondaryButton>
            ) : null}
          </div>
        </div>

        {!bp ? (
          <p className="small" style={{ marginTop: 10 }}>
            No Blueprint Pack is stored yet for this project. Compile one (above), or compile from Director → Ship.
          </p>
        ) : null}
      </Panel>

      {bp ? (
        <div className="editor_grid">
          <Panel title="Pages">
            <div className="small" style={{ marginBottom: 10 }}>
              Select a page to preview its greyscale sections.
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              {pageRows.map((r) => {
                const isSel = String(r.page.id) === String(selectedPageId);
                return (
                  <button
                    key={String(r.page.id)}
                    className={"btn"}
                    style={{
                      textAlign: "left",
                      paddingLeft: 10 + r.depth * 14,
                      opacity: isSel ? 1 : 0.85,
                      background: isSel ? "var(--panel-3)" : "var(--panel)",
                      borderColor: isSel ? "var(--border)" : "var(--border)",
                    }}
                    onClick={() => {
                      setSelectedPageId(String(r.page.id));
                      setSelectedSectionIndex(0);
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{r.page.title || r.page.id}</div>
                    <div className="small" style={{ opacity: 0.8 }}>
                      {r.page.route_path}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Wireframe preview">
            <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <div className="small">
                <strong>Variant</strong>
              </div>
              <select
                className="input"
                value={selectedVariantId}
                onChange={(e) => {
                  setSelectedVariantId(e.target.value);
                  setSelectedSectionIndex(0);
                }}
              >
                {variantIds.map((vid) => (
                  <option key={vid} value={vid}>
                    {vid}
                  </option>
                ))}
              </select>
            </div>

            <WireframePreview
              title={selectedPage?.title || selectedPage?.id || "Page"}
              sections={sectionIds}
              selectedIndex={selectedSectionIndex}
              onSelectSection={(idx) => setSelectedSectionIndex(idx)}
            />
          </Panel>

          <Panel title="Inspector">
            <div className="small" style={{ display: "grid", gap: 8 }}>
              <div>
                <strong>Page</strong>: <code>{selectedPage?.id || "(none)"}</code>
              </div>
              <div>
                <strong>Route</strong>: <code>{selectedPage?.route_path || "(none)"}</code>
              </div>
              <div>
                <strong>Scene</strong>: <code>{selectedPage?.scene_id || "(none)"}</code>
              </div>
              <div>
                <strong>Variant</strong>: <code>{selectedVariant?.variant_id || "(none)"}</code>
              </div>
              <div>
                <strong>Selected section</strong>: <code>{selectedSectionId || "(none)"}</code>
              </div>
              <div>
                <strong>Sections</strong>: {sectionIds.length}
              </div>
            </div>

            <div className="hr" />
            <div className="small" style={{ opacity: 0.9 }}>
              <p style={{ marginTop: 0 }}>
                This viewer is <strong>read-only</strong>. To propose layout changes, use Director → Editor to generate a deterministic Spec proposal,
                then adopt + lock via Director → Proposals.
              </p>
              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                <SecondaryButton href="/director/editor">Open Editor</SecondaryButton>
                <SecondaryButton href="/director/proposals">Open Proposals</SecondaryButton>
              </div>
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
