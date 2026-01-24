"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { readAdvancedMode } from "../../../lib/advanced_mode";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { SecondaryButton } from "../../../components/Buttons";
import { WireframePreview } from "../../../components/WireframePreview";
import { FastRenderPreview } from "../../../components/FastRenderPreview";

import type { ProjectState } from "../../../lib/types";
import {
  getCurrentProjectId,
  lastBasePackKeyForProject,
  LEGACY_LAST_BASE_PACK_KEY,
  loadState,
  saveState,
} from "../../../lib/state";

import { isPackLocked, unlockPack } from "../../../lib/pack_governance";
import { SECTION_LIBRARY, labelForSection } from "../../../lib/section_library";
import { buildSpecPack } from "../../../lib/export_pack";
import { diffSpecPacks } from "../../../lib/pack_diff";
import { buildPatchFromPacks } from "../../../lib/spec_pack_patch";
import { decodeBase64, encodeBase64, readZip, tryReadZip, type SpecPack } from "../../../lib/spec_pack";
import { saveProposal, type ProposalV2 } from "../../../lib/proposals";

function shortId(): string {
  const rand = Math.random().toString(16).slice(2);
  return `p_${Date.now().toString(36)}_${rand.slice(0, 6)}`;
}

function readLS(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeLS(key: string, value: string) {
  try {
    if (!value) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

const PREVIEW_MODE_KEY = "kindred.director.editor.preview_mode.v1";

function clampIndex(n: number, max: number): number {
  if (!Number.isFinite(n)) return 0;
  if (max <= 0) return 0;
  if (n < 0) return 0;
  if (n >= max) return max - 1;
  return n;
}

function move<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr;
  if (from < 0 || from >= arr.length) return arr;
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function DirectorEditorPage() {
  const [state, setState] = useState<ProjectState | null>(null);
  const baseRef = useRef<ProjectState | null>(null);

  const [editingLocked, setEditingLocked] = useState<boolean>(false);
  const [lockStatus, setLockStatus] = useState<string>("");

  const [selectedVariantId, setSelectedVariantId] = useState<string>("balanced");
  const [selectedPageId, setSelectedPageId] = useState<string>("home");
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number>(0);
  const [addSectionId, setAddSectionId] = useState<string>(SECTION_LIBRARY[0]?.id || "content");

  // UI-only preference. Default is "fast" for immediate feedback.
  const [previewMode, setPreviewMode] = useState<"fast" | "wireframe">("fast");

  const [statusKind, setStatusKind] = useState<"info" | "success" | "warn" | "error">("info");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const s = loadState();
    setState(s);
    baseRef.current = s;

    // Persisted per-browser preference (UI-only).
    try {
      const pm = localStorage.getItem(PREVIEW_MODE_KEY) || "";
      if (pm === "wireframe" || pm === "fast") setPreviewMode(pm);
    } catch {
      // ignore
    }

    const v = s.design?.lofi?.active_variant_id || "balanced";
    setSelectedVariantId(v);
    const firstPage = s.design?.ia?.pages?.[0]?.id || "home";
    setSelectedPageId(firstPage);
    setSelectedSectionIndex(0);

    // Default remains "fast" if nothing is set.
  }, []);

  function setPreviewModePersist(next: "wireframe" | "fast") {
    setPreviewMode(next);
    try {
      localStorage.setItem(PREVIEW_MODE_KEY, next);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const refreshLock = () => {
      try {
        const pid = getCurrentProjectId();
        setEditingLocked(pid ? isPackLocked(pid) : false);
      } catch {
        setEditingLocked(false);
      }
    };
    refreshLock();
    window.addEventListener("kindred_governance_changed", refreshLock);
    window.addEventListener("kindred_project_changed", refreshLock);
    return () => {
      window.removeEventListener("kindred_governance_changed", refreshLock);
      window.removeEventListener("kindred_project_changed", refreshLock);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    if (editingLocked) return;
    saveState(state);
  }, [state, editingLocked]);

  const variants = useMemo(() => {
    if (!state) return [];
    return Array.isArray(state.design?.lofi?.variants) ? state.design.lofi.variants : [];
  }, [state]);

  const pages = useMemo(() => {
    if (!state) return [];
    return Array.isArray(state.design?.ia?.pages) ? state.design.ia.pages : [];
  }, [state]);

  const activeVariant = useMemo(() => {
    if (!state) return null;
    return variants.find((v: any) => v.id === selectedVariantId) || variants[0] || null;
  }, [state, variants, selectedVariantId]);

  const sections = useMemo(() => {
    if (!activeVariant) return [];
    const pageMap = activeVariant.pages || {};
    const raw = pageMap[selectedPageId]?.sections || [];
    return Array.isArray(raw) ? raw : [];
  }, [activeVariant, selectedPageId]);

  const selectedSectionId = useMemo(() => {
    if (sections.length === 0) return "";
    const idx = clampIndex(selectedSectionIndex, sections.length);
    return sections[idx] || "";
  }, [sections, selectedSectionIndex]);

  function update(next: ProjectState) {
    if (editingLocked) {
      setLockStatus("Project is LOCKED. Unlock to edit.");
      return;
    }
    setLockStatus("");
    setState(next);
  }

  function unlockEditing() {
    setLockStatus("");
    try {
      const pid = getCurrentProjectId();
      if (!pid) {
        setLockStatus("No project selected.");
        return;
      }
      const ok = unlockPack(pid);
      if (!ok) {
        setLockStatus("Could not unlock (governance record missing).");
        return;
      }
      setEditingLocked(false);
      setLockStatus("Unlocked. You are now editing a working copy.");
    } catch {
      setLockStatus("Could not unlock.");
    }
  }

  function setSections(nextSections: string[]) {
    if (!state) return;
    if (!activeVariant) return;
    const nextVariants = variants.map((v: any) => {
      if (v.id !== activeVariant.id) return v;
      const pages = { ...(v.pages || {}) };
      pages[selectedPageId] = { sections: nextSections.slice() };
      return { ...v, pages };
    });
    update({
      ...state,
      design: { ...state.design, lofi: { ...state.design.lofi, active_variant_id: selectedVariantId, variants: nextVariants } },
    });
    setSelectedSectionIndex(clampIndex(selectedSectionIndex, nextSections.length));
  }

  async function createLayoutProposal() {
    if (!state) return;
    const before = baseRef.current || state;
    const after = state;

    setStatusKind("info");
    setStatus("Creating a deterministic Spec proposal from current layout…");

    const pid = after.project.id || getCurrentProjectId();
    const baseKey = lastBasePackKeyForProject(pid);

    try {
      let basePack: SpecPack | null = null;
      const baseB64 = readLS(baseKey) || readLS(LEGACY_LAST_BASE_PACK_KEY) || "";
      if (baseB64) {
        const parsed = tryReadZip(decodeBase64(baseB64));
        if (parsed.ok) basePack = parsed.pack;
      }

      // If there is no base pack yet, synthesize one from the "before" snapshot
      // so that this proposal is always recoverable.
      if (!basePack) {
        const baseBytes = buildSpecPack(before, { include_council_dsl: readAdvancedMode() });
        basePack = readZip(baseBytes);
        const nextB64 = encodeBase64(baseBytes);
        writeLS(baseKey, nextB64);
        writeLS(LEGACY_LAST_BASE_PACK_KEY, nextB64);
      }

      const proposalBytes = buildSpecPack(after, { include_council_dsl: readAdvancedMode() });
      const proposalPack = readZip(proposalBytes);

      const packDiff = diffSpecPacks(basePack, proposalPack);
      const patch = await buildPatchFromPacks({
        base: basePack,
        proposal: proposalPack,
        patch_text: packDiff.fullPatch,
        summary: "Director editor → layout change",
        stats: packDiff.stats,
      });

      const rec: ProposalV2 = {
        schema: "kindred.proposal.v2",
        id: shortId(),
        created_at_utc: new Date().toISOString(),
        summary: "Director editor → Spec proposal (layout)",
        patch: { ...patch, summary: "Director editor → Spec proposal (layout)" },
      };

      saveProposal(rec);
      setStatusKind("success");
      setStatus("Proposal created. Review it in Director → Proposals, then adopt/lock when ready.");
    } catch (e: any) {
      setStatusKind("error");
      setStatus(String(e?.message || e));
    }
  }

  if (!state) {
    return (
      <div className="container">
        <div className="hero">
          <h1>Editor</h1>
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  const selectedPage = pages.find((p: any) => p.id === selectedPageId) || pages[0] || null;
  const selectedLabel = selectedSectionId ? labelForSection(selectedSectionId) : "(none)";

  return (
    <div className="container">
      <div className="hero">
        <h1>Editor</h1>
        <p>
          Sections &amp; blocks style editing: tree on the left, live preview in the center, and properties on the right.
          Changes stay offline-first and become proposals you explicitly adopt.
        </p>
      </div>

      {editingLocked ? (
        <div style={{ marginBottom: 16 }}>
          <Panel title="Project is LOCKED">
            <p className="small">This project is locked as truth. Unlock to create a new working copy before editing layouts.</p>
            <div className="row">
              <SecondaryButton onClick={unlockEditing}>Unlock (create working copy)</SecondaryButton>
            </div>
            {lockStatus ? <p className="small">{lockStatus}</p> : null}
          </Panel>
        </div>
      ) : null}

      {status ? (
        <div style={{ marginBottom: 16 }}>
          <Callout kind={statusKind} title="Status" details={status} />
        </div>
      ) : null}

      <div className="editor_grid" style={editingLocked ? { pointerEvents: "none", opacity: 0.6 } : undefined}>
        <Panel title="Structure">
          <p className="small">Pick a template variant and page, then manage its section list.</p>

          <div className="field">
            <label>Variant</label>
            <select
              value={selectedVariantId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedVariantId(v);
                update({ ...state, design: { ...state.design, lofi: { ...state.design.lofi, active_variant_id: v } } });
              }}
            >
              {variants.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.label || v.id}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Page</label>
            <select
              value={selectedPageId}
              onChange={(e) => {
                setSelectedPageId(e.target.value);
                setSelectedSectionIndex(0);
              }}
            >
              {pages.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.title || p.id}
                </option>
              ))}
            </select>
          </div>

          <div className="hr" />

          <p className="small">Sections (click to select):</p>
          {sections.length === 0 ? (
            <p className="small">(no sections)</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {sections.map((s, idx) => (
                <div
                  key={`${s}-${idx}`}
                  className={"badge"}
                  style={{
                    justifyContent: "space-between",
                    cursor: "pointer",
                    borderColor: idx === selectedSectionIndex ? "var(--primary-2)" : undefined,
                  }}
                  onClick={() => setSelectedSectionIndex(idx)}
                  title={s}
                >
                  <span>
                    <strong>{labelForSection(s)}</strong>
                    <span className="small" style={{ marginLeft: 8 }}>
                      {s}
                    </span>
                  </span>
                  <span className="small">#{idx + 1}</span>
                </div>
              ))}
            </div>
          )}

          <div className="hr" />

          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label>Add section</label>
              <select value={addSectionId} onChange={(e) => setAddSectionId(e.target.value)}>
                {SECTION_LIBRARY.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn"
              onClick={() => {
                const next = sections.concat([addSectionId]);
                setSections(next);
                setSelectedSectionIndex(next.length - 1);
              }}
            >
              Add
            </button>
          </div>

          <div className="hr" />
          <div className="row">
            <button className="btn" onClick={createLayoutProposal}>
              Create proposal (layout)
            </button>
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            This writes a deterministic Spec proposal you can review in Director → Proposals, then adopt &amp; lock.
          </p>
        </Panel>

        <Panel title="Preview">
          <div className="row" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
            <SecondaryButton
              onClick={() => setPreviewModePersist("wireframe")}
              disabled={previewMode === "wireframe"}
              title="Greyscale structural preview (stable, minimal)"
            >
              Wireframe
            </SecondaryButton>
            <SecondaryButton
              onClick={() => setPreviewModePersist("fast")}
              disabled={previewMode === "fast"}
              title="Token-styled preview (fast feedback loop)"
            >
              Fast render
            </SecondaryButton>
          </div>

          {previewMode === "wireframe" ? (
            <WireframePreview
              title={`${selectedVariantId} • ${selectedPage?.title || selectedPageId}`}
              sections={sections}
              selectedIndex={clampIndex(selectedSectionIndex, sections.length)}
              onSelectSection={(idx) => setSelectedSectionIndex(idx)}
            />
          ) : (
            <FastRenderPreview
              title={`${selectedVariantId} • ${selectedPage?.title || selectedPageId}`}
              sections={sections}
              selectedIndex={clampIndex(selectedSectionIndex, sections.length)}
              onSelectSection={(idx) => setSelectedSectionIndex(idx)}
            />
          )}
        </Panel>

        <Panel title="Properties">
          <p className="small">Edit the selected section. Layout stays deterministic and auditable.</p>

          {sections.length === 0 ? (
            <p className="small">Select a page with sections to edit properties.</p>
          ) : (
            <>
              <div className="badge" style={{ marginBottom: 12 }}>
                <strong>Selected</strong>
                <span style={{ marginLeft: 8 }}>
                  {selectedLabel} <span className="small" style={{ marginLeft: 8 }}>{selectedSectionId}</span>
                </span>
              </div>

              <div className="field">
                <label>Replace section type</label>
                <select
                  value={selectedSectionId}
                  onChange={(e) => {
                    const v = e.target.value;
                    const idx = clampIndex(selectedSectionIndex, sections.length);
                    const next = sections.slice();
                    next[idx] = v;
                    setSections(next);
                  }}
                >
                  {SECTION_LIBRARY.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="row">
                <button
                  className="btn"
                  onClick={() => {
                    const idx = clampIndex(selectedSectionIndex, sections.length);
                    const next = move(sections, idx, idx - 1);
                    setSections(next);
                    setSelectedSectionIndex(Math.max(0, idx - 1));
                  }}
                  disabled={selectedSectionIndex <= 0}
                >
                  Move up
                </button>

                <button
                  className="btn"
                  onClick={() => {
                    const idx = clampIndex(selectedSectionIndex, sections.length);
                    const next = move(sections, idx, idx + 1);
                    setSections(next);
                    setSelectedSectionIndex(Math.min(next.length - 1, idx + 1));
                  }}
                  disabled={selectedSectionIndex >= sections.length - 1}
                >
                  Move down
                </button>

                <button
                  className="btn danger"
                  onClick={() => {
                    const idx = clampIndex(selectedSectionIndex, sections.length);
                    const next = sections.filter((_, i) => i !== idx);
                    setSections(next);
                    setSelectedSectionIndex(clampIndex(idx, next.length));
                  }}
                >
                  Remove
                </button>
              </div>

              <div className="hr" />
              <p className="small">
                Page: <code>{selectedPageId}</code>
                {selectedPage?.route_path ? (
                  <>
                    {" "}• route: <code>{selectedPage.route_path}</code>
                  </>
                ) : null}
              </p>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
