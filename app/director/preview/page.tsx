"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";

import { getCurrentProjectId, loadProjectStateById, saveProjectStateById, lastBasePackKeyForProject, LEGACY_LAST_BASE_PACK_KEY } from "../../../lib/state";
import type { ProjectState } from "../../../lib/types";
import { decodeBase64, tryReadZip, type SpecPack } from "../../../lib/spec_pack";
import { loadProposals, isApplyable, type ProposalV2 } from "../../../lib/proposals";
import { applyPatchToPack } from "../../../lib/spec_pack_patch";
import { previewPackJson, previewPackSha256, previewHtml, previewHtmlSha256, buildPreviewPack, previewSummary, diffPreviewSummaries, type PreviewSummaryV1, buildPreviewPackFromSpecPack } from "../../../lib/preview_pack";

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DirectorPreviewPage() {
  const [projectId, setProjectId] = useState<string>("");
  const [state, setState] = useState<ProjectState | null>(null);
  const [status, setStatus] = useState<string>("");
  const [prevJson, setPrevJson] = useState<string>("");
  const [selectedProposalId, setSelectedProposalId] = useState<string>("");
  const [proposalError, setProposalError] = useState<string>("");
  const [basePreview, setBasePreview] = useState<PreviewSummaryV1 | null>(null);
  const [propPreview, setPropPreview] = useState<PreviewSummaryV1 | null>(null);

  useEffect(() => {
    const pid = getCurrentProjectId();
    setProjectId(pid);
    const st = loadProjectStateById(pid);
    setState(st);
    const pj = typeof (st as any)?.director?.last_preview_pack_json === "string" ? (st as any).director.last_preview_pack_json : "";
    setPrevJson(pj);

    const on = () => {
      const next = loadProjectStateById(pid);
      setState(next);
      const pj2 = typeof (next as any)?.director?.last_preview_pack_json === "string" ? (next as any).director.last_preview_pack_json : "";
      setPrevJson(pj2);
    };
    window.addEventListener("kindred_state_changed", on as any);
    return () => window.removeEventListener("kindred_state_changed", on as any);
  }, []);


  useEffect(() => {
    if (!projectId || !state) return;

    async function computeProposalAwarePreview() {
      setProposalError("");
      setBasePreview(null);
      setPropPreview(null);

      // Load Base Spec Pack (exported or synthesized by Director adoption loop).
      let basePack: SpecPack | null = null;
      try {
        const key = lastBasePackKeyForProject(projectId);
        const b64 = localStorage.getItem(key) || localStorage.getItem(LEGACY_LAST_BASE_PACK_KEY) || "";
        if (b64) {
          const parsed = tryReadZip(decodeBase64(b64));
          if (parsed.ok) basePack = parsed.pack;
        }
      } catch {
        basePack = null;
      }

      if (!basePack) {
        setProposalError("No Base Spec Pack found yet. Export a Spec Pack (or adopt a brief option) to enable proposal-aware preview.");
        return;
      }

      try {
        const basePrev = previewSummary(buildPreviewPackFromSpecPack(basePack));
        setBasePreview(basePrev);
      } catch {
        setProposalError("Base Spec Pack could not be summarized for preview.");
        return;
      }

      // Pick latest applyable proposal for this project (or current selection).
      const all = loadProposals().filter((p): p is ProposalV2 => p.schema === "kindred.proposal.v2");
      const projectProposals = all
        .filter((p) => isApplyable(p))
        .filter((p) => {
          const pid = (p.patch as any)?.base_project_id;
          return typeof pid === "string" ? pid === projectId : true;
        })
        .sort((a, b) => String(b.created_at_utc).localeCompare(String(a.created_at_utc)));

      if (projectProposals.length === 0) return;

      const chosenId = selectedProposalId || projectProposals[0].id;
      if (!selectedProposalId) setSelectedProposalId(chosenId);

      const chosen = projectProposals.find((p) => p.id === chosenId) || projectProposals[0];

      const applied = await applyPatchToPack(basePack, chosen.patch as any);
      if (!applied.ok) {
        setProposalError("Proposal patch could not be applied cleanly to Base Spec Pack.");
        return;
      }

      try {
        const propPrev = previewSummary(buildPreviewPackFromSpecPack(applied.mergedPack));
        setPropPreview(propPrev);
      } catch {
        setProposalError("Proposed Spec Pack could not be summarized for preview.");
      }
    }

    computeProposalAwarePreview();
  }, [projectId, state, selectedProposalId]);


  const pack = useMemo(() => {
    if (!state) return null;
    return buildPreviewPack(state);
  }, [state]);

  const packJson = useMemo(() => (state ? previewPackJson(state) : ""), [state]);
  const packSha = useMemo(() => (state ? previewPackSha256(state) : ""), [state]);
  const html = useMemo(() => (state ? previewHtml(state) : ""), [state]);
  const htmlSha = useMemo(() => (state ? previewHtmlSha256(state) : ""), [state]);

  function persistDirectorMeta(next: ProjectState, patch: any) {
    const merged: any = {
      ...next,
      director: {
        ...(next as any).director,
        schema: "kindred.director_state.v1",
        ...patch,
      },
    };
    saveProjectStateById(projectId, merged);
    setState(merged);
    try {
      window.dispatchEvent(new CustomEvent("kindred_state_changed"));
    } catch {
      // ignore
    }
  }

  function onDownloadPack() {
    if (!state) return;
    const filename = `${state.project.name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "") || "project"}__preview_pack.v1.json`;
    downloadTextFile(filename, packJson);
    persistDirectorMeta(state, {
      last_preview_pack_sha256: packSha,
      last_preview_pack_generated_at_utc: new Date().toISOString(),
    });
    setPrevJson(packJson);
    setStatus(`Downloaded Preview Pack (sha256 ${packSha.slice(0, 12)}…)`);
  }

  function onDownloadHtml() {
    if (!state) return;
    const filename = `${state.project.name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "") || "project"}__preview.html`;
    downloadTextFile(filename, html);
    persistDirectorMeta(state, {
      last_preview_html_sha256: htmlSha,
      last_preview_html_generated_at_utc: new Date().toISOString(),
    });
    setStatus(`Downloaded Preview HTML (sha256 ${htmlSha.slice(0, 12)}…)`);
  }

  if (!state || !pack) {
    return (
      <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
        <h1>Preview</h1>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <h1>Preview</h1>
      <p>This is a deterministic preview artefact derived from your current project state. Evidence is exportable.</p>

      {status ? <Callout kind="success">{status}</Callout> : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        <button className="btn" onClick={onDownloadPack}>Download Preview Pack</button>
        <button className="btn" onClick={onDownloadHtml}>Download Preview HTML</button>
      </div>

      <Panel title="At a glance">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div><strong>Project</strong></div>
            <div>{state.project.name}</div>
            <div style={{ opacity: 0.7 }}>{state.project.id}</div>
          </div>
          <div>
            <div><strong>Preview Pack sha</strong></div>
            <div><code>{packSha.slice(0, 12)}…</code></div>
            <div style={{ opacity: 0.7 }}>HTML sha: <code>{htmlSha.slice(0, 12)}…</code></div>
          </div>
        </div>
      </Panel>

      <Panel title="Libraries (adopted)">
        {(() => {
          const d: any = (state as any)?.director?.libraries_v1 || {};
          const adopted = Array.isArray(d.adopted_library_ids) ? d.adopted_library_ids : [];
          const specSha = typeof d.adopted_from_spec_pack_sha256 === "string" ? d.adopted_from_spec_pack_sha256 : "";
          const fileSha = typeof d.adopted_libraries_spel_sha256 === "string" ? d.adopted_libraries_spel_sha256 : "";
          const adoptedAt = typeof d.adopted_at_utc === "string" ? d.adopted_at_utc : "";
          return (
            <div>
              <p>
                <strong>Selected</strong>: {adopted.length} {adopted.length ? `(${adopted.join(", ")})` : "(none)"}
              </p>
              <p className="small">
                Spec Pack sha: <code>{specSha ? `${specSha.slice(0, 12)}…` : "(none)"}</code>
                <br />
                libraries.spel sha: <code>{fileSha ? `${fileSha.slice(0, 12)}…` : "(none)"}</code>
                <br />
                Adopted at: <code>{adoptedAt || "(none)"}</code>
              </p>
            </div>
          );
        })()}
      </Panel>

      <Panel title="Patterns (adopted)">
        {(() => {
          const d: any = (state as any)?.director?.patterns_v1 || {};
          const adopted = Array.isArray(d.adopted_pattern_ids) ? d.adopted_pattern_ids : [];
          const specSha = typeof d.adopted_from_spec_pack_sha256 === "string" ? d.adopted_from_spec_pack_sha256 : "";
          const fileSha = typeof d.adopted_patterns_spel_sha256 === "string" ? d.adopted_patterns_spel_sha256 : "";
          const adoptedAt = typeof d.adopted_at_utc === "string" ? d.adopted_at_utc : "";
          return (
            <div>
              <p>
                <strong>Selected</strong>: {adopted.length} {adopted.length ? `(${adopted.join(", ")})` : "(none)"}
              </p>
              <p className="small">
                Spec Pack sha: <code>{specSha ? `${specSha.slice(0, 12)}…` : "(none)"}</code>
                <br />
                patterns.spel sha: <code>{fileSha ? `${fileSha.slice(0, 12)}…` : "(none)"}</code>
                <br />
                Adopted at: <code>{adoptedAt || "(none)"}</code>
              </p>
            </div>
          );
        })()}
      </Panel>

      <Panel title="Blueprint Pack (latest)">
        {(() => {
          const d: any = (state as any)?.director || {};
          const sha = typeof d.last_blueprint_pack_sha256 === "string" ? d.last_blueprint_pack_sha256 : "";
          const specSha = typeof d.last_blueprint_pack_spec_pack_sha256 === "string" ? d.last_blueprint_pack_spec_pack_sha256 : "";
          const at = typeof d.last_blueprint_pack_generated_at_utc === "string" ? d.last_blueprint_pack_generated_at_utc : "";
          return (
            <div>
              <div className="row" style={{ gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <a className="btn" href="/director/blueprints">Open Blueprint Viewer</a>
              </div>
              <p className="small">
                blueprint_pack_sha256: <code>{sha ? `${sha.slice(0, 12)}…` : "(none yet)"}</code>
                <br />
                spec_pack_sha256: <code>{specSha ? `${specSha.slice(0, 12)}…` : "(none)"}</code>
                <br />
                generated at: <code>{at || "(none)"}</code>
              </p>
              <p className="small" style={{ opacity: 0.8 }}>
                Blueprint Pack is embedded into Repo Packs at <code>.kindred/blueprint_pack/blueprint_pack.v1.json</code>.
              </p>
            </div>
          );
        })()}
      </Panel>

      <Panel title="Integrations (adopted)">
        {(() => {
          const d: any = (state as any)?.director?.kits_v1 || {};
          const adopted = Array.isArray(d.adopted_kit_ids) ? d.adopted_kit_ids : [];
          const specSha = typeof d.adopted_from_spec_pack_sha256 === "string" ? d.adopted_from_spec_pack_sha256 : "";
          const fileSha = typeof d.adopted_kits_spel_sha256 === "string" ? d.adopted_kits_spel_sha256 : "";
          const adoptedAt = typeof d.adopted_at_utc === "string" ? d.adopted_at_utc : "";
          return (
            <div>
              <p>
                <strong>Bindings</strong>: {adopted.length} {adopted.length ? `(${adopted.join(", ")})` : "(none)"}
              </p>
              <p className="small">
                Spec Pack sha: <code>{specSha ? `${specSha.slice(0, 12)}…` : "(none)"}</code>
                <br />
                integrations bundle sha: <code>{fileSha ? `${fileSha.slice(0, 12)}…` : "(none)"}</code>
                <br />
                Adopted at: <code>{adoptedAt || "(none)"}</code>
              </p>
            </div>
          );
        })()}
      </Panel>

      <Panel title="Direction">
        <p><strong>Offer</strong>: {pack.direction.brief.offer || "(unspecified)"}</p>
        <p><strong>Problem</strong>: {pack.direction.brief.problem || "(unspecified)"}</p>
        <p><strong>Audience</strong>: {pack.direction.brief.audience_description || "(unspecified)"}</p>
        <p><strong>Palettes</strong>: {(pack.direction.palettes || []).join(", ") || "(none)"}</p>
      </Panel>

      <Panel title="Sitemap">
        <ul>
          {pack.sitemap.pages.map((p) => (
            <li key={p.id}>
              <strong>{p.title || p.id}</strong>{p.route_path ? ` (${p.route_path})` : ""}{" "}
              <span style={{ opacity: 0.7 }}>{p.id}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Storyboard">
        {pack.storyboard.flows.length === 0 ? (
          <p>(No flows defined yet.)</p>
        ) : (
          pack.storyboard.flows.map((f) => (
            <div key={f.id} style={{ marginBottom: 12 }}>
              <h3 style={{ margin: "8px 0" }}>{f.id}</h3>
              <ol>
                {f.scenes.map((s) => (
                  <li key={s.id}>
                    {s.title} <span style={{ opacity: 0.7 }}>{s.id}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </Panel>



      <Panel title="Proposal-aware preview (Base → Proposed → Current)">
        {proposalError ? <Callout kind="warn">{proposalError}</Callout> : null}

        {!basePreview ? (
          <p style={{ opacity: 0.8 }}>(Base preview not available.)</p>
        ) : (
          <>
            <p style={{ opacity: 0.8 }}>
              This compares outcomes from the last exported Base Spec Pack, an applyable proposal patch (if present), and your current in-browser state.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div className="card">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Base</div>
                <div><strong>Offer</strong>: {basePreview.offer || "(unspecified)"}</div>
                <div><strong>Pages</strong>: {basePreview.page_count}</div>
                <div><strong>Palettes</strong>: {basePreview.palettes.join(", ") || "(none)"}</div>
              </div>

              <div className="card">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Proposed</div>
                {propPreview ? (
                  <>
                    <div><strong>Offer</strong>: {propPreview.offer || "(unspecified)"}</div>
                    <div><strong>Pages</strong>: {propPreview.page_count}</div>
                    <div><strong>Palettes</strong>: {propPreview.palettes.join(", ") || "(none)"}</div>
                  </>
                ) : (
                  <div style={{ opacity: 0.7 }}>(No applyable proposal selected / available.)</div>
                )}
              </div>

              <div className="card">
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Current</div>
                {(() => {
                  const cur = previewSummary(pack as any);
                  return (
                    <>
                      <div><strong>Offer</strong>: {cur.offer || "(unspecified)"}</div>
                      <div><strong>Pages</strong>: {cur.page_count}</div>
                      <div><strong>Palettes</strong>: {cur.palettes.join(", ") || "(none)"}</div>
                    </>
                  );
                })()}
              </div>
            </div>

            <details style={{ marginTop: 10 }}>
              <summary><strong>Details: what changed (Base → Proposed)</strong></summary>
              {propPreview ? (
                (() => {
                  const d = diffPreviewSummaries(basePreview, propPreview);
                  return (
                    <ul>
                      {d.changed.offer ? <li><strong>Offer changed</strong></li> : null}
                      {d.changed.problem ? <li><strong>Problem changed</strong></li> : null}
                      {d.changed.audience ? <li><strong>Audience changed</strong></li> : null}
                      {d.changed.palettes ? <li><strong>Palettes changed</strong></li> : null}
                      {d.changed.pages ? <li><strong>Sitemap changed</strong></li> : null}
                      {d.changed.storyboard ? <li><strong>Storyboard changed</strong></li> : null}
                      {d.changed.home_sections ? <li><strong>Home sections changed</strong></li> : null}
                      <li style={{ opacity: 0.8 }}>
                        Pages {d.deltas.page_count.from} → {d.deltas.page_count.to}, flows {d.deltas.flow_count.from} → {d.deltas.flow_count.to}, scenes {d.deltas.scene_count.from} → {d.deltas.scene_count.to}
                      </li>
                    </ul>
                  );
                })()
              ) : (
                <p style={{ opacity: 0.7 }}>(No Proposed preview available.)</p>
              )}
            </details>
          </>
        )}
      </Panel>

      <Panel title="Compare with last preview">
        {!prevJson ? (
          <p>(No previous preview snapshot saved yet. Download the Preview Pack once to enable comparison.)</p>
        ) : (
          (() => {
            let prev: any = null;
            try {
              prev = JSON.parse(prevJson);
            } catch {
              prev = null;
            }
            if (!prev || prev.schema !== "kindred.preview_pack.v1") {
              return <p>(Previous snapshot is missing or invalid.)</p>;
            }
            const fromSum: PreviewSummaryV1 = previewSummary(prev as any);
            const toSum: PreviewSummaryV1 = previewSummary(pack as any);
            const d = diffPreviewSummaries(fromSum, toSum);

            return (
              <div>
                <p style={{ opacity: 0.8 }}>
                  This comparison is deterministic and derived from the last saved preview snapshot vs current state.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div><strong>Pages</strong></div>
                    <div>
                      {d.deltas.page_count.from} → {d.deltas.page_count.to}
                    </div>
                  </div>
                  <div>
                    <div><strong>Storyboard</strong></div>
                    <div>
                      flows {d.deltas.flow_count.from} → {d.deltas.flow_count.to} • scenes {d.deltas.scene_count.from} → {d.deltas.scene_count.to}
                    </div>
                  </div>
                </div>

                <ul style={{ marginTop: 10 }}>
                  {d.changed.offer ? <li><strong>Offer changed</strong></li> : null}
                  {d.changed.problem ? <li><strong>Problem changed</strong></li> : null}
                  {d.changed.audience ? <li><strong>Audience changed</strong></li> : null}
                  {d.changed.palettes ? <li><strong>Palettes changed</strong></li> : null}
                  {d.changed.pages ? <li><strong>Sitemap changed</strong></li> : null}
                  {d.changed.storyboard ? <li><strong>Storyboard changed</strong></li> : null}
                  {d.changed.home_sections ? <li><strong>Home sections changed</strong></li> : null}
                  {d.notes.length === 0 ? <li style={{ opacity: 0.7 }}>(No structural changes detected.)</li> : null}
                </ul>
              </div>
            );
          })()
        )}
      </Panel>

      <details style={{ marginTop: 12 }}>
        <summary><strong>Evidence: Preview Pack JSON</strong></summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>{packJson}</pre>
      </details>
    </main>
  );
}
