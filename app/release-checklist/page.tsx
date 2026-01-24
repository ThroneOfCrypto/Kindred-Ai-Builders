"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Panel } from "../../components/Panel";
import { Callout } from "../../components/Callout";
import { SecondaryButton } from "../../components/Buttons";
import { PublishReadyStatusPanel } from "../../components/PublishReadyStatusPanel";
import {
  LEGACY_LAST_BASE_PACK_KEY,
  LEGACY_LAST_PROPOSAL_PACK_KEY,
  getCurrentProjectId,
  lastBasePackKeyForProject,
  lastProposalPackKeyForProject,
} from "../../lib/state";
import { decodeBase64, tryReadZip, getManifest, validateManifest, type SpecPack } from "../../lib/spec_pack";
import { validateSpecPack, type ValidationReport } from "../../lib/validation";
import { computePackHash, getLockedPackB64, getPackGovernance, type PackHashReport, type PackGovernanceV1 } from "../../lib/pack_governance";
import { sha256Hex } from "../../lib/spec_pack_patch";
import { APP_VERSION, VALIDATOR_VERSION, SPEC_PACK_VERSION } from "../../lib/version";
import { getLatestVerifyReport, type VerifyReport as VerifyReportV1 } from "../../lib/verify";

type Tri = "pass" | "warn" | "fail";

type PackCheck = {
  present: boolean;
  readable: boolean;
  kind: "base" | "proposal" | "locked";
  note?: string;
  zip_bytes?: Uint8Array;
  pack?: SpecPack;
  manifest_ok?: boolean;
  manifest_issues?: string[];
  validation?: ValidationReport;
  pack_hash?: PackHashReport;
  zip_sha256?: string;
};

type LockCheck = {
  governance?: PackGovernanceV1 | null;
  locked_b64_present: boolean;
  snapshot_present: boolean;
  provenance_status: Tri;
  drift_status: Tri;
  notes: string[];
};

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

function resolvePackKeys(kind: "base" | "proposal", projectId: string): { scoped: string; legacy: string } {
  if (kind === "base") {
    return { scoped: lastBasePackKeyForProject(projectId), legacy: LEGACY_LAST_BASE_PACK_KEY };
  }
  return { scoped: lastProposalPackKeyForProject(projectId), legacy: LEGACY_LAST_PROPOSAL_PACK_KEY };
}

function readPackB64(kind: "base" | "proposal", projectId: string): string {
  const keys = resolvePackKeys(kind, projectId);
  try {
    return localStorage.getItem(keys.scoped) || localStorage.getItem(keys.legacy) || "";
  } catch {
    return "";
  }
}

function triFromValidation(vr: ValidationReport | undefined | null): Tri {
  if (!vr) return "fail";
  if (vr.status === "fail") return "fail";
  const warnCount = (vr.issues || []).filter((i) => i.severity === "warn").length;
  return warnCount > 0 ? "warn" : "pass";
}

function countIssues(vr: ValidationReport | undefined | null): { errors: number; warns: number } {
  const issues = vr?.issues || [];
  return {
    errors: issues.filter((i) => i.severity === "error").length,
    warns: issues.filter((i) => i.severity === "warn").length,
  };
}

async function buildPackCheck(kind: "base" | "proposal", projectId: string): Promise<PackCheck> {
  const b64 = readPackB64(kind, projectId);
  if (!b64) {
    return { kind, present: false, readable: false, note: "No cached pack ZIP found for this project." };
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(b64);
  } catch {
    return { kind, present: true, readable: false, note: "Stored pack could not be decoded (invalid base64)." };
  }

  const zr = tryReadZip(bytes);
  if (!zr.ok) {
    return { kind, present: true, readable: false, note: `ZIP parse failed: ${zr.error}` };
  }

  const pack = zr.pack;
  const m = getManifest(pack);
  const vm = validateManifest(pack);

  const vr = validateSpecPack(pack);
  const packHash = await computePackHash(pack);
  const zipSha = await sha256Hex(bytes);

  return {
    kind,
    present: true,
    readable: true,
    zip_bytes: bytes,
    zip_sha256: zipSha,
    pack,
    manifest_ok: m.ok,
    manifest_issues: vm.issues,
    validation: vr,
    pack_hash: packHash,
    note: undefined,
  };
}

async function buildLockedCheck(projectId: string): Promise<PackCheck> {
  const lockedB64 = getLockedPackB64(projectId);
  if (!lockedB64) {
    return { kind: "locked", present: false, readable: false, note: "No locked pack bytes stored for this project." };
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(lockedB64);
  } catch {
    return { kind: "locked", present: true, readable: false, note: "Locked pack could not be decoded (invalid base64)." };
  }

  const zr = tryReadZip(bytes);
  if (!zr.ok) {
    return { kind: "locked", present: true, readable: false, note: `Locked ZIP parse failed: ${zr.error}` };
  }

  const pack = zr.pack;
  const vr = validateSpecPack(pack);
  const packHash = await computePackHash(pack);
  const zipSha = await sha256Hex(bytes);

  return {
    kind: "locked",
    present: true,
    readable: true,
    zip_bytes: bytes,
    zip_sha256: zipSha,
    pack,
    validation: vr,
    pack_hash: packHash,
  };
}

function CheckRow(props: { label: string; status: Tri; detail?: string; action?: React.ReactNode }) {
  const { label, status, detail, action } = props;
  const kind = status === "pass" ? "success" : status === "warn" ? "warn" : "error";
  return (
    <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
      <div>
        <strong>{label}</strong>
        {detail ? <div className="small">{detail}</div> : null}
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <span className={["pill", `pill--${kind}`].join(" ")}>{status.toUpperCase()}</span>
        {action ? action : null}
      </div>
    </div>
  );
}

export default function ReleaseChecklistPage() {
  const [projectId, setProjectId] = useState<string>("");
  const [baseCheck, setBaseCheck] = useState<PackCheck | null>(null);
  const [proposalCheck, setProposalCheck] = useState<PackCheck | null>(null);
  const [lockedCheck, setLockedCheck] = useState<PackCheck | null>(null);
  const [lockCheck, setLockCheck] = useState<LockCheck | null>(null);
  const [verifyReport, setVerifyReport] = useState<VerifyReportV1 | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<Tri>("warn");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    try {
      setProjectId(getCurrentProjectId());
    } catch {
      setProjectId("p_unknown");
    }
  }, []);

  async function run() {
    const pid = projectId || "p_unknown";
    setStatus("Running checks...");

    const base = await buildPackCheck("base", pid);
    const proposal = await buildPackCheck("proposal", pid);
    const locked = await buildLockedCheck(pid);

    const gov = getPackGovernance(pid);
    const notes: string[] = [];

    const lockedB64 = getLockedPackB64(pid);
    const lockedB64Present = Boolean(lockedB64);
    const snapshot = gov?.last_locked;
    const snapshotPresent = Boolean(snapshot && snapshot.schema === "kindred.locked_pack_snapshot.v1");

    let provenanceStatus: Tri = "fail";
    let driftStatus: Tri = "fail";

    if (!gov) {
      notes.push("No governance object found for this project.");
      provenanceStatus = "fail";
    } else if (gov.status !== "locked") {
      notes.push("Project is not locked. Use Workbench → Adopt + Lock to create a lock snapshot.");
      provenanceStatus = "warn";
    } else if (!snapshotPresent) {
      notes.push("Governance is locked, but no lock snapshot is present.");
      provenanceStatus = "fail";
    } else {
      // Check presence of provenance fields.
      const prov = snapshot?.provenance || {};
      const required = ["base_zip_sha256", "locked_zip_sha256", "app_version", "validator_version", "spec_pack_version"] as const;
      const missing = required.filter((k) => !((prov as any)[k] || "").trim());
      if (missing.length > 0) {
        provenanceStatus = "warn";
        notes.push(`Lock snapshot is missing newer provenance fields: ${missing.join(", ")}. Re-lock to upgrade the snapshot.`);
      } else {
        provenanceStatus = "pass";
      }

      // Drift checks: prefer zip sha when available, fall back to pack hash.
      if (!locked.readable || !locked.present || !snapshot) {
        driftStatus = "fail";
        notes.push("Locked pack bytes are not readable; drift check could not run.");
      } else {
        const zipShaOk = prov.locked_zip_sha256 ? prov.locked_zip_sha256 === locked.zip_sha256 : false;
        const packHashOk = snapshot.pack_sha256 === locked.pack_hash?.pack_sha256;
        if (zipShaOk && packHashOk) {
          driftStatus = "pass";
        } else if (packHashOk) {
          driftStatus = "warn";
          notes.push("Locked pack content matches snapshot, but zip hash does not match (older snapshot or non-deterministic zip source). Re-lock to refresh.");
        } else {
          driftStatus = "fail";
          notes.push("Locked pack content does not match the stored lock snapshot. Treat this as drift.");
        }
      }
    }

    setBaseCheck(base);
    setProposalCheck(proposal);
    setLockedCheck(locked);
    setLockCheck({
      governance: gov,
      locked_b64_present: lockedB64Present,
      snapshot_present: snapshotPresent,
      provenance_status: provenanceStatus,
      drift_status: driftStatus,
      notes,
    });


    const latestVerify = getLatestVerifyReport(pid);
    setVerifyReport(latestVerify);
    setVerifyStatus(latestVerify ? latestVerify.overall : "warn");

    setStatus("Checks complete.");
  }

  useEffect(() => {
    if (!projectId) return;
    run().catch(() => {
      setStatus("Checks failed.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const overall: Tri = useMemo(() => {
    if (!baseCheck) return "warn";
    const baseTri = triFromValidation(baseCheck.validation);
    const lockTri = lockCheck ? (lockCheck.provenance_status === "fail" || lockCheck.drift_status === "fail" ? "fail" : lockCheck.provenance_status === "warn" || lockCheck.drift_status === "warn" ? "warn" : "pass") : "warn";

    if (baseTri === "fail" || lockTri === "fail" || verifyStatus === "fail") return "fail";
    if (baseTri === "warn" || lockTri === "warn" || verifyStatus === "warn") return "warn";
    return "pass";
  }, [baseCheck, lockCheck, verifyStatus]);

  function exportReport() {
    if (!baseCheck || !proposalCheck || !lockedCheck || !lockCheck) return;
    const report = {
      schema: "kindred.release_checklist_report.v1",
      captured_at_utc: new Date().toISOString(),
      app: { app_version: APP_VERSION, validator_version: VALIDATOR_VERSION, spec_pack_version: SPEC_PACK_VERSION },
      project_id: projectId || "p_unknown",
      overall,
      base: baseCheck,
      proposal: proposalCheck,
      locked: lockedCheck,
      lock: lockCheck,
      verify: { status: verifyStatus, latest_report: verifyReport },
    };
    downloadText(`release_checklist__${projectId || "p_unknown"}.json`, JSON.stringify(report, null, 2) + "\n");
  }

  return (
    <div className="container">
      <PublishReadyStatusPanel />
      <div className="hero">
        <h1>Release checklist</h1>
        <p>Local-only checks: gates, validator, lock provenance, drift detection.</p>
      </div>

      <div className="grid">
        <Panel title="Summary">
          <Callout kind={overall === "pass" ? "success" : overall === "warn" ? "warn" : "error"} title={`Overall: ${overall.toUpperCase()}`}>
            <p className="small" style={{ marginTop: 0 }}>
              Project: <code>{projectId || "p_unknown"}</code>
            </p>
            <p className="small" style={{ marginBottom: 0 }}>
              App: <code>{APP_VERSION}</code> • Validator: <code>{VALIDATOR_VERSION}</code> • Spec Pack: <code>{SPEC_PACK_VERSION}</code>
            </p>
          </Callout>

          <div className="row" style={{ marginTop: 12 }}>
            <SecondaryButton onClick={() => run()}>Re-run checks</SecondaryButton>
            <SecondaryButton onClick={() => exportReport()} disabled={!baseCheck || !proposalCheck || !lockedCheck || !lockCheck}>Download report</SecondaryButton>
            <a className="btn" href="/docs/release">Docs</a>
          </div>
          {status ? <p className="small">{status}</p> : null}
        </Panel>

        <Panel title="Packs">
          {baseCheck ? (
            <CheckRow
              label="Base pack"
              status={!baseCheck.present ? "fail" : !baseCheck.readable ? "fail" : triFromValidation(baseCheck.validation)}
              detail={!baseCheck.present || !baseCheck.readable ? baseCheck.note : (() => {
                const c = countIssues(baseCheck.validation);
                return `Validator: ${baseCheck.validation?.status} • errors ${c.errors} • warns ${c.warns}`;
              })()}
              action={<a className="btn" href="/workbench">Open Workbench</a>}
            />
          ) : null}
          <div className="hr" />
          {proposalCheck ? (
            <CheckRow
              label="Proposal pack"
              status={!proposalCheck.present ? "warn" : !proposalCheck.readable ? "fail" : triFromValidation(proposalCheck.validation)}
              detail={!proposalCheck.present ? "Proposal is optional for release checks." : !proposalCheck.readable ? proposalCheck.note : (() => {
                const c = countIssues(proposalCheck.validation);
                return `Validator: ${proposalCheck.validation?.status} • errors ${c.errors} • warns ${c.warns}`;
              })()}
            />
          ) : null}
          <div className="hr" />
          {lockedCheck ? (
            <CheckRow
              label="Locked pack bytes"
              status={!lockedCheck.present ? "warn" : !lockedCheck.readable ? "fail" : triFromValidation(lockedCheck.validation)}
              detail={!lockedCheck.present ? lockedCheck.note : !lockedCheck.readable ? lockedCheck.note : `Locked zip sha256: ${lockedCheck.zip_sha256?.slice(0, 10)}…`}
            />
          ) : null}
        </Panel>

        <Panel title="Lock provenance">
          {lockCheck ? (
            <>
              <CheckRow
                label="Provenance fields"
                status={lockCheck.provenance_status}
                detail={lockCheck.governance?.status === "locked" ? "Lock snapshot present." : "Project not locked."}
                action={<a className="btn" href="/workbench">Lock in Workbench</a>}
              />
              <div className="hr" />
              <CheckRow
                label="Drift detection"
                status={lockCheck.drift_status}
                detail="Compares locked bytes + content hashes against the stored lock snapshot."
              />

              {lockCheck.notes.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <Callout kind={lockCheck.drift_status === "fail" ? "error" : lockCheck.provenance_status === "warn" || lockCheck.drift_status === "warn" ? "warn" : "info"} title="Notes">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {lockCheck.notes.map((n, idx) => (
                        <li key={idx} className="small">{n}</li>
                      ))}
                    </ul>
                  </Callout>
                </div>
              ) : null}
            </>
          ) : (
            <p className="small">No lock check results yet.</p>
          )}
        </Panel>

        <Panel title="Verification">
          <CheckRow
            label="Latest verify report"
            status={verifyStatus}
            detail={verifyReport ? `Captured: ${verifyReport.captured_at_utc} • Plan: ${verifyReport.plan_id}` : "No verify report stored for this project yet."}
            action={<a className="btn" href="/verify">Open Verify</a>}
          />

          {verifyReport && verifyReport.overall !== "pass" ? (
            <div style={{ marginTop: 12 }}>
              <Callout kind={verifyReport.overall === "pass" ? "success" : verifyReport.overall === "warn" ? "warn" : "error"} title="Verify details">
                <p className="small" style={{ marginTop: 0 }}>
                  Overall: <code>{verifyReport.overall}</code> • Steps: <code>{verifyReport.steps.length}</code>
                </p>
                <p className="small" style={{ marginBottom: 0 }}>
                  Upload a new report in <code>/verify</code> when you re-run local verification.
                </p>
              </Callout>
            </div>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
