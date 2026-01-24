"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { OptionsPicker, PalettesPicker } from "../../../components/OptionsPalettesPicker";
import { DomainsPicker } from "../../../components/DomainsPicker";
import { PrimaryButton, SecondaryButton } from "../../../components/Buttons";

import type { IntentProposalV1, ProjectState } from "../../../lib/types";
import { defaultState, loadState, saveState, getCurrentProjectId } from "../../../lib/state";
import { recommendedPalettes } from "../../../lib/recommendations";
import {
  applyIntentProposalToState,
  generateIntentProposalsFromState,
  spelSeedSha256FromState,
  spelSeedTextFromState,
} from "../../../lib/intent_pack";
import { createDomainsSelectionProposal } from "../../../lib/domains_proposal";
import { domainsForPalettes, normalizeDomainIds } from "../../../lib/domains";
import { useFacetIndex, facetOptions } from "../../../lib/facet_index_client";
import type { PaletteCardV1 } from "../../../components/OptionsPalettesPicker";

function downloadTextFile(filename: string, text: string, mime: string) {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 250);
  } catch {
    // ignore
  }
}

function safeName(s: string): string {
  const x = String(s || "")
    .trim()
    .replace(/[^a-zA-Z0-9_\-]+/g, "_")
    .slice(0, 64);
  return x || "project";
}

export default function DirectorBriefPage() {
  const { index: facetIndex, status: facetStatus } = useFacetIndex();
  const [state, setState] = useState<ProjectState>(defaultState());
  const [status, setStatus] = useState<string>("");

  const paletteCatalog: PaletteCardV1[] = useMemo(() => {
    if (!facetIndex) return [];
    const opts = facetOptions(facetIndex, "palettes.select");
    return opts
      .map((o) => {
        const pid = String((o.ref as any)?.palette_id || o.id || "");
        return {
          id: pid as any,
          label: String(o.label || pid),
          why: String(o.meta?.description || ""),
          tags: Array.isArray(o.meta?.tags) ? o.meta?.tags : [],
        };
      })
      .filter((c) => Boolean(c.id));
  }, [facetIndex]);
  const [statusKind, setStatusKind] = useState<"info" | "success" | "warn" | "error">("info");
  const [domainProposalId, setDomainProposalId] = useState<string>("");

  useEffect(() => {
    try {
      setState(loadState());
    } catch {
      setState(defaultState());
    }
  }, []);

  function persist(next: ProjectState) {
    setState(next);
    try {
      saveState(next);
      window.dispatchEvent(new CustomEvent("kindred_state_changed"));
    } catch {
      // ignore
    }
  }

  const pid = useMemo(() => {
    try {
      return getCurrentProjectId() || "";
    } catch {
      return "";
    }
  }, []);

  const palettes = Array.isArray(state.intent.palettes) ? state.intent.palettes : [];
  const domains = normalizeDomainIds(Array.isArray((state.intent as any).domains) ? ((state.intent as any).domains as any[]) : []);

  const paletteRec = useMemo(() => {
    return recommendedPalettes({
      build_intent: state.intent.build_intent,
      primary_surface: state.intent.primary_surface,
      constraints: state.intent.constraints,
    });
  }, [state.intent.build_intent, state.intent.primary_surface, state.intent.constraints?.offline_first, state.intent.constraints?.no_payments]);

  const proposals = useMemo(() => {
    const raw: any = (state as any).director?.intent_proposals;
    return Array.isArray(raw) ? (raw as IntentProposalV1[]) : [];
  }, [state]);

  async function onGenerateProposals() {
    setStatusKind("info");
    setStatus("Generating intent proposals…");
    try {
      const nextProps = generateIntentProposalsFromState(state);
      persist({
        ...state,
        director: {
          ...(state as any).director,
          schema: "kindred.director_state.v1",
          intent_proposals: nextProps,
          selected_intent_proposal_id: (nextProps[0]?.id || "") as any,
          last_intent_proposals_generated_at_utc: new Date().toISOString(),
        },
      } as any);
      setStatusKind("success");
      setStatus(`Generated ${nextProps.length} proposal(s). Pick one to adopt.`);
    } catch (e: any) {
      setStatusKind("error");
      setStatus(String(e?.message || e));
    }
  }

  function onAdopt(p: IntentProposalV1) {
    setStatusKind("info");
    setStatus(`Adopting: ${p.title}…`);
    try {
      const next = applyIntentProposalToState(state, p);
      persist({
        ...(next as any),
        director: {
          ...(next as any).director,
          schema: "kindred.director_state.v1",
          selected_intent_proposal_id: p.id,
        },
      } as any);
      setStatusKind("success");
      setStatus(`Adopted: ${p.title}. Your 7 Options + 14 Palettes selections are now updated.`);
    } catch (e: any) {
      setStatusKind("error");
      setStatus(String(e?.message || e));
    }
  }

  async function onDownloadSPELSeed() {
    setStatusKind("info");
    setStatus("Generating SPEL seed…");
    try {
      const text = spelSeedTextFromState(state);
      const sha = await spelSeedSha256FromState(state);
      downloadTextFile(`${safeName(state.project?.name)}__seed.spel`, text, "text/plain");
      setStatusKind("success");
      setStatus(`SPEL seed downloaded. Content hash: ${sha.slice(0, 12)}…`);
    } catch (e: any) {
      setStatusKind("error");
      setStatus(String(e?.message || e));
    }
  }

  async function onCreateDomainsProposal() {
    setDomainProposalId("");
    setStatusKind("info");
    setStatus("Creating Domains proposal…");

    try {
      const res = await createDomainsSelectionProposal({
        project_id: pid || state.project?.id || "default",
        state,
        domain_ids: domains as any,
      });

      if (!res.ok) {
        setStatusKind("error");
        setStatus([res.error, ...(res.details || [])].join(" | "));
        return;
      }

      setDomainProposalId(res.proposal_id);
      if (res.warnings && res.warnings.length > 0) {
        setStatusKind("warn");
        setStatus(`Domains proposal created (${res.proposal_id}). Warnings: ${res.warnings.join("; ")}`);
      } else {
        setStatusKind("success");
        setStatus(`Domains proposal created (${res.proposal_id}). Open Director → Proposals to review/apply.`);
      }
    } catch (e: any) {
      setStatusKind("error");
      setStatus(String(e?.message || e));
    }
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Director Brief</h1>
        <p>
          Start with a brief, like you would with a consultancy. Answer a few structured questions and make a handful of chip selections.
          Kindred compiles your answers into deterministic packs and uses them to generate low‑fi proposals.
        </p>
        <p className="small">Current project: <strong>{pid || "(none selected)"}</strong></p>
      </div>

      {status ? (
        <Callout title={statusKind === "error" ? "Issue" : statusKind === "warn" ? "Warning" : "Status"} tone={statusKind}>
          <p className="small mb0">{status}</p>
        </Callout>
      ) : null}

      <div className="grid">
        <Panel title="7 Options" subtitle="Pick one Option to set direction.">
          <OptionsPicker
            value={state.intent.build_intent}
            onChange={(next) => persist({ ...state, intent: { ...state.intent, build_intent: next } })}
          />
        </Panel>

        <Panel title="14 Palettes" subtitle="Choose a compact set of Palettes (capability lenses).">
          {facetStatus !== "ok" ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 mb-3">
              Facet catalogue missing. Run Proof Gate or <code>npm run compile_facet_index</code>. (Fallback exists for development, but
              options drift is how builders rot.)
            </div>
          ) : null}
          <PalettesPicker
            value={palettes}
            catalog={paletteCatalog}
            recommended={paletteRec.recommended}
            why={paletteRec.rationale}
            onChange={(next) => {
              // Determinism: Domains are a drill-down after Palettes, so keep them consistent.
              const allowed = new Set(domainsForPalettes(next).map((d) => d.id));
              const currentDomains = normalizeDomainIds(Array.isArray((state.intent as any).domains) ? ((state.intent as any).domains as any[]) : []);
              const nextDomains = next.length === 0 ? [] : currentDomains.filter((id) => allowed.has(id));
              persist({ ...state, intent: { ...state.intent, palettes: next, domains: nextDomains as any } });
            }}
          />
        </Panel>


        <Panel title="Selection Summary" subtitle="A quick, chip-based check-your-work snapshot (deterministic).">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              <span className="rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-900">Option: {state.intent.build_intent}</span>
              <span className="rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-900">Palettes: {palettes.length}</span>
              <span className="rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-900">Domains: {domains.length}</span>
              {paletteRec.recommended.length > 0 ? (
                <span className="rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-900">
                  Recommended: {paletteRec.recommended.length}
                </span>
              ) : null}
              {paletteRec.recommended.length > 0 ? (
                <span className="rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-900">
                  Missing recommended: {paletteRec.recommended.filter((x) => !palettes.includes(x)).length}
                </span>
              ) : null}
              {paletteRec.recommended.length > 0 ? (
                <span className="rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-900">
                  Extra beyond recommended: {palettes.filter((x) => !paletteRec.recommended.includes(x)).length}
                </span>
              ) : null}
            </div>

            {palettes.length > 0 ? (
              <div>
                <div className="text-sm font-semibold text-neutral-900">Selected palettes</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {palettes.map((id) => {
                    const c = paletteCatalog.find((x) => x.id === id);
                    return (
                      <span key={id} className="rounded-full bg-black px-2 py-1 text-xs text-white">
                        {c?.label || id}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {paletteRec.recommended.length > 0 ? (
              <div>
                <div className="text-sm font-semibold text-neutral-900">Recommended but not selected</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {paletteRec.recommended
                    .filter((id) => !palettes.includes(id))
                    .map((id) => {
                      const c = paletteCatalog.find((x) => x.id === id);
                      return (
                        <span key={id} className="rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-900">
                          {c?.label || id}
                        </span>
                      );
                    })}
                </div>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="Domains"
          subtitle="Optional drill-down after Palettes. Generates diffable proposals (intent/domains.json + spel/domains.spel)."
        >
          <DomainsPicker
            selected_palette_ids={palettes as any}
            domain_ids={domains as any}
            onChange={(next) => persist({ ...state, intent: { ...state.intent, domains: normalizeDomainIds(next as any) as any } })}
          />

          <div className="row" style={{ gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <PrimaryButton onClick={onCreateDomainsProposal} disabled={domains.length === 0}>
              Create Domains proposal
            </PrimaryButton>
            <Link href="/director/proposals" className="btn btn-secondary">
              Open Proposals
            </Link>
            {domainProposalId ? (
              <span className="small" style={{ opacity: 0.85 }}>
                Latest: <code>{domainProposalId}</code>
              </span>
            ) : null}
          </div>
        </Panel>

        <Panel title="Constraints" subtitle="Deterministic toggles that steer recommendations and derived structure.">
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!state.intent.constraints?.offline_first}
                onChange={(e) =>
                  persist({
                    ...state,
                    intent: {
                      ...state.intent,
                      constraints: { ...state.intent.constraints, offline_first: !!e.target.checked },
                    },
                  })
                }
              />
              Offline-first
            </label>
            <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={!!state.intent.constraints?.no_payments}
                onChange={(e) =>
                  persist({
                    ...state,
                    intent: {
                      ...state.intent,
                      constraints: { ...state.intent.constraints, no_payments: !!e.target.checked },
                    },
                  })
                }
              />
              No payments
            </label>
          </div>
          <div className="hr" />
          <p className="small mb0">These toggles are inputs. The derived brief/IA changes downstream via proposals.</p>
        </Panel>

        <Panel
          title="Proposals"
          subtitle="Generate 3 deterministic proposals (mvp/balanced/expansion). Adopt one to update your project state."
        >
          <div className="row" style={{ flexWrap: "wrap" }}>
            <PrimaryButton onClick={onGenerateProposals}>Generate proposals</PrimaryButton>
            <SecondaryButton onClick={onDownloadSPELSeed}>Download SPEL seed</SecondaryButton>
            <Link className="btn" href="/director/preview">Preview packs</Link>
            <Link className="btn" href="/director/ship">Ship</Link>
          </div>

          <div className="hr" />

          {proposals.length === 0 ? (
            <p className="small">No proposals yet. Generate proposals to get a deterministic set of options.</p>
          ) : (
            <div className="cards">
              {proposals.map((p) => (
                <div className="card" key={p.id}>
                  <h3>{p.title}</h3>
                  <p>{p.tagline}</p>
                  <p className="small">
                    Sets: {p.recommended.build_intent} • {p.recommended.primary_surface} • {p.recommended.palettes.length} palettes
                  </p>
                  <div className="row" style={{ flexWrap: "wrap" }}>
                    <button className="btn primary" onClick={() => onAdopt(p)}>Adopt</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="What changes after deployment" subtitle="How you actually use this screen to improve UX/UI.">
          <ol className="small">
            <li>Select the Option + Palettes that represent the next version of your product.</li>
            <li>Generate proposals and adopt the one you want (usually Balanced).</li>
            <li>Go to <strong>Preview</strong> to sanity-check the derived structure.</li>
            <li>Go to <strong>Ship</strong> to export your next deliverables (Spec Pack / Proof Request) and redeploy.</li>
          </ol>
          <p className="small mb0">Everything stays deterministic: you are changing IDs, not typing requirements essays.</p>
        </Panel>
      </div>
    </div>
  );
}
