# Publish-Ready Threshold v1
**Status:** Normative • **Applies to:** Book + Embedded Repo + Kindred UX/UI (public, Vercel deployed)  
**Version:** v1 • **Date:** 2026-01-05 • **Owner:** SDDE OS governance

This document defines what “publish-ready” means and provides a **pass/fail checklist** for:
1) the **book** (Design to Ship with AI / SDDE OS),  
2) the **embedded repo + tooling**, and  
3) the **Kindred public product** (UX/UI deployed on Vercel for real users).

**Rule:** You may not claim “publish-ready / production-ready / GA / v1 complete” unless this checklist is **PASS** with attached evidence.

---

## 0) What “Publish-Ready” means

“Publish-ready” means:

- A beginner can complete the **Golden Path** without dead ends.
- Intent is captured **deterministically** (no free-text requirements intake).
- AI is **proposal-only** (never silently changes truth).
- “Ship” claims are backed by **evidence artefacts** (reports, hashes, ledgers).
- The system is safe, reliable, and supportable for real users.

### 0.1 Release classes (labels you may use publicly)

| Label | What you may claim | Minimum bar |
|---|---|---|
| **Internal Alpha** | “Functional, not stable.” | Core rails run locally; major gaps allowed; no public promise. |
| **Public Beta** | “Usable; some rough edges.” | Publish-ready checklist is PASS except items explicitly marked “Beta Allowed.” |
| **GA / v1** | “Production-ready.” | Publish-ready checklist is PASS **with no Beta Allowed exceptions**. |

**Default:** if you haven’t met GA/v1 bar, call it **Public Beta** (never “production-ready”).

---

## 1) Absolute invariants (must remain true)

These are non-negotiable. Any “publish-ready” claim is invalid if any invariant is violated.

### 1.1 Deterministic beginner intake
- Beginner intent enters via **schema-locked choices** (`intent/intake.json`).
- Free text is **non-normative** and **Advanced-only** by default.

### 1.2 Proposal-only AI + explicit adopt/lock
- AI suggests only; humans adopt.
- Locks are explicit; unlocks are explicit.

### 1.3 Deterministic packs/hashes
- Spec/Repo/Evidence packs are deterministic (stable ordering, stable timestamps, stable JSON).
- Hashes reproduce for identical inputs.

### 1.4 Offline-first kernel + portable escape hatches
- The kernel works with no network calls.
- Export paths exist (Spec Pack, Repo Pack, Backup ZIP, Evidence Bundle).

### 1.5 Kernel neutrality
- Vendor/provider specifics are **Kits**, not kernel requirements.

---

## 2) Evidence requirements (what must be produced)

A checklist item is only PASS if the associated evidence exists.

### 2.1 Required artefacts (minimum set)
- **Spec Pack** (`spec_pack.zip`) with:
  - `spec_pack_manifest.json`
  - `intent/intake.json` (schema-locked)
  - `intent/selections.json` (snapshot + provenance pointers)
  - `contracts/rigor.json`
- **Repo Pack** (`repo_pack.zip`) locked and reproducible
- **Gate reports** (`dist/*`) proving:
  - schema validation
  - determinism conformance
  - golden path completion
- **Evidence ledger** (local-first + exportable):
  - `evidence/ledger.json` or exportable equivalent in backup
- **Failure records** captured for deploy/debug failures

### 2.2 Required reports (minimum)
Each report must be stored as a file artefact (and ideally linked from the release notes).

- `dist/publish_ready_report.md` (this checklist filled out, with PASS/FAIL)
- `dist/golden_path_report.json` (or `.md`)
- `dist/determinism_report.json` (Spec Pack determinism + Evidence Bundle determinism at minimum)
- `dist/schema_validation_report.json`
- `dist/security_report.md` (threat model + checks run + findings)
- `dist/accessibility_report.md` (manual + automated checks)
- `dist/performance_report.md` (page performance + build time)
- `dist/release_notes.md` (what changed, compatibility)

**Rule:** No report, no pass.

---

## 3) Publish-ready checklist — Book

### 3.1 Manuscript governance
- [ ] **B1** The manuscript includes the **Engineering Spec & Contributor Contract** as a normative section and clearly states the truth hierarchy.
- [ ] **B2** The book’s claims match the repo behavior (intake, locks, packs, evidence, advanced mode).
- [ ] **B3** Versioning is explicit: book version ↔ repo version mapping is stated.
- [ ] **B4** Licensing is clear (copyright + OSS license for embedded repo).
- [ ] **B5** The book contains an explicit “What this is / isn’t” safety statement (not legal/medical advice; no guarantees).

**Evidence:** `dist/publish_ready_report.md` includes citations to chapters/sections.

### 3.2 Runnable repo extraction (book → repo)
- [ ] **B6** A beginner can extract the embedded repo from the book using a documented command.
- [ ] **B7** The extracted repo passes its own verification gates (`sdde_verify` / equivalent).
- [ ] **B8** Any external dependency is either:
  - optional (Kit), or
  - vendored/embedded, or
  - explicitly documented with a deterministic install step.

**Evidence:** `dist/golden_path_report.json` includes extraction logs and command transcript.

### 3.3 No-elision code fences
- [ ] **B9** Every code fence marked runnable runs/compiles as-is.
- [ ] **B10** No ellipses `...` inside runnable fences; no TODO stubs inside runnable fences.
- [ ] **B11** Every command shown includes working paths and expected output signatures.

**Evidence:** `dist/book_fencecheck_report.json` (or equivalent) and sample outputs.

### 3.4 Beginner experience quality
- [ ] **B12** The beginner “Day-0 proof” is a single coherent sequence with no dead ends.
- [ ] **B13** The book teaches deterministic intake (no free-text requirements) with examples.
- [ ] **B14** The book teaches authority boundaries (proposal-only AI, adopt/lock) with examples.
- [ ] **B15** The book teaches evidence-first shipping (reports, ledgers, failure records) with examples.
- [ ] **B16** The book includes “Troubleshooting” grounded in real failure records.

**Evidence:** The Golden Path chapter(s) + `dist/golden_path_report.json`.

### 3.5 Publish polish
- [ ] **B17** Table of contents is correct; internal links resolve.
- [ ] **B18** Diagrams/screenshots are readable (accessible contrast, captions).
- [ ] **B19** Terminology is consistent (Palettes/Domains/Kits; Council; Spec Pack/Repo Pack).
- [ ] **B20** All “must” claims have proofs (reports or executable steps).

**Evidence:** `dist/publish_ready_report.md` with link check results.

---

## 4) Publish-ready checklist — Repo (embedded tools + kernel)

### 4.1 Deterministic artefact spine
- [ ] **R1** Spec Pack generation is deterministic (byte-identical across runs).
- [ ] **R2** Repo Pack generation is deterministic given the same inputs.
- [ ] **R3** Evidence bundle (or backup evidence export) is deterministic.
- [ ] **R4** Stable JSON serialization is enforced for exported artefacts.
- [ ] **R5** Schemas exist for all first-class artefacts and are versioned (`v1`, `v2`, …).

**Evidence:** `dist/determinism_report.json` + sample hashes.

### 4.2 Validation and gates
- [ ] **R6** Validation registry covers all required files (manifest, intake, selections, rigor contract).
- [ ] **R7** Validators fail loudly on schema-locked violations (and are not “best-effort only”).
- [ ] **R8** Gate outputs are written to `dist/` and are human-readable.
- [ ] **R9** “Ship” gating logic uses Rigor Dial semantics consistently.

**Evidence:** `dist/schema_validation_report.json` + `dist/publish_ready_report.md`.

### 4.3 Security and safety
- [ ] **R10** No secrets are committed (repo scan passes).
- [ ] **R11** Keys/tokens are local-first; never logged; never exported by default.
- [ ] **R12** Any network calls are behind explicit configuration and/or Kits.
- [ ] **R13** Threat model exists for public-facing product and repo tooling.

**Evidence:** `dist/security_report.md` + scan outputs (as attachments or excerpts).

### 4.4 Reliability and maintainability
- [ ] **R14** Typecheck/build/test pass in CI (and locally).
- [ ] **R15** Backups restore correctly (including evidence + rigor).
- [ ] **R16** Migration paths exist for evolving schemas and state.
- [ ] **R17** Errors are surfaced with “jump to fix” guidance (where applicable).

**Evidence:** `dist/golden_path_report.json` + restore test evidence.

### 4.5 Release engineering
- [ ] **R18** A tagged release process exists and produces deterministic artifacts.
- [ ] **R19** Release notes include compatibility statements and migration guidance.
- [ ] **R20** CI publishes reports (as artifacts) for each tag.

**Evidence:** CI logs + release artifacts referenced in `dist/release_notes.md`.

---

## 5) Publish-ready checklist — Kindred UX/UI (public product on Vercel)

This section is about being public-facing for real customers.

### 5.1 Product posture and onboarding (Director stream)
- [ ] **U1** The default flow is a single coherent rail (Spark→Ship) with one primary next action.
- [ ] **U2** No beginner step requires free-text requirements entry.
- [ ] **U3** Advanced Mode is explicit opt-in and never required to complete the Golden Path.
- [ ] **U4** The UI always provides an escape hatch (export Spec Pack / Repo Pack / Backup / Evidence).
- [ ] **U5** “Deploy & Debug” captures failure records as artefacts and keeps user in the Ship hub.

**Evidence:** Screenshots + a scripted Golden Path walkthrough (`dist/golden_path_report.json`).

### 5.2 UX correctness (no dead ends)
- [ ] **U6** Every route has a defined “next action” or return path.
- [ ] **U7** Empty states are guided (no blank canvases).
- [ ] **U8** Errors are actionable (what happened, why it matters, what to do next).
- [ ] **U9** Copy is consistent with governance language (“proposals,” “adopt,” “lock,” “evidence”).

**Evidence:** Screenshot audit and test scripts (or manual checklist signoff).

### 5.3 Accessibility (minimum viable public bar)
- [ ] **U10** WCAG-minded contrast is acceptable for core flows.
- [ ] **U11** Keyboard navigation works for Ship, Brief/Intake, export actions.
- [ ] **U12** Form controls have labels; focus states visible.
- [ ] **U13** “Reduced motion” is respected (if animations exist).

**Evidence:** `dist/accessibility_report.md` (manual + automated checks).

### 5.4 Performance and stability
- [ ] **U14** App loads reliably on mid-range mobile devices.
- [ ] **U15** Core pages render under acceptable latency on production.
- [ ] **U16** Client-side storage use is bounded and safe (IndexedDB/localStorage quotas handled).
- [ ] **U17** Build completes within deployment constraints (no runaway builds).

**Evidence:** `dist/performance_report.md` + production build logs.

### 5.5 Privacy, data handling, and supportability
- [ ] **U18** Privacy policy exists and matches reality.
- [ ] **U19** Data storage model is explicit (local-first; what is stored where).
- [ ] **U20** Telemetry is off by default; opt-in is explicit (if present).
- [ ] **U21** Export/backup exists for user data (portable, readable).
- [ ] **U22** Support channels exist (contact, docs, FAQ) and are reachable from the app.

**Evidence:** Policies published + support links verified.

### 5.6 Abuse resistance (public product bar)
- [ ] **U23** Any public endpoints have rate limiting and input validation.
- [ ] **U24** Debug log submission does not accept/retain secrets by default (redaction guidance exists).
- [ ] **U25** Error boundaries prevent leaking stack traces or sensitive config.

**Evidence:** `dist/security_report.md` + endpoint review.

---

## 6) Vercel production readiness checklist

### 6.1 Build + deploy hygiene
- [ ] **V1** Production build uses pinned versions and deterministic config.
- [ ] **V2** Environment variables are documented (including required vs optional).
- [ ] **V3** Preview deployments exist for every PR (recommended).
- [ ] **V4** Rollback procedure exists and is tested.
- [ ] **V5** Build caches and build steps are controlled (no “mystery build”).

**Evidence:** CI logs + deployment checklist signoff.

### 6.2 Runtime safety
- [ ] **V6** API routes validate payloads and return safe errors.
- [ ] **V7** No secrets are exposed to the client bundle.
- [ ] **V8** Server-side AI endpoints are proposal-only and hardened (auth, limits).
- [ ] **V9** Logs are reviewed and scrubbed (no sensitive material).
- [ ] **V10** Incident response checklist exists.

**Evidence:** `dist/security_report.md` + incident runbook.

---

## 7) The “Publish-Ready” sign-off artifact (required)

Before declaring publish-ready, produce:

### 7.1 `dist/publish_ready_report.md` (filled checklist)
This doc must include:
- PASS/FAIL for each item
- who signed off
- links to evidence artefacts in `dist/`
- exceptions explicitly listed (only allowed in Public Beta)

### 7.2 Minimum “proof bundle” for the release
A release must include or reference:
- `dist/publish_ready_report.md`
- `dist/golden_path_report.json`
- `dist/determinism_report.json`
- `dist/schema_validation_report.json`
- `dist/security_report.md`
- `dist/accessibility_report.md`
- `dist/performance_report.md`
- `dist/release_notes.md`

**Rule:** If any are missing, you are not publish-ready.

---

## 8) Templates (copy/paste)

### 8.1 Publish-ready report skeleton
Create: `dist/publish_ready_report.md`

```md
# Publish-Ready Report
Release: vX.Y.Z
Date: YYYY-MM-DD
Signed by: NAME(S)

## Summary
- Book: PASS/FAIL
- Repo: PASS/FAIL
- Kindred UI: PASS/FAIL
- Vercel: PASS/FAIL
- Overall: PASS/FAIL

## Exceptions (Beta Only)
- (None)

## Evidence Index
- dist/golden_path_report.json
- dist/determinism_report.json
- dist/schema_validation_report.json
- dist/security_report.md
- dist/accessibility_report.md
- dist/performance_report.md
- dist/release_notes.md

## Checklist Results
- B1: PASS …
...
```

### 8.2 Determinism report skeleton
Create: `dist/determinism_report.json`

```json
{
  "schema": "kindred.determinism_report.v1",
  "captured_at_utc": "YYYY-MM-DDTHH:MM:SSZ",
  "spec_pack": {
    "run_1_sha256": "…",
    "run_2_sha256": "…",
    "byte_identical": true
  },
  "repo_pack": {
    "run_1_sha256": "…",
    "run_2_sha256": "…",
    "byte_identical": true
  },
  "evidence_bundle": {
    "run_1_sha256": "…",
    "run_2_sha256": "…",
    "byte_identical": true
  },
  "notes": []
}
```

---

## 9) Refusal criteria (publish-ready claim must be rejected if…)

Reject “publish-ready” if any of these occur:
- free-text requirements intake is required for the beginner rail
- Council DSL is exposed by default without explicit advanced opt-in
- AI silently edits state or code
- packs are non-deterministic without explanation and compensating evidence
- kernel requires paid services/accounts to complete the Golden Path
- public product lacks privacy policy, basic security posture, or backup/export

---

**End of Publish-Ready Threshold v1**
