import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

function fail(msg) {
  process.stderr.write(String(msg) + "\n");
  process.exit(1);
}

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`Invalid JSON in ${p}: ${e?.message || e}`);
  }
}

/**
 * Deterministic, CI-safe output rules (Vercel-first):
 * - Default: print a short summary only
 * - Optional: write full JSON report to a file (--out-json <path>)
 * - Optional: print full JSON to stdout (--stdout-json)
 *
 * This prevents log overflow / buffer truncation during Vercel builds.
 * (Full report remains available as an artifact file when requested.)
 */

const ID_RE = /^[a-z][a-z0-9._-]*$/;
const TABLES = new Set(["experience", "workshop", "capability", "evidence", "principle"]);
const CORE_TAGS_PATH = "periodic/v1/tags/core_tags.v1.json";
const DOMAIN_COMPLETION_PATH = "periodic/v1/domains/domain_completion.v1.json";
const TABLE_METADATA_PATH = "periodic/v1/tables/table_metadata.v1.json";

// Optional hostile-reader trace: structured, canonicalizable, reproducible.
let TRACE_ENABLED = false;
let TRACE_HASH_ONLY = false;
let TRACE = []; // Array<ViolationTrace>
let SYSTEM_KAPPA = []; // Array<{system_id:string, hash_sha256:string}>
let SYSTEM_OBLIGATIONS = []; // Array<{system_id:string, obligations_hash_sha256:string}>

let CORE_TAGS = null; // Set<string> | null
let PROFILES = null; // {default_profile:string, profiles:object} | null
let ACTIVE_PROFILE = "ship";
let PROFILE_OVERRIDES = {}; // ruleId -> "error"|"warn"|"ignore"
let ACTIVE_PACKS = null; // string[] | null (enabled bond pack ids)
let KNOWN_PACK_IDS = null; // Set<string> | null
let ENABLED_PACK_IDS = null; // Set<string> | null

// SPEL semantics are explicit doctrine. Default is identity-bearing endorsements.
let SPEL_SEMANTICS = {
  endorsement_semantics: "identity_bearing", // "identity_bearing" | "meaning_preserving" (legacy: post_condition)
  declassification_semantics: "identity_bearing", // "identity_bearing" | "meaning_preserving" (legacy: post_condition)
  control_flow_semantics: "identity_bearing", // "identity_bearing" | "meaning_preserving" (legacy: post_condition)
  termination_semantics: "identity_bearing", // "identity_bearing" | "meaning_preserving" (legacy: post_condition)
  timing_semantics: "identity_bearing", // "identity_bearing" | "meaning_preserving" (legacy: post_condition)
};

function loadDomainCompletion(strict, errors, warnings) {
  const abs = path.resolve(process.cwd(), DOMAIN_COMPLETION_PATH);
  if (!fs.existsSync(abs)) {
    if (strict) errors.push(`domain_completion: missing file (${DOMAIN_COMPLETION_PATH})`);
    return null;
  }
  const doc = readJson(abs);
  if (!isObject(doc)) {
    errors.push(`domain_completion: expected object in ${DOMAIN_COMPLETION_PATH}`);
    return null;
  }
  keysAreClosed(doc, new Set(["schema","version","packs"]), errors, "domain_completion");
  if (doc.schema !== "periodic.domain_completion.v1") {
    errors.push("domain_completion.schema: expected 'periodic.domain_completion.v1'");
    return null;
  }
  if (!Array.isArray(doc.packs)) {
    errors.push("domain_completion.packs: expected array");
    return null;
  }
  const byPack = new Map();
  for (const p of doc.packs) {
    if (!isObject(p)) { errors.push("domain_completion.packs[]: expected object"); continue; }
    keysAreClosed(p, new Set(["pack_id","status","min_positive_examples","min_negative_examples"]), errors, "domain_completion.pack");
    if (typeof p.pack_id !== "string" || !p.pack_id.trim()) { errors.push("domain_completion.pack.pack_id: required"); continue; }
    if (byPack.has(p.pack_id)) errors.push(`domain_completion.packs: duplicate pack_id '${p.pack_id}'`);
    const status = typeof p.status === "string" ? p.status : "complete";
    const minPos = Number.isFinite(p.min_positive_examples) ? p.min_positive_examples : 1;
    const minNeg = Number.isFinite(p.min_negative_examples) ? p.min_negative_examples : 1;
    byPack.set(p.pack_id, { pack_id: p.pack_id, status, min_positive_examples: minPos, min_negative_examples: minNeg });
  }
  // Determinism risk note: keep packs sorted in file.
  const ids = [...byPack.keys()];
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== sorted[i]) {
      warnings.push("domain_completion: packs are not sorted by pack_id (determinism risk)");
      break;
    }
  }
  return byPack;
}

function loadSpelSemantics(pRel, strict, errors, warnings) {
  if (!pRel || typeof pRel !== "string") return SPEL_SEMANTICS;
  const abs = path.resolve(process.cwd(), pRel);
  if (!fs.existsSync(abs)) {
    if (strict) errors.push(`spel_semantics: missing file (${pRel})`);
    return SPEL_SEMANTICS;
  }
  const doc = readJson(abs);
  const normalizeMode = (v) => {
    if (v === 'post_condition') return 'meaning_preserving';
    return v;
  };

  const endorsementRaw = doc?.endorsement_semantics;
  const endorsement = normalizeMode(endorsementRaw);
  if (endorsement !== "identity_bearing" && endorsement !== "meaning_preserving") {
    errors.push(`spel_semantics: endorsement_semantics must be 'identity_bearing' or 'meaning_preserving' (legacy 'post_condition' allowed) (${pRel})`);
    return SPEL_SEMANTICS;
  }

  const declassRaw = doc?.declassification_semantics;
  const declassification = normalizeMode(declassRaw || 'identity_bearing');
  if (declassification !== "identity_bearing" && declassification !== "meaning_preserving") {
    errors.push(`spel_semantics: declassification_semantics must be 'identity_bearing' or 'meaning_preserving' (legacy 'post_condition' allowed) (${pRel})`);
    return SPEL_SEMANTICS;
  }

  const cfRaw = doc?.control_flow_semantics;
  const controlFlow = normalizeMode(cfRaw || 'identity_bearing');
  if (controlFlow !== "identity_bearing" && controlFlow !== "meaning_preserving") {
    errors.push(`spel_semantics: control_flow_semantics must be 'identity_bearing' or 'meaning_preserving' (legacy 'post_condition' allowed) (${pRel})`);
    return SPEL_SEMANTICS;
  }
  const termRaw = doc?.termination_semantics;
  const termination = normalizeMode(termRaw || 'identity_bearing');
  if (termination !== "identity_bearing" && termination !== "meaning_preserving") {
    errors.push(`spel_semantics: termination_semantics must be 'identity_bearing' or 'meaning_preserving' (legacy 'post_condition' allowed) (${pRel})`);
    return SPEL_SEMANTICS;
  }

  const timeRaw = doc?.timing_semantics;
  const timing = normalizeMode(timeRaw || 'identity_bearing');
  if (timing !== "identity_bearing" && timing !== "meaning_preserving") {
    errors.push(`spel_semantics: timing_semantics must be 'identity_bearing' or 'meaning_preserving' (legacy 'post_condition' allowed) (${pRel})`);
    return SPEL_SEMANTICS;
  }




  return { endorsement_semantics: endorsement, declassification_semantics: declassification, control_flow_semantics: controlFlow, termination_semantics: termination, timing_semantics: timing };
}

function loadProfiles(indexProfilesPath, errors, strict, requestedProfile) {
  if (!indexProfilesPath) {
    if (strict) errors.push("index.profiles.path missing (required in --strict)");
    return null;
  }
  const pAbs = path.resolve(process.cwd(), indexProfilesPath);
  if (!fs.existsSync(pAbs)) {
    if (strict) errors.push(`profiles: not found (${indexProfilesPath})`);
    return null;
  }
  let obj = null;
  try { obj = JSON.parse(fs.readFileSync(pAbs, "utf8")); } catch (e) {
    errors.push(`profiles: failed to parse (${indexProfilesPath}): ${e.message}`);
    return null;
  }
  if (!obj || obj.schema !== "periodic.profiles.v1") {
    errors.push(`profiles: expected schema periodic.profiles.v1 (${indexProfilesPath})`);
    return null;
  }
  const defaultProfile = obj.default_profile || "ship";
  const name = requestedProfile || defaultProfile;
  if (!obj.profiles || !obj.profiles[name]) {
    errors.push(`profiles: unknown profile '${name}' (known: ${Object.keys(obj.profiles || {}).join(", ")})`);
    return null;
  }
  ACTIVE_PROFILE = name;
  PROFILE_OVERRIDES = (obj.profiles[name].severity_overrides) || {};
  ACTIVE_PACKS = Array.isArray(obj.profiles[name].enabled_packs) ? obj.profiles[name].enabled_packs : null;
  PROFILES = obj;
  return obj;
}

function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

function keysAreClosed(obj, allowed, errors, context) {
  for (const k of Object.keys(obj)) {
    if (allowed.has(k)) continue;
    if (k.startsWith("x_")) continue; // reserved extension namespace
    errors.push(`${context}: unknown key '${k}'`);
  }
}

// Stable JSON for deterministic receipts and hostile-reader audit output.
function stableStringify(value) {
  const seen = new WeakSet();
  function norm(v) {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return "[Circular]";
    seen.add(v);
    if (Array.isArray(v)) return v.map(norm);
    const out = {};
    const keys = Object.keys(v).sort((a, b) => a.localeCompare(b));
    for (const k of keys) out[k] = norm(v[k]);
    return out;
  }
  return JSON.stringify(norm(value));
}

function sha256Hex(s) {
  const h = crypto.createHash("sha256");
  if (Buffer.isBuffer(s)) h.update(s);
  else h.update(String(s), "utf8");
  return h.digest("hex");
}

function computeKeyIdFromPublicKey(pubKey) {
  try {
    const der = pubKey.export({ type: 'spki', format: 'der' });
    return 'sha256:' + sha256Hex(Buffer.from(der));
  } catch {
    // Fallback to hashing PEM bytes (less ideal, but deterministic).
    const pem = pubKey.export({ type: 'spki', format: 'pem' }).toString();
    return 'sha256:' + sha256Hex(Buffer.from(pem, 'utf8'));
  }
}

function canonicalizeTrace(entries) {
  const arr = Array.isArray(entries) ? entries.slice() : [];
  arr.sort((a, b) => {
    // Include profile + waived + source_pack so the trace hash is stable even when
    // different internal enumeration orders would otherwise reshuffle equivalent entries.
    const ka = `${a.profile || ""}|${a.severity || ""}|${a.kind || ""}|${a.rule_id || ""}|${a.compound_id || ""}|${a.waived ? "1" : "0"}|${a.source_pack || ""}|${a.policy_uri || ""}|${stableStringify(a.atom || null)}|${stableStringify(a.requires || null)}|${stableStringify(a.obligations || null)}|${stableStringify(a.evidence || null)}|${stableStringify(a.remediation || null)}|${stableStringify(a.waiver_scars || null)}|${a.message || ""}`;
    const kb = `${b.profile || ""}|${b.severity || ""}|${b.kind || ""}|${b.rule_id || ""}|${b.compound_id || ""}|${b.waived ? "1" : "0"}|${b.source_pack || ""}|${b.policy_uri || ""}|${stableStringify(b.atom || null)}|${stableStringify(b.requires || null)}|${stableStringify(b.obligations || null)}|${stableStringify(b.evidence || null)}|${stableStringify(b.remediation || null)}|${stableStringify(b.waiver_scars || null)}|${b.message || ""}`;
    return ka.localeCompare(kb);
  });
  return arr;
}


function toExplainTraceV2(entries) {
  function cloneValueForTraceV2(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== "object") return v;
    try { return JSON.parse(JSON.stringify(v)); } catch { return v; }
  }
  const src = Array.isArray(entries) ? entries : [];
  const out = src.map((e) => {
    const profile = (e && typeof e.profile === "string" && e.profile.trim()) ? e.profile : ACTIVE_PROFILE;
    const policyUri = (e && typeof e.policy_uri === "string" && e.policy_uri.trim())
      ? e.policy_uri
      : ("spel://policy/profile/" + ACTIVE_PROFILE);
    const kind = (e && typeof e.kind === "string" && e.kind.trim()) ? e.kind : "compound";
    const ruleId = (e && typeof e.rule_id === "string" && e.rule_id.trim()) ? e.rule_id : null;
    const sev = (e && typeof e.severity === "string" && e.severity.trim()) ? e.severity : null;
    const compoundId = (e && typeof e.compound_id === "string" && e.compound_id.trim()) ? e.compound_id : null;
    const because = (e && typeof e.because === "string" && e.because.trim()) ? e.because : null;

    return {
      profile,
      policy: { uri: policyUri },
      kind,
      target: { compound_id: compoundId },
      rule_id: ruleId,
      severity: sev,
      fired_because: { because, atom: cloneValueForTraceV2((e && e.atom) ? e.atom : null) },
      requires: cloneValueForTraceV2((e && e.requires) ? e.requires : null),
      obligations: cloneValueForTraceV2((e && e.obligations) ? e.obligations : null),
      evidence: cloneValueForTraceV2((e && e.evidence) ? e.evidence : null),
      remediation: cloneValueForTraceV2((e && e.remediation) ? e.remediation : null),
      source_pack: (e && typeof e.source_pack === "string" && e.source_pack.trim()) ? e.source_pack : null,
      waived: Boolean(e && e.waived),
      waiver_scars: cloneValueForTraceV2((e && e.waiver_scars) ? e.waiver_scars : null),
      message: (e && typeof e.message === "string" && e.message.trim()) ? e.message : null,
    };
  });

  out.sort((a, b) => {
    const ka = `${a.profile || ""}|${a.severity || ""}|${a.kind || ""}|${a.rule_id || ""}|${a.target?.compound_id || ""}|${a.waived ? "1" : "0"}|${a.source_pack || ""}|${a.policy?.uri || ""}|${stableStringify(a.fired_because || null)}|${stableStringify(a.requires || null)}|${stableStringify(a.obligations || null)}|${stableStringify(a.evidence || null)}|${stableStringify(a.remediation || null)}|${stableStringify(a.waiver_scars || null)}|${a.message || ""}`;
    const kb = `${b.profile || ""}|${b.severity || ""}|${b.kind || ""}|${b.rule_id || ""}|${b.target?.compound_id || ""}|${b.waived ? "1" : "0"}|${b.source_pack || ""}|${b.policy?.uri || ""}|${stableStringify(b.fired_because || null)}|${stableStringify(b.requires || null)}|${stableStringify(b.obligations || null)}|${stableStringify(b.evidence || null)}|${stableStringify(b.remediation || null)}|${stableStringify(b.waiver_scars || null)}|${b.message || ""}`;
    return ka.localeCompare(kb);
  });

  return out;
}

function hashExplainTraceV2(v2) {
  const canon = Buffer.from(stableStringify(v2) + "\n", "utf8");
  return sha256Hex(canon);
}

// Explain Trace v3: v2 + explicit policy digests + semantics binding for machine replay.
// This format is intended to be portable and unambiguous for LLM remediation loops.
function toExplainTraceV3(entries, policyBinding) {
  function cloneValue(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== "object") return v;
    try { return JSON.parse(JSON.stringify(v)); } catch { return v; }
  }
  const src = Array.isArray(entries) ? entries : [];
  const out = src.map((e) => {
    const profile = (e && typeof e.profile === "string" && e.profile.trim()) ? e.profile : ACTIVE_PROFILE;
    const policyUri = (e && typeof e.policy_uri === "string" && e.policy_uri.trim())
      ? e.policy_uri
      : (policyBinding?.uri || ("spel://policy/profile/" + ACTIVE_PROFILE));
    const kind = (e && typeof e.kind === "string" && e.kind.trim()) ? e.kind : "compound";
    const ruleId = (e && typeof e.rule_id === "string" && e.rule_id.trim()) ? e.rule_id : null;
    const sev = (e && typeof e.severity === "string" && e.severity.trim()) ? e.severity : null;
    const compoundId = (e && typeof e.compound_id === "string" && e.compound_id.trim()) ? e.compound_id : null;
    const because = (e && typeof e.because === "string" && e.because.trim()) ? e.because : null;
    return {
      v: 3,
      profile,
      policy: {
        uri: policyUri,
        digest: policyBinding?.digest?.sha256 ? { sha256: String(policyBinding.digest.sha256) } : null,
        semantics_digest: policyBinding?.semantics_digest?.sha256 ? { sha256: String(policyBinding.semantics_digest.sha256) } : null,
      },
      kind,
      target: { compound_id: compoundId },
      rule_id: ruleId,
      severity: sev,
      fired_because: {
        because,
        atom: cloneValue((e && e.atom) ? e.atom : null),
      },
      requires: cloneValue((e && e.requires) ? e.requires : null),
      obligations: cloneValue((e && e.obligations) ? e.obligations : null),
      evidence: cloneValue((e && e.evidence) ? e.evidence : null),
      remediation: cloneValue((e && e.remediation) ? e.remediation : null),
      source_pack: (e && typeof e.source_pack === "string" && e.source_pack.trim()) ? e.source_pack : null,
      waived: Boolean(e && e.waived),
      waiver_scars: cloneValue((e && e.waiver_scars) ? e.waiver_scars : null),
      message: (e && typeof e.message === "string" && e.message.trim()) ? e.message : null,
    };
  });

  out.sort((a, b) => {
    const ka = `${a.profile || ""}|${a.severity || ""}|${a.kind || ""}|${a.rule_id || ""}|${a.target?.compound_id || ""}|${a.waived ? "1" : "0"}|${a.source_pack || ""}|${a.policy?.uri || ""}|${stableStringify(a.fired_because || null)}|${stableStringify(a.requires || null)}|${stableStringify(a.obligations || null)}|${stableStringify(a.evidence || null)}|${stableStringify(a.remediation || null)}|${stableStringify(a.waiver_scars || null)}|${a.message || ""}`;
    const kb = `${b.profile || ""}|${b.severity || ""}|${b.kind || ""}|${b.rule_id || ""}|${b.target?.compound_id || ""}|${b.waived ? "1" : "0"}|${b.source_pack || ""}|${b.policy?.uri || ""}|${stableStringify(b.fired_because || null)}|${stableStringify(b.requires || null)}|${stableStringify(b.obligations || null)}|${stableStringify(b.evidence || null)}|${stableStringify(b.remediation || null)}|${stableStringify(b.waiver_scars || null)}|${b.message || ""}`;
    return ka.localeCompare(kb);
  });
  return out;
}

function hashExplainTraceV3(v3) {
  const canon = Buffer.from(stableStringify(v3) + "\n", "utf8");
  return sha256Hex(canon);
}

// Explain Trace v6: v3 + closure satisfaction mapping.
// This makes receipts actionable and auditable: which evidence requirements are satisfied vs missing.
function toExplainTraceV6(entries, policyBinding) {
  function cloneValue(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== "object") return v;
    try { return JSON.parse(JSON.stringify(v)); } catch { return v; }
  }

  const src = Array.isArray(entries) ? entries : [];
  const out = src.map((e) => {
    const profile = (e && typeof e.profile === "string" && e.profile.trim()) ? e.profile : ACTIVE_PROFILE;
    const policyUri = (e && typeof e.policy_uri === "string" && e.policy_uri.trim())
      ? e.policy_uri
      : (policyBinding?.uri || ("spel://policy/profile/" + ACTIVE_PROFILE));
    const kind = (e && typeof e.kind === "string" && e.kind.trim()) ? e.kind : "compound";
    const ruleId = (e && typeof e.rule_id === "string" && e.rule_id.trim()) ? e.rule_id : null;
    const sev = (e && typeof e.severity === "string" && e.severity.trim()) ? e.severity : null;
    const compoundId = (e && typeof e.compound_id === "string" && e.compound_id.trim()) ? e.compound_id : null;
    const because = (e && typeof e.because === "string" && e.because.trim()) ? e.because : null;

    const evidenceIds = Array.isArray(e?.evidence?.evidence_ids) ? e.evidence.evidence_ids.map(String) : [];
    const missingEvidenceIds = Array.isArray(e?.evidence?.missing_evidence_ids) ? e.evidence.missing_evidence_ids.map(String) : [];
    const missingEvidenceBindingIds = Array.isArray(e?.evidence?.missing_evidence_binding_ids) ? e.evidence.missing_evidence_binding_ids.map(String) : [];

    const missingSet = new Set(missingEvidenceIds);
    const missingBindingSet = new Set(missingEvidenceBindingIds);
    const satisfiedEvidenceIds = evidenceIds.filter((id) => !missingSet.has(id));

    // Deterministic evidence satisfaction mapping.
    // v6 allows receipts to bind which evidence satisfied which rule, not just that evidence existed somewhere.
    let evidence_satisfied_by = null;
    if (Array.isArray(e?.evidence_satisfied_by)) {
      evidence_satisfied_by = e.evidence_satisfied_by.map((x) => {
        const evidence_id = String(x?.evidence_id || "");
        const satisfaction_mode = (x && typeof x.satisfaction_mode === "string" && x.satisfaction_mode.trim())
          ? x.satisfaction_mode.trim()
          : "direct";
        const derivation_steps = Array.isArray(x?.derivation_steps)
          ? x.derivation_steps.map((s) => ({
            parent_evidence_id: typeof s?.parent_evidence_id === 'string' ? s.parent_evidence_id : null,
            inference_rule_id: typeof s?.inference_rule_id === 'string' ? s.inference_rule_id : null,
            context_id: typeof s?.context_id === 'string' ? s.context_id : null,
            membrane_edge_id: typeof s?.membrane_edge_id === 'string' ? s.membrane_edge_id : null,
            justification_hash_sha256: typeof s?.justification_hash_sha256 === 'string' ? s.justification_hash_sha256 : null,
          })).filter((s) => s.parent_evidence_id || s.inference_rule_id || s.context_id || s.membrane_edge_id || s.justification_hash_sha256)
          : [];
        const satisfied_by = Array.isArray(x?.satisfied_by) ? x.satisfied_by.map((y) => ({
          kind: typeof y?.kind === "string" ? y.kind : "compound_element",
          element_id: typeof y?.element_id === "string" ? y.element_id : null,
        })).filter((y) => y.element_id) : [];
        return { evidence_id, satisfaction_mode, derivation_steps, satisfied_by };
      }).filter((x) => x.evidence_id);
    } else {
      evidence_satisfied_by = satisfiedEvidenceIds
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .map((id) => ({
          evidence_id: id,
          satisfaction_mode: "direct",
          derivation_steps: [],
          satisfied_by: missingBindingSet.has(id) ? [] : [ { kind: "compound_element", element_id: id } ],
        }));
    }

    evidence_satisfied_by.sort((a,b)=>String(a.evidence_id).localeCompare(String(b.evidence_id)));
    return {
      v: 6,
      profile,
      policy: {
        uri: policyUri,
        digest: policyBinding?.digest?.sha256 ? { sha256: String(policyBinding.digest.sha256) } : null,
        semantics_digest: policyBinding?.semantics_digest?.sha256 ? { sha256: String(policyBinding.semantics_digest.sha256) } : null,
      },
      kind,
      target: { compound_id: compoundId },
      rule_id: ruleId,
      severity: sev,
      fired_because: {
        because,
        atom: cloneValue((e && e.atom) ? e.atom : null),
      },
      requires: cloneValue((e && e.requires) ? e.requires : null),
      obligations: cloneValue((e && e.obligations) ? e.obligations : null),
      evidence: cloneValue((e && e.evidence) ? e.evidence : null),
      evidence_satisfied_by,
      closure: {
        evidence_complete: (missingEvidenceIds.length === 0 && missingEvidenceBindingIds.length === 0),
        missing_evidence_ids: missingEvidenceIds.slice().sort((a, b) => a.localeCompare(b)),
        missing_evidence_binding_ids: missingEvidenceBindingIds.slice().sort((a, b) => a.localeCompare(b)),
      },
      remediation: cloneValue((e && e.remediation) ? e.remediation : null),
      source_pack: (e && typeof e.source_pack === "string" && e.source_pack.trim()) ? e.source_pack : null,
      waived: Boolean(e && e.waived),
      waiver_scars: cloneValue((e && e.waiver_scars) ? e.waiver_scars : null),
      message: (e && typeof e.message === "string" && e.message.trim()) ? e.message : null,
    };
  });

  out.sort((a, b) => {
    const ka = `${a.profile || ""}|${a.severity || ""}|${a.kind || ""}|${a.rule_id || ""}|${a.target?.compound_id || ""}|${a.waived ? "1" : "0"}|${a.source_pack || ""}|${a.policy?.uri || ""}|${stableStringify(a.fired_because || null)}|${stableStringify(a.requires || null)}|${stableStringify(a.obligations || null)}|${stableStringify(a.evidence || null)}|${stableStringify(a.evidence_satisfied_by || null)}|${stableStringify(a.remediation || null)}|${stableStringify(a.waiver_scars || null)}|${a.message || ""}`;
    const kb = `${b.profile || ""}|${b.severity || ""}|${b.kind || ""}|${b.rule_id || ""}|${b.target?.compound_id || ""}|${b.waived ? "1" : "0"}|${b.source_pack || ""}|${b.policy?.uri || ""}|${stableStringify(b.fired_because || null)}|${stableStringify(b.requires || null)}|${stableStringify(b.obligations || null)}|${stableStringify(b.evidence || null)}|${stableStringify(b.evidence_satisfied_by || null)}|${stableStringify(b.remediation || null)}|${stableStringify(b.waiver_scars || null)}|${b.message || ""}`;
    return ka.localeCompare(kb);
  });

  return out;
}

function hashExplainTraceV6(v6) {
  const canon = Buffer.from(stableStringify(v6) + "\n", "utf8");
  return sha256Hex(canon);
}

function computeExplainJustificationHashSha256({ context_id, membrane_edge_id, inference_rule_id, parent_evidence_id }) {
  const payload = {
    context_id: typeof context_id === 'string' ? context_id : null,
    membrane_edge_id: typeof membrane_edge_id === 'string' ? membrane_edge_id : null,
    inference_rule_id: typeof inference_rule_id === 'string' ? inference_rule_id : null,
    parent_evidence_id: typeof parent_evidence_id === 'string' ? parent_evidence_id : null,
  };
  return sha256Hex(Buffer.from(stableStringify(payload) + "\n", 'utf8'));
}

// Explain Trace v6.1: v6 + full contextual trace for each satisfaction mapping.
// Adds: context_id, membrane_edge_id, justification_hash_sha256 at the top level of each evidence mapping.
// Derived/transitive modes MUST include derivation_steps with contextual fields.
function toExplainTraceV61(entries, policyBinding) {
  const v6 = toExplainTraceV6(entries, policyBinding);
  const out = v6.map((e) => {
    const satisfied = Array.isArray(e?.evidence_satisfied_by) ? e.evidence_satisfied_by : [];
    const upgraded = satisfied.map((s) => {
      const evidence_id = typeof s?.evidence_id === 'string' ? s.evidence_id : null;
      const satisfaction_mode = typeof s?.satisfaction_mode === 'string' ? s.satisfaction_mode : 'direct';
      const derivation_steps = Array.isArray(s?.derivation_steps) ? s.derivation_steps : [];

      // Context binding: prefer explicit step context; otherwise use deterministic placeholders.
      const firstStep = derivation_steps.length ? derivation_steps[0] : null;
      const context_id = typeof firstStep?.context_id === 'string' ? firstStep.context_id : null;
      const membrane_edge_id = typeof firstStep?.membrane_edge_id === 'string' ? firstStep.membrane_edge_id : null;
      const inference_rule_id = typeof firstStep?.inference_rule_id === 'string' ? firstStep.inference_rule_id : (e?.rule_id ? String(e.rule_id) : null);
      const parent_evidence_id = typeof firstStep?.parent_evidence_id === 'string' ? firstStep.parent_evidence_id : (evidence_id ? String(evidence_id) : null);

      const computedJust = computeExplainJustificationHashSha256({
        context_id,
        membrane_edge_id,
        inference_rule_id,
        parent_evidence_id,
      });
      const justification_hash_sha256 = computedJust;

      // Normalize derivation steps: ensure each step includes its own justification hash derived from its own fields.
      const normSteps = derivation_steps.map((st) => {
        const c = typeof st?.context_id === 'string' ? st.context_id : null;
        const m = typeof st?.membrane_edge_id === 'string' ? st.membrane_edge_id : null;
        const inf = typeof st?.inference_rule_id === 'string' ? st.inference_rule_id : null;
        const par = typeof st?.parent_evidence_id === 'string' ? st.parent_evidence_id : null;
        return {
          parent_evidence_id: par,
          inference_rule_id: inf,
          context_id: c,
          membrane_edge_id: m,
          justification_hash_sha256: computeExplainJustificationHashSha256({
            context_id: c,
            membrane_edge_id: m,
            inference_rule_id: inf,
            parent_evidence_id: par,
          }),
        };
      }).filter((st) => st.parent_evidence_id || st.inference_rule_id || st.context_id || st.membrane_edge_id);

      return {
        evidence_id,
        satisfaction_mode,
        context_id,
        membrane_edge_id,
        inference_rule_id,
        parent_evidence_id,
        justification_hash_sha256,
        derivation_steps: normSteps,
        satisfied_by: Array.isArray(s?.satisfied_by) ? s.satisfied_by : [],
      };
    }).filter((x) => x.evidence_id);

    upgraded.sort((a,b)=>String(a.evidence_id).localeCompare(String(b.evidence_id)));
    return {
      ...e,
      // IMPORTANT: keep this as a STRING.
      // We forbid non-safe-integer numbers in hashed proof objects.
      // "6.1" is a version label, not arithmetic.
      v: "6.1",
      evidence_satisfied_by: upgraded,
    };
  });

  // deterministic sort already applied by v6; keep stable
  return out;
}



// Explain Trace v6.2: v6.1 + artifact-bound satisfaction provenance.
// Goal: eliminate "evidence exists" ambiguity by binding each satisfaction to a concrete artifact digest.
// This is the bridge between SPEL meaning and in-toto/SLSA-style subject digests.
function toExplainTraceV62(entries, policyBinding, opts) {
  const v61 = toExplainTraceV61(entries, policyBinding);
  const setFrom = (xs) => {
    const s = new Set();
    if (Array.isArray(xs)) { for (const x of xs) s.add(String(x)); }
    return s;
  };
  const target_ref = opts && typeof opts === 'object' ? opts.target_ref : null;
  const target_uri = typeof target_ref?.uri === 'string' ? target_ref.uri : null;
  const target_digest = typeof target_ref?.digest_sha256 === 'string' ? target_ref.digest_sha256 : null;
  const target_kind = typeof target_ref?.kind === 'string' ? target_ref.kind : 'spel_target';

  const out = v61.map((e) => {
    const evidence_ids = Array.isArray(e?.evidence?.evidence_ids) ? e.evidence.evidence_ids.map(String) : [];
    const missing_evidence_ids = Array.isArray(e?.closure?.missing_evidence_ids) ? e.closure.missing_evidence_ids.map(String) : [];
    const missing_binding_ids = Array.isArray(e?.closure?.missing_evidence_binding_ids) ? e.closure.missing_evidence_binding_ids.map(String) : [];
    const missing_set = setFrom(missing_evidence_ids);
    const missing_binding_set = setFrom(missing_binding_ids);

    const requires_evidence = evidence_ids.slice().sort((a,b)=>a.localeCompare(b));
    const satisfied_evidence = evidence_ids.filter((id)=>!missing_set.has(id) && !missing_binding_set.has(id));

    // Normalize satisfaction mappings to ONLY satisfied evidence.
    const satisfied_by_map = new Map();
    const src = Array.isArray(e?.evidence_satisfied_by) ? e.evidence_satisfied_by : [];
    for (const m of src) {
      const id = typeof m?.evidence_id === 'string' ? m.evidence_id : null;
      if (!id) continue;
      if (!satisfied_evidence.includes(id)) continue;
      satisfied_by_map.set(id, m);
    }

    const evidence_satisfied_by = satisfied_evidence
      .slice()
      .sort((a,b)=>a.localeCompare(b))
      .map((id) => {
        const m = satisfied_by_map.get(id);
        const satisfaction_mode = typeof m?.satisfaction_mode === 'string' ? m.satisfaction_mode : 'direct';
        const derivation_steps = Array.isArray(m?.derivation_steps) ? m.derivation_steps : [];
        const satisfied_by = Array.isArray(m?.satisfied_by) ? m.satisfied_by : [ { kind: 'compound_element', element_id: id } ];
        const artifact_refs = [];
        if (target_uri && target_digest) {
          artifact_refs.push({ kind: target_kind, uri: target_uri, digest_sha256: target_digest });
        }
        return {
          evidence_id: id,
          satisfaction_mode,
          derivation_steps,
          satisfied_by,
          // New in v6.2: explicit binding of satisfaction provenance to artifacts.
          artifact_refs,
        };
      });

    return {
      ...e,
      v: 62,
      requires_evidence_ids: requires_evidence.slice(),
      requires_evidence: requires_evidence.slice(),
      evidence_satisfied_by,
    };
  });

  out.sort((a,b)=>stableStringify(a).localeCompare(stableStringify(b)));
  return out;
}

function hashExplainTraceV62(v62) {
  const canon = Buffer.from(stableStringify(v62) + "\n", "utf8");
  return sha256Hex(canon);
}
function hashExplainTraceV61(v61) {
  const canon = Buffer.from(stableStringify(v61) + "\n", "utf8");
  return sha256Hex(canon);
}

// Explain Justifications v1: hash-first, compressible store of justification objects
// referenced by explain_trace_v6.1 entries via justification_hash_sha256.
// This enables "full truth" in receipts/bundles while allowing compact UI surfaces
// to carry only hashes/IDs.
function buildExplainJustificationsV1(explainTraceV61) {
  const trace = Array.isArray(explainTraceV61) ? explainTraceV61 : [];
  const map = new Map();
  for (const entry of trace) {
    const satisfied = Array.isArray(entry?.evidence_satisfied_by) ? entry.evidence_satisfied_by : [];
    for (const m of satisfied) {
      const h = typeof m?.justification_hash_sha256 === 'string' ? m.justification_hash_sha256 : null;
      if (!h) continue;
      const obj = {
        justification_hash_sha256: h,
        context_id: typeof m?.context_id === 'string' ? m.context_id : null,
        membrane_edge_id: typeof m?.membrane_edge_id === 'string' ? m.membrane_edge_id : null,
        inference_rule_id: typeof m?.inference_rule_id === 'string' ? m.inference_rule_id : null,
        parent_evidence_id: typeof m?.parent_evidence_id === 'string' ? m.parent_evidence_id : null,
      };
      if (!map.has(h)) map.set(h, obj);
    }
  }
  const items = Array.from(map.values()).sort((a, b) => String(a.justification_hash_sha256).localeCompare(String(b.justification_hash_sha256)));
  return {
    schema: 'spel.explain_justifications.v1',
    version: 1,
    items,
  };
}

function hashExplainJustificationsV1(justificationsV1) {
  const canon = Buffer.from(stableStringify(justificationsV1) + "\n", 'utf8');
  return sha256Hex(canon);
}

// Proof Graph v1: minimal deterministic DAG derived from explain_trace_v6.
// This is the machine-checkable substrate behind "rule -> obligations/evidence -> satisfied_by".
// It must be hashable and receipt-bound so that an auditor can replay exactly what satisfied what.
function buildProofGraphV1FromExplainTraceV6(explainTraceV6, meta = {}) {
  const trace = Array.isArray(explainTraceV6) ? explainTraceV6 : [];
  const nodes = new Map();
  const edges = [];

  function nodeId(kind, ref) { return `${kind}:${ref}`; }
  function addNode(kind, ref, extra = {}) {
    const id = nodeId(kind, ref);
    if (!nodes.has(id)) nodes.set(id, { id, kind, ref, ...extra });
    return id;
  }
  function addEdge(from, to, rel) { edges.push({ from, to, rel }); }

  for (const e of trace) {
    const ruleId = typeof e?.rule_id === 'string' ? e.rule_id : null;
    if (!ruleId) continue;
    const ruleNode = addNode('rule', ruleId);

    const obligationIds = Array.isArray(e?.obligations?.obligation_ids) ? e.obligations.obligation_ids.map(String) : [];
    for (const obId of obligationIds) {
      const obNode = addNode('obligation', obId);
      addEdge(ruleNode, obNode, 'requires');
    }

    const evidenceIds = Array.isArray(e?.evidence?.evidence_ids) ? e.evidence.evidence_ids.map(String) : [];
    for (const evId of evidenceIds) {
      const evNode = addNode('evidence', evId);
      addEdge(ruleNode, evNode, 'requires_evidence');
    }

    const satisfied = Array.isArray(e?.evidence_satisfied_by) ? e.evidence_satisfied_by : [];
    for (const s of satisfied) {
      const evId = typeof s?.evidence_id === 'string' ? s.evidence_id : null;
      if (!evId) continue;
      const evNode = addNode('evidence', evId);
      const satisfiedBy = Array.isArray(s?.satisfied_by) ? s.satisfied_by : [];
      for (const sb of satisfiedBy) {
        const kind = typeof sb?.kind === 'string' ? sb.kind : 'unknown';
        const elementId = typeof sb?.element_id === 'string' ? sb.element_id : 'unknown';
        const sbRef = `${kind}:${elementId}`;
        const sbNode = addNode('satisfied_by', sbRef, { satisfied_kind: kind, satisfied_element_id: elementId });
        addEdge(evNode, sbNode, 'satisfied_by');
      }
    }
  }

  const nodesArr = Array.from(nodes.values()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const edgesArr = edges
    .map((x) => ({ ...x }))
    .sort((a, b) => {
      if (a.from !== b.from) return String(a.from).localeCompare(String(b.from));
      if (a.rel !== b.rel) return String(a.rel).localeCompare(String(b.rel));
      return String(a.to).localeCompare(String(b.to));
    });

  const graph = {
    schema: 'spel.proof_graph.v1',
    version: 1,
    meta: {
      profile: typeof meta?.profile === 'string' ? meta.profile : null,
      policy_uri: typeof meta?.policy_uri === 'string' ? meta.policy_uri : null,
      explain_trace_v6_hash_sha256: typeof meta?.explain_trace_v6_hash_sha256 === 'string' ? meta.explain_trace_v6_hash_sha256 : null,
    },
    nodes: nodesArr,
    edges: edgesArr,
  };

  const canon = Buffer.from(stableStringify(graph) + "\n", 'utf8');
  const graph_hash_sha256 = sha256Hex(canon);
  return { graph, graph_hash_sha256 };
}

// Proof Graph v1 (v6.1 source): same schema, but meta binds the v6.1 trace hash.
// This commits the proof DAG to full contextual trace, not just the weaker v6 mapping.
function buildProofGraphV1FromExplainTraceV61(explainTraceV61, meta = {}) {
  const trace = Array.isArray(explainTraceV61) ? explainTraceV61 : [];
  // Reuse v6 builder logic by passing through; it only reads rule_id, obligations, evidence, evidence_satisfied_by.
  const { graph, graph_hash_sha256 } = buildProofGraphV1FromExplainTraceV6(trace, {
    profile: typeof meta?.profile === 'string' ? meta.profile : null,
    policy_uri: typeof meta?.policy_uri === 'string' ? meta.policy_uri : null,
    explain_trace_v6_hash_sha256: null,
  });
  // Overwrite meta with v6.1 binding without changing schema id.
  try {
    graph.meta = {
      ...graph.meta,
      explain_trace_v61_hash_sha256: typeof meta?.explain_trace_v61_hash_sha256 === 'string' ? meta.explain_trace_v61_hash_sha256 : null,
    };
  } catch {}
  const canon = Buffer.from(stableStringify(graph) + "\n", 'utf8');
  const graph_hash_sha2562 = sha256Hex(canon);
  return { graph, graph_hash_sha256: graph_hash_sha2562 || graph_hash_sha256 };
}



// Proof Graph v1 (Receipt Composite): build a richer DAG using v6.1 rule/evidence mapping,
// v6.2 artifact refs, and safety-envelope strategy bindings.
//
// Still schema v1, but the node/edge vocabulary is extended in a backwards-compatible way.
// Determinism requirements:
//  - No timestamps in hashed portion
//  - Stable node IDs
//  - Stable sorting
//  - Edge de-duplication
function buildProofGraphV1FromReceipt(receipt, meta = {}) {
  const traceV61 = Array.isArray(receipt?.explain_trace_v61) ? receipt.explain_trace_v61 : [];
  const traceV62 = Array.isArray(receipt?.explain_trace_v62) ? receipt.explain_trace_v62 : [];

  const nodes = new Map();
  const edges = new Map();

  function nodeId(kind, ref) { return `${kind}:${ref}`; }
  function addNode(kind, ref, extra = {}) {
    const id = nodeId(kind, ref);
    if (!nodes.has(id)) nodes.set(id, { id, kind, ref, ...extra });
    return id;
  }
  function addEdge(from, to, rel, metaObj = null) {
    const metaCanon = metaObj ? stableStringify(metaObj) : '';
    const key = `${from}|${rel}|${to}|${metaCanon}`;
    if (!edges.has(key)) {
      const e = { from, to, rel };
      if (metaObj && typeof metaObj === 'object') e.meta = metaObj;
      edges.set(key, e);
    }
  }

  // 1) Rule -> obligations/evidence (v6.1)
  // Minimality rule: do NOT emit isolated rule/context nodes.
  for (const e of traceV61) {
    const ruleId = typeof e?.rule_id === 'string' ? e.rule_id : null;
    if (!ruleId) continue;

    // Lazily allocate the rule node only if it participates in at least one edge.
    let ruleNode = null;
    const ensureRuleNode = () => {
      if (!ruleNode) ruleNode = addNode('rule', ruleId);
      return ruleNode;
    };

    const obligationIdsRaw = Array.isArray(e?.obligations?.obligation_ids) ? e.obligations.obligation_ids.map(String) : [];
    for (const obId of Array.from(new Set(obligationIdsRaw)).filter(Boolean)) {
      const obNode = addNode('obligation', obId);
      addEdge(ensureRuleNode(), obNode, 'requires');
    }

    const evidenceIdsRaw = Array.isArray(e?.evidence?.evidence_ids) ? e.evidence.evidence_ids.map(String) : [];
    for (const evId of Array.from(new Set(evidenceIdsRaw)).filter(Boolean)) {
      const evNode = addNode('evidence', evId);
      addEdge(ensureRuleNode(), evNode, 'requires_evidence');
    }

    // Evidence satisfaction by compound elements (v6.1)
    const satisfied = Array.isArray(e?.evidence_satisfied_by) ? e.evidence_satisfied_by : [];
    for (const s of satisfied) {
      const evId = typeof s?.evidence_id === 'string' ? s.evidence_id : null;
      if (!evId) continue;
      const evNode = addNode('evidence', evId);

      const satisfiedBy = Array.isArray(s?.satisfied_by) ? s.satisfied_by : [];
      for (const sb of satisfiedBy) {
        const kind = typeof sb?.kind === 'string' ? sb.kind : 'unknown';
        const elementId = typeof sb?.element_id === 'string' ? sb.element_id : 'unknown';
        const sbRef = `${kind}:${elementId}`;
        const sbNode = addNode('satisfied_by', sbRef, { satisfied_kind: kind, satisfied_element_id: elementId });
        addEdge(evNode, sbNode, 'satisfied_by');
      }

      // Optional: derivation edges (v6.1)
      const steps = Array.isArray(s?.derivation_steps) ? s.derivation_steps : [];
      if (steps.length) {
        for (const st of steps) {
          const parentEv = typeof st?.parent_evidence_id === 'string' ? st.parent_evidence_id : null;
          if (!parentEv || parentEv === evId) continue;
          const parentNode = addNode('evidence', parentEv);
          addEdge(evNode, parentNode, 'derived_from', {
            inference_rule_id: typeof st?.inference_rule_id === 'string' ? st.inference_rule_id : null,
            context_id: typeof st?.context_id === 'string' ? st.context_id : null,
            membrane_edge_id: typeof st?.membrane_edge_id === 'string' ? st.membrane_edge_id : null,
            justification_hash_sha256: typeof st?.justification_hash_sha256 === 'string' ? st.justification_hash_sha256 : null,
          });
        }
      } else {
        // Back-compat: older receipts may only bind a single parent evidence at the top level.
        const parentEv = typeof s?.parent_evidence_id === 'string' ? s.parent_evidence_id : null;
        if (parentEv && parentEv !== evId) {
          const parentNode = addNode('evidence', parentEv);
          addEdge(evNode, parentNode, 'derived_from', {
            inference_rule_id: typeof s?.inference_rule_id === 'string' ? s.inference_rule_id : null,
            context_id: typeof s?.context_id === 'string' ? s.context_id : null,
            membrane_edge_id: typeof s?.membrane_edge_id === 'string' ? s.membrane_edge_id : null,
            justification_hash_sha256: typeof s?.justification_hash_sha256 === 'string' ? s.justification_hash_sha256 : null,
          });
        }
      }

      // Optional: rule application context (context/membrane edge)
      const ctx = typeof s?.context_id === 'string' ? s.context_id : null;
      const me = typeof s?.membrane_edge_id === 'string' ? s.membrane_edge_id : null;
      if (me) {
        const meNode = addNode('membrane_edge', me);
        if (ctx) {
          const ctxNode = addNode('context', ctx);
          addEdge(meNode, ctxNode, 'has_context');
        }
        addEdge(ensureRuleNode(), meNode, 'applied_at', { context_id: ctx || null, membrane_edge_id: me });
      }
    }

    // If the rule never participated in any edge, it stays un-emitted.
  }


  // 2) Evidence -> artifact satisfaction bindings (v6.2)
  for (const e of traceV62) {
    const satisfied = Array.isArray(e?.evidence_satisfied_by) ? e.evidence_satisfied_by : [];
    for (const m of satisfied) {
      const evId = typeof m?.evidence_id === 'string' ? m.evidence_id : null;
      if (!evId) continue;
      const evNode = addNode('evidence', evId);
      const refs = Array.isArray(m?.artifact_refs) ? m.artifact_refs : [];
      for (const a of refs) {
        const kind = typeof a?.kind === 'string' ? a.kind : 'unknown';
        const uri = typeof a?.uri === 'string' ? a.uri : '';
        const digest = typeof a?.digest_sha256 === 'string' ? a.digest_sha256 : null;
        if (!uri || !digest) continue;
        const artRef = `${kind}:${uri}`;
        const artNode = addNode('artifact', artRef, { artifact_kind: kind, artifact_uri: uri, artifact_digest_sha256: digest });
        addEdge(evNode, artNode, 'satisfied_by_artifact', { digest_sha256: digest, kind, uri });
      }
    }
  }

  // 3) Meaning -> strategy dependencies (safety envelope)
  try {
    const profile = typeof meta?.profile === 'string' ? meta.profile : (typeof receipt?.profile === 'string' ? receipt.profile : null);
    if (profile) {
      const meaningNode = addNode('meaning', `profile:${profile}`);
      const overrides = Array.isArray(receipt?.safety_envelope?.domain_overrides) ? receipt.safety_envelope.domain_overrides : [];
      for (const o of overrides) {
        const domain_id = typeof o?.domain_id === 'string' ? o.domain_id : null;
        const a = typeof o?.compose_tiebreak_strategy === 'string' ? o.compose_tiebreak_strategy : null;
        const b = typeof o?.remediation_any_of_strategy === 'string' ? o.remediation_any_of_strategy : null;
        if (a) {
          const sNode = addNode('strategy', a);
          addEdge(meaningNode, sNode, 'depends_on', { domain_id, strategy_kind: 'compose_tiebreak_strategy' });
        }
        if (b) {
          const sNode = addNode('strategy', b);
          addEdge(meaningNode, sNode, 'depends_on', { domain_id, strategy_kind: 'remediation_any_of_strategy' });
        }
      }
    }
  } catch {}

  const nodesArr = Array.from(nodes.values()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const edgesArr = Array.from(edges.values())
    .map((x) => ({ ...x }))
    .sort((a, b) => {
      if (a.from !== b.from) return String(a.from).localeCompare(String(b.from));
      if (a.rel !== b.rel) return String(a.rel).localeCompare(String(b.rel));
      if (a.to !== b.to) return String(a.to).localeCompare(String(b.to));
      const am = a.meta ? stableStringify(a.meta) : '';
      const bm = b.meta ? stableStringify(b.meta) : '';
      return am.localeCompare(bm);
    });

  const graph = {
    schema: 'spel.proof_graph.v1',
    version: 1,
    meta: {
      profile: typeof meta?.profile === 'string' ? meta.profile : null,
      policy_uri: typeof meta?.policy_uri === 'string' ? meta.policy_uri : null,
      explain_trace_v61_hash_sha256: typeof meta?.explain_trace_v61_hash_sha256 === 'string' ? meta.explain_trace_v61_hash_sha256 : null,
      explain_trace_v62_hash_sha256: typeof meta?.explain_trace_v62_hash_sha256 === 'string' ? meta.explain_trace_v62_hash_sha256 : null,
      safety_envelope_hash_sha256: typeof receipt?.safety_envelope_hash_sha256 === 'string' ? receipt.safety_envelope_hash_sha256 : null,
    },
    nodes: nodesArr,
    edges: edgesArr,
  };

  const canon = Buffer.from(stableStringify(graph) + "\n", 'utf8');
  const graph_hash_sha256 = sha256Hex(canon);
  return { graph, graph_hash_sha256 };
}
// Safety Envelope v1: compact, hashable posture delta for safety/usability tradeoffs.
// This is NOT a replacement for the full receipt; it is a portable summary of "how strict" the run is.
// It is intentionally small and stable so it can be committed into receipts + DSSE/VSA bindings.
function buildSafetyEnvelopeV1(profile, spelSemantics, domainsDoc) {
  const doms = Array.isArray(domainsDoc?.domains) ? domainsDoc.domains : [];
  const domain_overrides = doms
    .filter((d) => d && (d.compose_tiebreak_strategy || d.remediation_any_of_strategy))
    .map((d) => ({
      domain_id: String(d.id || ''),
      compose_tiebreak_strategy: d.compose_tiebreak_strategy || null,
      remediation_any_of_strategy: d.remediation_any_of_strategy || null,
    }))
    .filter((x) => x.domain_id)
    .sort((a, b) => a.domain_id.localeCompare(b.domain_id));

  const semantics = {
    endorsement_semantics: spelSemantics?.endorsement_semantics || null,
    declassification_semantics: spelSemantics?.declassification_semantics || null,
    control_flow_semantics: spelSemantics?.control_flow_semantics || null,
    termination_semantics: spelSemantics?.termination_semantics || null,
    timing_semantics: spelSemantics?.timing_semantics || null,
  };

  const safetyFirstDomains = domain_overrides.filter((d) => d.compose_tiebreak_strategy === 'safety_first_taint').length;
  const remediationSafetyFirst = domain_overrides.filter((d) => d.remediation_any_of_strategy === 'safety_first').length;

  return {
    schema: 'spel.safety_envelope.v1',
    profile: String(profile || ''),
    strict: true,
    semantics,
    domain_overrides,
    summary: {
      safety_first_taint_domains: safetyFirstDomains,
      safety_first_remediation_domains: remediationSafetyFirst,
      identity_bearing_semantics: Object.values(semantics).filter((v) => v === 'identity_bearing').length,
    },
  };
}

function hashSafetyEnvelopeV1(env) {
  const canon = Buffer.from(stableStringify(env) + "\n", "utf8");
  return sha256Hex(canon);
}



function canonicalizeSystemForKappa(sys) {
  if (!isObject(sys)) return sys;
  const out = JSON.parse(JSON.stringify(sys));

  if (Array.isArray(out.compounds)) {
    out.compounds = [...out.compounds].sort((a, b) => {
      const aa = (a && typeof a.as === "string") ? a.as : "";
      const bb = (b && typeof b.as === "string") ? b.as : "";
      return aa.localeCompare(bb);
    });
  }

  if (Array.isArray(out.links)) {
    out.links = [...out.links].sort((a, b) => {
      const af = (a && typeof a.from === "string") ? a.from : "";
      const at = (a && typeof a.to === "string") ? a.to : "";
      const ac = (a && a.via && typeof a.via.cap === "string") ? a.via.cap : "";
      const ae = (a && a.via && typeof a.via.endorsement_id === "string") ? a.via.endorsement_id : "";

      const bf = (b && typeof b.from === "string") ? b.from : "";
      const bt = (b && typeof b.to === "string") ? b.to : "";
      const bc = (b && b.via && typeof b.via.cap === "string") ? b.via.cap : "";
      const be = (b && b.via && typeof b.via.endorsement_id === "string") ? b.via.endorsement_id : "";

      const kA = af + "::" + at + "::" + ac + "::" + ae;
      const kB = bf + "::" + bt + "::" + bc + "::" + be;
      return kA.localeCompare(kB);
    });
  }

  if (Array.isArray(out.waivers)) {
    out.waivers = out.waivers
      .map((w) => {
        if (!isObject(w)) return w;
        const ww = JSON.parse(JSON.stringify(w));
        if (Array.isArray(ww.mitigations)) {
          ww.mitigations = [...ww.mitigations].map(String).sort((a, b) => a.localeCompare(b));
        }
        return ww;
      })
      .sort((a, b) => {
        const ar = (a && typeof a.rule_id === "string") ? a.rule_id : "";
        const at = (a && typeof a.target === "string") ? a.target : "";
        const br = (b && typeof b.rule_id === "string") ? b.rule_id : "";
        const bt = (b && typeof b.target === "string") ? b.target : "";
        const kA = ar + "::" + at;
        const kB = br + "::" + bt;
        return kA.localeCompare(kB);
      });
  }

  return out;
}

function ensureUniqueIds(list, context, errors) {
  const seen = new Set();
  for (const it of list) {
    const id = it?.id;
    if (typeof id !== "string") continue;
    if (seen.has(id)) errors.push(`${context}: duplicate id '${id}'`);
    seen.add(id);
  }
}

function checkSortedById(list, context, warnings) {
  const ids = list.map((x) => x?.id).filter((x) => typeof x === "string");
  if (ids.length <= 1) return;
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== sorted[i]) {
      warnings.push(`${context}: items are not sorted by id (determinism risk)`);
      return;
    }
  }
}


function waiverSetFor(doc, asOf, errors, context) {
  const set = new Set();
  if (!doc || !Array.isArray(doc.waivers)) return set;
  const asOfDate = (typeof asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) ? asOf : null;
  for (const w of doc.waivers) {
    if (!w || typeof w.rule_id !== "string" || !w.rule_id.trim()) continue;
    const exp = (typeof w.expires_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(w.expires_on)) ? w.expires_on : null;
    // Enforce expiry: expired waivers do not suppress and are an error.
    if (asOfDate && exp && exp < asOfDate) {
      if (errors) errors.push(`waiver.expired: ${context || "doc"} rule '${w.rule_id}' expired_on ${exp} (as_of ${asOfDate})`);
      continue;
    }
    set.add(w.rule_id);
  }
  return set;
}

function waiverMapFor(doc, asOf, errors, context) {
  const map = new Map();
  if (!doc || !Array.isArray(doc.waivers)) return map;
  const asOfDate = (typeof asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) ? asOf : null;
  for (const w of doc.waivers) {
    if (!w || typeof w.rule_id !== "string" || !w.rule_id.trim()) continue;
    const exp = (typeof w.expires_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(w.expires_on)) ? w.expires_on : null;
    if (asOfDate && exp && exp < asOfDate) {
      if (errors) errors.push(`waiver.expired: ${context || "doc"} rule '${w.rule_id}' expired_on ${exp} (as_of ${asOfDate})`);
      continue;
    }
    map.set(w.rule_id, w);
  }
  return map;
}


function validateWaiversArray(waivers, context, errors) {
  if (waivers === undefined) return;
  if (!Array.isArray(waivers)) { errors.push(`${context}.waivers: expected array`); return; }
  const seen = new Set();
  for (const w of waivers) {
    if (!isObject(w)) { errors.push(`${context}.waivers: entries must be objects`); continue; }
    keysAreClosed(w, new Set(["rule_id","target","rationale","mitigations","expires_on","notes"]), errors, `${context}.waivers.entry`);
    if (typeof w.rule_id !== "string" || !w.rule_id.trim()) { errors.push(`${context}.waivers.rule_id: required`); continue; }
    if (seen.has(w.rule_id)) errors.push(`${context}.waivers: duplicate rule_id '${w.rule_id}'`);
    seen.add(w.rule_id);
    if (typeof w.target !== "string" || !w.target.trim()) errors.push(`${context}.waivers.${w.rule_id}.target: required`);
    if (typeof w.rationale !== "string" || !w.rationale.trim()) errors.push(`${context}.waivers.${w.rule_id}.rationale: required`);
    if (!Array.isArray(w.mitigations) || w.mitigations.length === 0) errors.push(`${context}.waivers.${w.rule_id}.mitigations: required`);
    if (typeof w.expires_on !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(w.expires_on)) errors.push(`${context}.waivers.${w.rule_id}.expires_on: expected YYYY-MM-DD`);
  }
}

function pushViolation({ kind, compoundId, ruleId, severity, message, because, atom, requires, remediation, source_pack, waivers, waiver_map, errors, warnings, waived, obligations, evidence, evidence_satisfied_by }) {
  const prefix = kind === "system" ? "rule" : `compound.${compoundId}`;
  const base = kind === "system"
    ? `rule '${ruleId}' :: ${message}`
    : `${prefix}: rule '${ruleId}' ${message}`;

  const src = (typeof source_pack === "string" && source_pack.trim()) ? ` [pack=${source_pack.trim()}]` : "";
  const bc = (typeof because === "string" && because.trim()) ? (" because " + because.trim()) : "";
  const fullMsg = base + src + bc;

  // Profile-level severity overrides (shipping knobs).
  const ov = PROFILE_OVERRIDES && Object.prototype.hasOwnProperty.call(PROFILE_OVERRIDES, ruleId) ? PROFILE_OVERRIDES[ruleId] : null;
  const sev = (ov === "error" || ov === "warn" || ov === "ignore") ? ov : severity;
  if (sev === "ignore") return;

  if (TRACE_ENABLED) {
    // Waiver SCARS (rule_id + rationale + mitigation evidence IDs + expiry/review date)
    // If this violation is waived, and the doc provided a SCARS-complete waiver entry,
    // attach it to the trace so hostile readers can see the exception mechanics.
    let waiver_scars = null;
    try {
      if (waivers && waivers.has(ruleId) && waiver_map && waiver_map.get(ruleId)) {
        const w = waiver_map.get(ruleId);
        waiver_scars = {
          target: typeof w.target === "string" ? w.target : null,
          rationale: typeof w.rationale === "string" ? w.rationale : null,
          mitigations: Array.isArray(w.mitigations) ? w.mitigations.slice() : [],
          expires_on: typeof w.expires_on === "string" ? w.expires_on : null,
        };
      }
    } catch {
      waiver_scars = null;
    }

    TRACE.push({
      profile: ACTIVE_PROFILE,
      policy_uri: `spel://policy/profile/${ACTIVE_PROFILE}`,
      kind: kind || "compound",
      compound_id: compoundId || null,
      rule_id: ruleId,
      severity: sev,
      message: String(message),
      because: (typeof because === "string" && because.trim()) ? because.trim() : null,
      atom: atom || null,
      requires: requires || null,
      remediation: remediation || null,
      obligations: obligations || null,
      evidence: evidence || null,
      evidence_satisfied_by: evidence_satisfied_by || null,
      source_pack: (typeof source_pack === "string" && source_pack.trim()) ? source_pack.trim() : null,
      waived: Boolean(waivers && waivers.has(ruleId)),
      waiver_scars,
    });
  }

  // Waivers are explicit exceptions: they suppress the violation but are still reported.
  if (waivers && waivers.has(ruleId)) {
    waived.push(`${fullMsg} (WAIVED)`);
    return;
  }

  if (sev === "error") errors.push(fullMsg);
  else warnings.push(fullMsg);
}

function loadIndex(indexPath) {
  const idxAbs = path.resolve(process.cwd(), indexPath);
  if (!fs.existsSync(idxAbs)) fail(`Index not found: ${indexPath}`);
  const idx = readJson(idxAbs);

  const errors = [];
  const warnings = [];

  assert(isObject(idx), "index: expected object", errors);
  if (!isObject(idx)) return { ok: false, errors, warnings };

  keysAreClosed(idx, new Set(["schema", "version", "tables", "bond_rules", "bond_packs", "atomic_properties", "tags", "profiles", "examples", "pairing", "negative_examples", "golden_corpus", "domains", "spel_semantics", "systems", "system_negative_examples"]), errors, "index");
  assert(idx.schema === "periodic.index.v1", "index.schema: expected 'periodic.index.v1'", errors);
  assert(typeof idx.version === "string" && idx.version.trim(), "index.version: required", errors);

  assert(isObject(idx.tables), "index.tables: expected object", errors);
  if (isObject(idx.tables)) {
    for (const [k, v] of Object.entries(idx.tables)) {
      assert(TABLES.has(k), `index.tables: unknown table '${k}'`, errors);
      assert(isObject(v), `index.tables.${k}: expected object`, errors);
      if (isObject(v)) {
        keysAreClosed(v, new Set(["path"]), errors, `index.tables.${k}`);
        assert(typeof v.path === "string" && v.path.length > 0, `index.tables.${k}.path: required`, errors);
      }
    }
  }

  assert(isObject(idx.bond_rules), "index.bond_rules: expected object", errors);
  if (isObject(idx.bond_rules)) {
    keysAreClosed(idx.bond_rules, new Set(["path"]), errors, "index.bond_rules");
    assert(typeof idx.bond_rules.path === "string" && idx.bond_rules.path.length > 0, "index.bond_rules.path: required", errors);
  }

  assert(isObject(idx.bond_packs), "index.bond_packs: expected object", errors);
  if (isObject(idx.bond_packs)) {
    keysAreClosed(idx.bond_packs, new Set(["path"]), errors, "index.bond_packs");
    assert(typeof idx.bond_packs.path === "string" && idx.bond_packs.path.length > 0, "index.bond_packs.path: required", errors);
  }

  // Atomic properties are optional in non-strict, required in strict. They enable periodic-table-like predictability.
  if (idx.atomic_properties !== undefined) {
    assert(isObject(idx.atomic_properties), "index.atomic_properties: expected object", errors);
    if (isObject(idx.atomic_properties)) {
      keysAreClosed(idx.atomic_properties, new Set(["path"]), errors, "index.atomic_properties");
      assert(typeof idx.atomic_properties.path === "string" && idx.atomic_properties.path.length > 0, "index.atomic_properties.path: required", errors);
    }
  }


  assert(isObject(idx.domains), "index.domains: expected object", errors);
  if (isObject(idx.domains)) {
    keysAreClosed(idx.domains, new Set(["path"]), errors, "index.domains");
    if (idx.spel_semantics) keysAreClosed(idx.spel_semantics, new Set(["path"]), errors, "index.spel_semantics");
    assert(typeof idx.domains.path === "string" && idx.domains.path.length > 0, "index.domains.path: required", errors);
  }

  if (idx.golden_corpus !== undefined) {
    assert(isObject(idx.golden_corpus), "index.golden_corpus: expected object", errors);
    if (isObject(idx.golden_corpus)) {
      keysAreClosed(idx.golden_corpus, new Set(["path"]), errors, "index.golden_corpus");
      assert(typeof idx.golden_corpus.path === "string" && idx.golden_corpus.path.length > 0, "index.golden_corpus.path: required", errors);
    }
  }


  // Systems (system-of-compounds) are an explicit composition layer. Optional in non-strict, required in strict.
  assert(isObject(idx.systems), "index.systems: expected object", errors);
  if (isObject(idx.systems)) {
    keysAreClosed(idx.systems, new Set(["path","schema_path"]), errors, "index.systems");
    assert(typeof idx.systems.path === "string" && idx.systems.path.length > 0, "index.systems.path: required", errors);
    assert(typeof idx.systems.schema_path === "string" && idx.systems.schema_path.length > 0, "index.systems.schema_path: required", errors);
  }

  assert(isObject(idx.system_negative_examples), "index.system_negative_examples: expected object", errors);
  if (isObject(idx.system_negative_examples)) {
    keysAreClosed(idx.system_negative_examples, new Set(["path"]), errors, "index.system_negative_examples");
    assert(typeof idx.system_negative_examples.path === "string" && idx.system_negative_examples.path.length > 0, "index.system_negative_examples.path: required", errors);
  }

  assert(Array.isArray(idx.examples), "index.examples: expected array", errors);

  // Pairing indices are part of the deterministic spine.
  assert(isObject(idx.pairing), "index.pairing: expected object", errors);
  if (isObject(idx.pairing)) {
    keysAreClosed(idx.pairing, new Set(["flow_workshop"]), errors, "index.pairing");
    assert(isObject(idx.pairing.flow_workshop), "index.pairing.flow_workshop: expected object", errors);
    if (isObject(idx.pairing.flow_workshop)) {
      keysAreClosed(idx.pairing.flow_workshop, new Set(["path"]), errors, "index.pairing.flow_workshop");
      assert(typeof idx.pairing.flow_workshop.path === "string" && idx.pairing.flow_workshop.path.length > 0, "index.pairing.flow_workshop.path: required", errors);
    }
  }

  if (idx.negative_examples !== undefined) {
    assert(isObject(idx.negative_examples), "index.negative_examples: expected object", errors);
    if (isObject(idx.negative_examples)) {
      keysAreClosed(idx.negative_examples, new Set(["path"]), errors, "index.negative_examples");
      assert(typeof idx.negative_examples.path === "string" && idx.negative_examples.path.length > 0, "index.negative_examples.path: required", errors);
    }
  }

  // Golden corpus: a small, commercially-anchored regression spine.
  if (idx.golden_corpus !== undefined) {
    assert(isObject(idx.golden_corpus), "index.golden_corpus: expected object", errors);
    if (isObject(idx.golden_corpus)) {
      keysAreClosed(idx.golden_corpus, new Set(["path"]), errors, "index.golden_corpus");
      assert(typeof idx.golden_corpus.path === "string" && idx.golden_corpus.path.length > 0, "index.golden_corpus.path: required", errors);
    }
  }

  return { ok: errors.length === 0, errors, warnings, index: idx };
}

function validateElement(el, context, errors) {
  assert(isObject(el), `${context}: expected object`, errors);
  if (!isObject(el)) return;

  keysAreClosed(el, new Set(["schema","id","table","group","name","summary","domain","tags","required_states","implies","requires","invariants","notes"]), errors, context);

  assert(el.schema === "periodic.element.v1", `${context}.schema: expected 'periodic.element.v1'`, errors);
  assert(typeof el.id === "string" && ID_RE.test(el.id), `${context}.id: invalid '${el.id}'`, errors);
  assert(TABLES.has(el.table), `${context}.table: invalid '${el.table}'`, errors);
  assert(typeof el.group === "string" && el.group.trim().length > 0, `${context}.group: required`, errors);
  assert(typeof el.name === "string" && el.name.trim().length > 0, `${context}.name: required`, errors);
  assert(typeof el.summary === "string" && el.summary.trim().length > 0, `${context}.summary: required`, errors);

  if (el.domain !== undefined) {
    assert(typeof el.domain === "string" && el.domain.trim().length > 0, `${context}.domain: expected non-empty string`, errors);
  }

  if (el.tags !== undefined) assert(Array.isArray(el.tags), `${context}.tags: expected array`, errors);
  if (Array.isArray(el.tags)) {
    // Tag hygiene: stable core tag set + explicit extension namespace.
    const seen = new Set();
    for (const t of el.tags) {
      assert(typeof t === "string" && t.trim().length > 0, `${context}.tags: tags must be non-empty strings`, errors);
      if (typeof t !== "string") continue;
      if (seen.has(t)) errors.push(`${context}.tags: duplicate tag '${t}'`);
      seen.add(t);
      if (CORE_TAGS && !CORE_TAGS.has(t) && !(t.startsWith("x.") || t.startsWith("x_"))) {
        errors.push(`${context}.tags: non-core tag '${t}' must be in ${CORE_TAGS_PATH} or use extension namespace 'x.'`);
      }
    }
  }
  // Irreversibility tags are mutually exclusive per element (avoid overload drift).
  if (Array.isArray(el.tags)) {
    let irrCount = 0;
    for (const t of el.tags) {
      if (typeof t === "string" && t.startsWith("irreversible.")) irrCount++;
    }
    if (irrCount > 1) errors.push(`${context}.tags: multiple irreversible.* tags are not allowed (found ${irrCount})`);
  }
  if (el.required_states !== undefined) assert(Array.isArray(el.required_states), `${context}.required_states: expected array`, errors);
  if (el.implies !== undefined) assert(Array.isArray(el.implies), `${context}.implies: expected array`, errors);
  if (el.requires !== undefined) assert(Array.isArray(el.requires), `${context}.requires: expected array`, errors);
  if (el.invariants !== undefined) assert(Array.isArray(el.invariants), `${context}.invariants: expected array`, errors);
}

function loadCoreTags(errors, warnings) {
  const abs = path.resolve(process.cwd(), CORE_TAGS_PATH);
  if (!fs.existsSync(abs)) {
    warnings.push(`core_tags: not found (${CORE_TAGS_PATH}); tag namespace checks disabled`);
    return null;
  }
  const doc = readJson(abs);
  if (!isObject(doc)) {
    errors.push(`core_tags: expected object in ${CORE_TAGS_PATH}`);
    return null;
  }
  keysAreClosed(doc, new Set(["schema","version","tags"]), errors, "core_tags");
  if (doc.schema !== "periodic.core_tags.v1") errors.push(`core_tags.schema: expected 'periodic.core_tags.v1'`);
  if (typeof doc.version !== "string" || !doc.version.trim()) errors.push(`core_tags.version: required`);
  if (!Array.isArray(doc.tags)) {
    errors.push(`core_tags.tags: expected array`);
    return null;
  }
  const set = new Set();
  for (const t of doc.tags) {
    if (typeof t !== "string" || !t.trim()) {
      errors.push(`core_tags.tags: entries must be non-empty strings`);
      continue;
    }
    if (set.has(t)) errors.push(`core_tags.tags: duplicate '${t}'`);
    set.add(t);
  }
  return set;
}

function loadDomains(domainsPath, strict, errors, warnings) {
  if (!domainsPath) {
    if (strict) errors.push("index.domains.path: required (missing domains pack)");
    return null;
  }
  const abs = path.resolve(process.cwd(), domainsPath);
  if (!fs.existsSync(abs)) {
    errors.push(`missing_domains_file: ${domainsPath}`);
    return null;
  }
  const d = readJson(abs);

  if (!isObject(d)) {
    errors.push(`domains: expected object in ${domainsPath}`);
    return null;
  }
  if (d.schema !== "periodic.domains.v1") {
    errors.push(`domains.schema: expected 'periodic.domains.v1' in ${domainsPath}`);
  }
  const neutral = typeof d.neutral_domain === "string" && d.neutral_domain.trim() ? d.neutral_domain : "membrane";

  const ids = new Set();
  const metaById = new Map();
  if (!Array.isArray(d.domains) || d.domains.length === 0) {
    errors.push(`domains.domains: required non-empty array in ${domainsPath}`);
  } else {
    for (const dom of d.domains) {
      if (!isObject(dom)) { errors.push(`domains.domains: each entry must be object`); continue; }
      if (typeof dom.id !== "string" || !dom.id.trim()) { errors.push(`domains.domains: domain id required`); continue; }
      if (ids.has(dom.id)) errors.push(`domains.domains: duplicate domain id '${dom.id}'`);
      ids.add(dom.id);

      // Optional domain-scoped remediation strategy.
      // Purpose: deterministically resolve require.any_of remediation without relying on LLM guesswork.
      // Default remains lexicographic for backward compatibility.
      const strat = typeof dom.remediation_any_of_strategy === "string" ? dom.remediation_any_of_strategy.trim() : "";
      const allowed = new Set(["lexicographic_smallest", "safety_first"]);
      if (strat && !allowed.has(strat)) {
        const msg = `domains.domains.${dom.id}.remediation_any_of_strategy: invalid value '${strat}' (allowed: lexicographic_smallest|safety_first)`;
        if (strict) errors.push(msg);
        else warnings.push(msg);
      }
      metaById.set(dom.id, {
        remediation_any_of_strategy: strat && allowed.has(strat) ? strat : "lexicographic_smallest",
        compose_tiebreak_strategy: (() => {
          const t = typeof dom.compose_tiebreak_strategy === "string" ? dom.compose_tiebreak_strategy.trim() : "";
          const allowedT = new Set(["lexicographic_smallest", "safety_first_taint"]);
          if (t && !allowedT.has(t)) {
            const msg = `domains.domains.${dom.id}.compose_tiebreak_strategy: invalid value '${t}' (allowed: lexicographic_smallest|safety_first_taint)`;
            if (strict) errors.push(msg); else warnings.push(msg);
          }
          return t && allowedT.has(t) ? t : "lexicographic_smallest";
        })(),
      });

      // Domain entries are *not* mere topics. They are immiscible constraint regimes.
      // To keep the federation non-arbitrary (and prevent knowledge from living only in human heads),
      // require each domain to carry its own rationale + invariants in strict mode.
      // This also reduces waiver-farm drift: if a domain cannot explain itself, it will eventually be bypassed.
      const miss = [];
      if (typeof dom.name !== "string" || !dom.name.trim()) miss.push("name");
      if (typeof dom.summary !== "string" || !dom.summary.trim()) miss.push("summary");
      if (typeof dom.reason_for_existence !== "string" || !dom.reason_for_existence.trim()) miss.push("reason_for_existence");
      if (!Array.isArray(dom.unique_invariants) || dom.unique_invariants.length === 0 || !dom.unique_invariants.every((x) => typeof x === "string" && x.trim())) miss.push("unique_invariants");
      if (typeof dom.collapse_risk !== "string" || !dom.collapse_risk.trim()) miss.push("collapse_risk");
      if (miss.length > 0) {
        const msg = `domains.domains.${dom.id}: missing required metadata [${miss.join(", ")}]`;
        if (strict) errors.push(msg);
        else warnings.push(msg);
      }
    }
  }
  if (!ids.has(neutral)) {
    errors.push(`domains.neutral_domain: '${neutral}' is not listed in domains.domains`);
  }

  // Optional: allow multiple neutral domains (e.g., membrane + proof_lane). Backward compatible.
  const neutralSet = new Set([neutral]);
  if (Array.isArray(d.neutral_domains)) {
    for (const nd of d.neutral_domains) {
      if (typeof nd !== "string" || !nd.trim()) {
        errors.push(`domains.neutral_domains: entries must be non-empty strings`);
        continue;
      }
      if (!ids.has(nd)) {
        errors.push(`domains.neutral_domains: '${nd}' is not listed in domains.domains`);
        continue;
      }
      neutralSet.add(nd);
    }
    if (!neutralSet.has(neutral)) {
      errors.push(`domains.neutral_domains: must include neutral_domain '${neutral}'`);
    }
  }

  // If a domain entry declares neutral: true, ensure it's in the neutral set.
  if (Array.isArray(d.domains)) {
    for (const dom of d.domains) {
      if (!isObject(dom) || typeof dom.id !== "string") continue;
      if (dom.neutral === true && !neutralSet.has(dom.id)) {
        errors.push(`domains.domains: domain '${dom.id}' declares neutral:true but is not listed in neutral_domain/neutral_domains`);
      }
    }
  }

  const immiscible = new Set();
  const immiscibleSeen = new Set();
  if (Array.isArray(d.immiscible)) {
    for (const pair of d.immiscible) {
      if (!Array.isArray(pair) || pair.length !== 2) { errors.push(`domains.immiscible: each entry must be [a,b]`); continue; }
      const a = pair[0], b = pair[1];
      if (typeof a !== "string" || typeof b !== "string") { errors.push(`domains.immiscible: ids must be strings`); continue; }
      if (!ids.has(a) || !ids.has(b)) { errors.push(`domains.immiscible: unknown domain id(s) '${a}', '${b}'`); continue; }
      if (neutralSet.has(a) || neutralSet.has(b)) {
        const hit = neutralSet.has(a) ? a : b;
        errors.push(`domains.immiscible: must not include neutral domain '${hit}' (neutral domains are membrane-compatible by definition)`);
        continue;
      }
      const key = [a,b].sort().join("|");
      if (immiscibleSeen.has(key)) {
        errors.push(`domains.immiscible: duplicate pair '${key}'`);
        continue;
      }
      immiscibleSeen.add(key);
      immiscible.add(key);
    }
  }

  return { ids, neutral, neutralSet, immiscible, metaById, doc: d };
}

function loadTableMetadata(strict, errors, warnings) {
  const abs = path.resolve(process.cwd(), TABLE_METADATA_PATH);
  if (!fs.existsSync(abs)) {
    const msg = `table_metadata: missing file (${TABLE_METADATA_PATH})`;
    if (strict) errors.push(msg);
    else warnings.push(msg);
    return null;
  }

  const doc = readJson(abs);
  if (!isObject(doc)) {
    errors.push(`table_metadata: expected object in ${TABLE_METADATA_PATH}`);
    return null;
  }

  keysAreClosed(doc, new Set(["schema","version","tables"]), errors, "table_metadata");
  if (doc.schema !== "periodic.table_metadata.v1") errors.push("table_metadata.schema: expected 'periodic.table_metadata.v1'");
  if (typeof doc.version !== "string" || !doc.version.trim()) errors.push("table_metadata.version: required");
  if (!Array.isArray(doc.tables) || doc.tables.length === 0) {
    errors.push("table_metadata.tables: required non-empty array");
    return null;
  }

  const byId = new Map();
  const ids = [];
  for (const t of doc.tables) {
    if (!isObject(t)) { errors.push("table_metadata.tables[]: expected object"); continue; }
    keysAreClosed(t, new Set(["id","name","summary","why_separate","collapse_risk"]), errors, "table_metadata.table");
    if (typeof t.id !== "string" || !t.id.trim()) { errors.push("table_metadata.table.id: required"); continue; }
    const id = t.id;
    if (!TABLES.has(id)) errors.push(`table_metadata.tables.${id}: unknown table id`);
    if (byId.has(id)) errors.push(`table_metadata.tables: duplicate id '${id}'`);
    byId.set(id, t);
    ids.push(id);

    const miss = [];
    if (typeof t.name !== "string" || !t.name.trim()) miss.push("name");
    if (typeof t.summary !== "string" || !t.summary.trim()) miss.push("summary");
    if (typeof t.why_separate !== "string" || !t.why_separate.trim()) miss.push("why_separate");
    if (typeof t.collapse_risk !== "string" || !t.collapse_risk.trim()) miss.push("collapse_risk");
    if (miss.length) {
      const msg = `table_metadata.tables.${id}: missing required fields [${miss.join(", ")} ]`;
      if (strict) errors.push(msg);
      else warnings.push(msg);
    }
  }

  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== sorted[i]) {
      warnings.push("table_metadata.tables: entries not sorted by id (determinism risk)");
      break;
    }
  }

  for (const tid of TABLES) {
    if (!byId.has(tid)) {
      const msg = `table_metadata: missing entry for table '${tid}'`;
      if (strict) errors.push(msg);
      else warnings.push(msg);
    }
  }

  return { byId };
}

function loadAtomicProperties(propsPath, strict, errors, warnings, elementIndex) {
  if (!propsPath) {
    if (strict) errors.push("index.atomic_properties.path: required in strict mode");
    else warnings.push("index.atomic_properties: not provided (periodic predictability disabled)");
    return null;
  }
  const abs = path.resolve(process.cwd(), propsPath);
  if (!fs.existsSync(abs)) {
    errors.push(`missing_atomic_properties_file: ${propsPath}`);
    return null;
  }
  const doc = readJson(abs);
  if (!isObject(doc)) {
    errors.push(`atomic_properties: expected object in ${propsPath}`);
    return null;
  }
  keysAreClosed(doc, new Set(["schema","version","enums","properties"]), errors, "atomic_properties");
  if (doc.schema !== "periodic.atomic_properties.v1") errors.push(`atomic_properties.schema: expected 'periodic.atomic_properties.v1' in ${propsPath}`);
  if (typeof doc.version !== "string" || !doc.version.trim()) errors.push("atomic_properties.version: required");

  const allowed = {
    scope: new Set(["local","boundary","system","federation"]),
    bond_pressure: new Set(["low","medium","high"]),
    evidence_burden: new Set(["low","medium","high"]),
    blast_radius: new Set(["contained","cross-boundary","systemic"]),
    time_sensitivity: new Set(["low","medium","high"]),
  };

  if (!Array.isArray(doc.properties)) {
    errors.push("atomic_properties.properties: expected array");
    return null;
  }

  const byId = new Map();
  for (const p of doc.properties) {
    if (!isObject(p)) { errors.push("atomic_properties.properties[]: expected object"); continue; }
    keysAreClosed(p, new Set(["element_id","domain","table","scope","bond_pressure","evidence_burden","blast_radius","time_sensitivity"]), errors, "atomic_properties.property");
    if (typeof p.element_id !== "string" || !ID_RE.test(p.element_id)) {
      errors.push("atomic_properties.property.element_id: invalid");
      continue;
    }
    if (byId.has(p.element_id)) errors.push(`atomic_properties.properties: duplicate '${p.element_id}'`);
    byId.set(p.element_id, p);

    for (const k of ["scope","bond_pressure","evidence_burden","blast_radius","time_sensitivity"]) {
      if (typeof p[k] !== "string" || !allowed[k].has(p[k])) {
        errors.push(`atomic_properties.${p.element_id}.${k}: must be one of ${Array.from(allowed[k]).join("|")}`);
      }
    }
  }

  // Unknown ids are always errors.
  for (const id of byId.keys()) {
    if (!elementIndex.has(id)) errors.push(`atomic_properties: unknown element_id '${id}'`);
  }

  // Completeness: every element must have explicit properties (no silent defaults).
  for (const el of elementIndex.values()) {
    if (!byId.has(el.id)) {
      const msg = `atomic_properties: missing properties for '${el.id}'`;
      if (strict) errors.push(msg);
      else warnings.push(msg);
    }
  }

  return byId;
}

function loadFlowWorkshopPairs(pairsPath, strict, errors, warnings) {
  const abs = path.resolve(process.cwd(), pairsPath);
  if (!fs.existsSync(abs)) {
    if (strict) errors.push(`flow_workshop_pairs: missing file (${pairsPath})`);
    return [];
  }
  const doc = readJson(abs);
  if (!isObject(doc)) {
    errors.push("flow_workshop_pairs: expected object in " + pairsPath);
    return [];
  }
  keysAreClosed(doc, new Set(["schema","version","pairs"]), errors, "flow_workshop_pairs");
  if (doc.schema !== "periodic.flow_workshop_pairs.v1") errors.push("flow_workshop_pairs.schema: expected 'periodic.flow_workshop_pairs.v1'");
  if (typeof doc.version !== "string" || !doc.version.trim()) errors.push("flow_workshop_pairs.version: required");
  if (!Array.isArray(doc.pairs)) {
    errors.push("flow_workshop_pairs.pairs: expected array");
    return [];
  }
  const out = [];
  for (const pair of doc.pairs) {
    if (!isObject(pair)) {
      errors.push("flow_workshop_pairs.pairs[]: expected object");
      continue;
    }
    keysAreClosed(pair, new Set(["flow","workshop","severity","message"]), errors, "flow_workshop_pairs.pair");
    if (typeof pair.flow !== "string" || !ID_RE.test(pair.flow)) errors.push("flow_workshop_pairs.pair.flow: invalid '" + pair.flow + "'");
    if (typeof pair.workshop !== "string" || !ID_RE.test(pair.workshop)) errors.push("flow_workshop_pairs.pair.workshop: invalid '" + pair.workshop + "'");
    if (pair.severity !== "warn" && pair.severity !== "error") errors.push("flow_workshop_pairs.pair.severity: must be warn|error");
    if (typeof pair.message !== "string" || !pair.message.trim()) errors.push("flow_workshop_pairs.pair.message: required");
    out.push(pair);
  }
  return out;
}

function loadNegativeExamples(negPath, strict, errors, warnings) {
  if (!negPath) return [];
  const abs = path.resolve(process.cwd(), negPath);
  if (!fs.existsSync(abs)) {
    if (strict) errors.push(`negative_examples: missing file (${negPath})`);
    return [];
  }
  const doc = readJson(abs);
  if (!isObject(doc)) {
    errors.push(`negative_examples: expected object in ${negPath}`);
    return [];
  }
  keysAreClosed(doc, new Set(["schema","version","cases"]), errors, "negative_examples");
  if (doc.schema !== "periodic.negative_examples.v1") errors.push("negative_examples.schema: expected 'periodic.negative_examples.v1'");
  if (typeof doc.version !== "string" || !doc.version.trim()) errors.push("negative_examples.version: required");
  if (!Array.isArray(doc.cases)) {
    errors.push("negative_examples.cases: expected array");
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const c of doc.cases) {
    if (!isObject(c)) {
      errors.push("negative_examples.cases[]: expected object");
      continue;
    }
    keysAreClosed(c, new Set(["id","path","expect_errors","expect_warnings","note"]), errors, "negative_examples.case");
    if (typeof c.id !== "string" || !ID_RE.test(c.id)) errors.push(`negative_examples.case.id: invalid '${c.id}'`);
    if (seen.has(c.id)) errors.push(`negative_examples.case: duplicate id '${c.id}'`);
    seen.add(c.id);
    if (typeof c.path !== "string" || !c.path.trim()) errors.push(`negative_examples.case.${c.id}: path required`);
    if (c.expect_errors !== undefined && !Array.isArray(c.expect_errors)) errors.push(`negative_examples.case.${c.id}.expect_errors: expected array`);
    if (c.expect_warnings !== undefined && !Array.isArray(c.expect_warnings)) errors.push(`negative_examples.case.${c.id}.expect_warnings: expected array`);
    out.push(c);
  }
  const ids = out.map((x) => x.id);
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== sorted[i]) {
      warnings.push(`negative_examples: cases are not sorted by id (determinism risk)`);
      break;
    }
  }
  return out;
}

function loadGoldenCorpus(corpusPath, strict, errors, warnings) {
  if (!corpusPath) return null;
  const abs = path.resolve(process.cwd(), corpusPath);
  if (!fs.existsSync(abs)) {
    if (strict) errors.push(`golden_corpus: missing file (${corpusPath})`);
    return null;
  }
  const doc = readJson(abs);
  if (!isObject(doc)) {
    errors.push(`golden_corpus: expected object in ${corpusPath}`);
    return null;
  }
  keysAreClosed(doc, new Set(["schema","version","corpora"]), errors, "golden_corpus");
  if (doc.schema !== "periodic.golden_corpus.v1") errors.push("golden_corpus.schema: expected 'periodic.golden_corpus.v1'");
  if (typeof doc.version !== "string" || !doc.version.trim()) errors.push("golden_corpus.version: required");
  if (!Array.isArray(doc.corpora)) {
    errors.push("golden_corpus.corpora: expected array");
    return null;
  }
  for (const c of doc.corpora) {
    if (!isObject(c)) {
      errors.push("golden_corpus.corpora[]: expected object");
      continue;
    }
    keysAreClosed(c, new Set(["id","name","description","examples"]), errors, "golden_corpus.corpus");
    if (typeof c.id !== "string" || !c.id.trim()) errors.push("golden_corpus.corpus.id: required");
    if (!Array.isArray(c.examples)) errors.push(`golden_corpus.${c.id}.examples: expected array`);
    if (Array.isArray(c.examples)) {
      const sorted = [...c.examples].sort((a, b) => String(a).localeCompare(String(b)));
      for (let i = 0; i < c.examples.length; i++) {
        if (c.examples[i] !== sorted[i]) {
          warnings.push(`golden_corpus.${c.id}: examples not sorted (determinism risk)`);
          break;
        }
      }
    }
  }
  return doc;
}

function extractRuleIds(messages) {
  const ids = new Set();
  for (const m of messages) {
    const re = /rule '([^']+)'/g;
    let match;
    while ((match = re.exec(String(m)))) {
      ids.add(match[1]);
    }
  }
  return ids;
}

function readTable(tablePath, tableName, errors, warnings) {
  const abs = path.resolve(process.cwd(), tablePath);
  if (!fs.existsSync(abs)) {
    errors.push(`missing_table_file: ${tablePath}`);
    return [];
  }
  const doc = readJson(abs);

  assert(isObject(doc), `${tableName}: expected object`, errors);
  if (!isObject(doc)) return [];

  keysAreClosed(doc, new Set(["schema","table","version","elements"]), errors, `${tableName}`);
  assert(doc.schema === "periodic.table.v1", `${tableName}.schema: expected 'periodic.table.v1'`, errors);
  assert(doc.table === tableName, `${tableName}.table: expected '${tableName}'`, errors);
  assert(typeof doc.version === "string" && doc.version.trim(), `${tableName}.version: required`, errors);
  assert(Array.isArray(doc.elements), `${tableName}.elements: expected array`, errors);

  const elements = Array.isArray(doc.elements) ? doc.elements : [];
  ensureUniqueIds(elements, `${tableName}.elements`, errors);
  checkSortedById(elements, `${tableName}.elements`, warnings);

  for (const el of elements) validateElement(el, `${tableName}.elements.${el?.id || "<unknown>"}`, errors);

  // Enforce table consistency.
  for (const el of elements) {
    if (el && el.table && el.table !== tableName) {
      errors.push(`${tableName}.elements.${el.id}: table mismatch (element.table='${el.table}')`);
    }
  }

  return elements;
}

function readBondRules(bondPath, errors, warnings, strict) {
  const abs = path.resolve(process.cwd(), bondPath);
  if (!fs.existsSync(abs)) {
    errors.push(`missing_bond_rules_file: ${bondPath}`);
    return [];
  }
  const doc = readJson(abs);
  assert(isObject(doc), `bond_rules: expected object`, errors);
  if (!isObject(doc)) return [];

  keysAreClosed(doc, new Set(["schema","version","rules"]), errors, "bond_rules");
  assert(doc.schema === "periodic.bond_ruleset.v1", "bond_rules.schema: expected 'periodic.bond_ruleset.v1'", errors);
  assert(typeof doc.version === "string" && doc.version.trim(), "bond_rules.version: required", errors);
  assert(Array.isArray(doc.rules), "bond_rules.rules: expected array", errors);

  const rules = Array.isArray(doc.rules) ? doc.rules : [];
  // Deterministic normalization: sort base rules by id to avoid incidental order drift.
  // Base rules are optional and often empty, but when present they should be stable.
  rules.sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || "")));
  ensureUniqueIds(rules, "bond_rules.rules", errors);
  checkSortedById(rules, "bond_rules.rules", warnings);

  for (const r of rules) {
    assert(isObject(r), "bond_rules.rules[]: expected object", errors);
    if (!isObject(r)) continue;
    keysAreClosed(r, new Set(["schema","id","when","require","message","severity"]), errors, `bond_rule.${r.id || "<unknown>"}`);
    assert(r.schema === "periodic.bond_rule.v1", `bond_rule.${r.id || "<unknown>"}.schema: expected 'periodic.bond_rule.v1'`, errors);
    assert(typeof r.id === "string" && ID_RE.test(r.id), `bond_rule.id: invalid '${r.id}'`, errors);
    assert(isObject(r.when), `bond_rule.${r.id}.when: expected object`, errors);
    keysAreClosed(r.when, new Set(["any_of","all_of","any_tag","table_any_of","any_of_elements","all_of_elements","any_of_tags"]), errors, `bond_rule.${r.id}.when`);
    assert(isObject(r.require), `bond_rule.${r.id}.require: expected object`, errors);
    keysAreClosed(r.require, new Set(["all_of","any_of","states","elements","all_of_elements","any_of_elements","state_requirements","invariants"]), errors, `bond_rule.${r.id}.require`);
    
    // Strict type checks: prevent "dead laws by type" (e.g., any_of as string).
    const when = isObject(r.when) ? r.when : {};
    const req = isObject(r.require) ? r.require : {};

    const isArrStr = (v) => Array.isArray(v) && v.every((s) => typeof s === "string" && s.trim());
    const isArrObj = (v) => Array.isArray(v) && v.every((o) => isObject(o));

    for (const k of ["any_of","all_of","any_tag","table_any_of","any_of_elements","all_of_elements","any_of_tags"]) {
      if (Object.prototype.hasOwnProperty.call(when, k) && when[k] !== undefined) {
        if (!isArrStr(when[k])) errors.push(`bond_rule.${r.id}.when.${k}: expected array<string>`);
      }
    }

    for (const k of ["all_of","any_of","states","elements","all_of_elements","any_of_elements","invariants"]) {
      if (Object.prototype.hasOwnProperty.call(req, k) && req[k] !== undefined) {
        if (!isArrStr(req[k])) errors.push(`bond_rule.${r.id}.require.${k}: expected array<string>`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(req, "state_requirements") && req.state_requirements !== undefined) {
      if (!isArrObj(req.state_requirements)) {
        errors.push(`bond_rule.${r.id}.require.state_requirements: expected array<object>`);
      } else {
        for (const sr of req.state_requirements) {
          keysAreClosed(sr, new Set(["element_id","must_include","notes"]), errors, `bond_rule.${r.id}.require.state_requirements.entry`);
          if (typeof sr.element_id !== "string" || !sr.element_id.trim()) errors.push(`bond_rule.${r.id}.require.state_requirements.element_id: required string`);
          if (Object.prototype.hasOwnProperty.call(sr, "must_include") && sr.must_include !== undefined) {
            if (!isArrStr(sr.must_include)) errors.push(`bond_rule.${r.id}.require.state_requirements.must_include: expected array<string>`);
          }
          if (Object.prototype.hasOwnProperty.call(sr, "notes") && sr.notes !== undefined) {
            if (typeof sr.notes !== "string") errors.push(`bond_rule.${r.id}.require.state_requirements.notes: expected string`);
          }
        }
      }
    }

    // Disallow structurally empty rules (entropy prevention). In strict => error; else warn.
    const predCount =
      (Array.isArray(when.any_of) ? when.any_of.length : 0) +
      (Array.isArray(when.all_of) ? when.all_of.length : 0) +
      (Array.isArray(when.any_tag) ? when.any_tag.length : 0) +
      (Array.isArray(when.table_any_of) ? when.table_any_of.length : 0) +
      (Array.isArray(when.any_of_elements) ? when.any_of_elements.length : 0) +
      (Array.isArray(when.all_of_elements) ? when.all_of_elements.length : 0) +
      (Array.isArray(when.any_of_tags) ? when.any_of_tags.length : 0);

    const reqCount =
      (Array.isArray(req.all_of) ? req.all_of.length : 0) +
      (Array.isArray(req.any_of) ? req.any_of.length : 0) +
      (Array.isArray(req.states) ? req.states.length : 0) +
      (Array.isArray(req.elements) ? req.elements.length : 0) +
      (Array.isArray(req.all_of_elements) ? req.all_of_elements.length : 0) +
      (Array.isArray(req.any_of_elements) ? req.any_of_elements.length : 0) +
      (Array.isArray(req.invariants) ? req.invariants.length : 0) +
      (Array.isArray(req.state_requirements) ? req.state_requirements.length : 0);

    if (predCount === 0) (strict ? errors : warnings).push(`bond_rule.${r.id}: empty when{} (no predicates)`);
    if (reqCount === 0) (strict ? errors : warnings).push(`bond_rule.${r.id}: empty require{} (no obligations)`);

    assert(typeof r.message === "string" && r.message.trim(), `bond_rule.${r.id}.message: required`, errors);
    assert(r.severity === "error" || r.severity === "warn", `bond_rule.${r.id}.severity: must be error|warn`, errors);
  }

  return rules;
}


function readBondPacks(manifestPath, errors, warnings, enabledPackIds, strict) {
  const abs = path.resolve(process.cwd(), manifestPath);
  if (!fs.existsSync(abs)) {
    if (strict) errors.push(`missing_bond_packs_file: ${manifestPath}`);
    // Still set globals to empty to avoid undefined behavior.
    KNOWN_PACK_IDS = new Set();
    ENABLED_PACK_IDS = new Set();
    return { metaById: new Map(), rulesByPack: new Map(), enabledIds: new Set(), knownIds: new Set(), flatRules: [] };
  }
  const doc = readJson(abs);
  assert(isObject(doc), `bond_packs: expected object`, errors);
  if (!isObject(doc)) return { metaById: new Map(), rulesByPack: new Map(), enabledIds: new Set(), knownIds: new Set(), flatRules: [] };

  keysAreClosed(doc, new Set(["schema","version","packs"]), errors, "bond_packs");
  assert(doc.schema === "periodic.bond_packs.v1", "bond_packs.schema: expected 'periodic.bond_packs.v1'", errors);
  assert(typeof doc.version === "string" && doc.version.trim(), "bond_packs.version: required", errors);
  assert(Array.isArray(doc.packs), "bond_packs.packs: expected array", errors);

  const packs = Array.isArray(doc.packs) ? doc.packs : [];
  ensureUniqueIds(packs, "bond_packs.packs", errors);
  checkSortedById(packs, "bond_packs.packs", warnings);
  const knownIds = new Set(packs.map((p) => p?.id).filter((x) => typeof x === "string"));

  // Validate pack entry shapes.
  for (const p of packs) {
    if (!p || typeof p.id !== "string") continue;
    keysAreClosed(p, new Set(["id","path","description","default_enabled","domains"]), errors, `bond_packs.packs.${p.id}`);
    assert(typeof p.path === "string" && p.path.trim(), `bond_packs.packs.${p.id}.path: required`, errors);
    assert(typeof p.default_enabled === "boolean", `bond_packs.packs.${p.id}.default_enabled: required`, errors);
    assert(Array.isArray(p.domains) && p.domains.length > 0, `bond_packs.packs.${p.id}.domains: required non-empty array`, errors);
    if (Array.isArray(p.domains)) {
      for (const d of p.domains) {
        assert(typeof d === "string" && /^[a-z0-9_]+$/.test(d), `bond_packs.packs.${p.id}.domains: invalid domain '${d}'`, errors);
      }
      // Prevent silent mismapping: pack must declare it applies to itself.
      if (!p.domains.includes(p.id)) {
        errors.push(`bond_packs.packs.${p.id}.domains: must include '${p.id}'`);
      }
    }
  }

  const enabled = new Set();
  if (Array.isArray(enabledPackIds) && enabledPackIds.length > 0) {
    for (const id of enabledPackIds) {
      enabled.add(id);
      if (!knownIds.has(id)) errors.push(`bond_packs: unknown enabled pack id '${id}'`);
    }
  } else {
    for (const p of packs) if (p && p.default_enabled) enabled.add(p.id);
  }

  // Expose pack knowledge for later domain→pack enforcement.
  KNOWN_PACK_IDS = knownIds;
  ENABLED_PACK_IDS = enabled;

  const metaById = new Map();
  const rulesByPack = new Map();

  for (const p of packs) {
    if (!p || typeof p.id !== "string") continue;
    metaById.set(p.id, { id: p.id, path: p.path, domains: Array.isArray(p.domains) ? p.domains.slice() : [], description: p.description || "", default_enabled: !!p.default_enabled });
    if (!enabled.has(p.id)) continue;
    const rules = readBondRules(p.path, errors, warnings, strict);
    for (const r of rules) { if (r && typeof r === 'object') r.source_pack = p.id; }
    rulesByPack.set(p.id, rules);
  }

  const flat = [];
  for (const rs of rulesByPack.values()) flat.push(...rs);

  // Ensure global uniqueness across enabled packs (prevents silent drift).
  ensureUniqueIds(flat, "bond_packs.enabled_rules", errors);

  return { metaById, rulesByPack, enabledIds: enabled, knownIds, flatRules: flat };
}
function compileElementIndex(tables) {
  const map = new Map();
  for (const els of Object.values(tables)) {
    for (const el of els) map.set(el.id, el);
  }
  return map;
}



function validateElementDependencyReferences(elementIndex, errors, warnings, strict) {
  for (const el of elementIndex.values()) {
    const ctx = `element.${el.id}`;
    for (const key of ["implies","requires","invariants"]) {
      const arr = el[key];
      if (arr === undefined) continue;
      if (!Array.isArray(arr)) continue; // shape already checked elsewhere
      for (const ref of arr) {
        if (typeof ref !== "string" || !ref.trim()) {
          const msg = `${ctx}.${key}: entries must be non-empty strings`;
          (strict ? errors : warnings).push(msg);
          continue;
        }
        if (!elementIndex.has(ref)) {
          const msg = `${ctx}.${key}: unknown referenced element id '${ref}'`;
          (strict ? errors : warnings).push(msg);
        }
      }
    }
  }
}

function validateBondRuleReferences(rules, elementIndex, coreTags, errors, warnings, strict) {
  const allowTag = (tag) => typeof tag === "string" && (tag.startsWith("x_") || tag.startsWith("x."));
  const pickArr = (obj, keys) => {
    for (const k of keys) {
      const v = obj && obj[k];
      if (Array.isArray(v)) return v;
    }
    return [];
  };

  for (const r of rules) {
    if (!r || typeof r.id !== "string") continue;
    const when = isObject(r.when) ? r.when : {};
    const req = isObject(r.require) ? r.require : {};

    const whenAnyOf = pickArr(when, ["any_of","any_of_elements"]);
    const whenAllOf = pickArr(when, ["all_of","all_of_elements"]);
    const whenAnyTag = pickArr(when, ["any_tag","any_of_tags"]);
    const whenTableAnyOf = pickArr(when, ["table_any_of"]);

    for (const id of [...whenAnyOf, ...whenAllOf]) {
      if (typeof id !== "string") continue;
      if (!elementIndex.has(id)) errors.push(`bond_rule.${r.id}.when: references unknown element '${id}'`);
    }

    for (const ttag of whenAnyTag) {
      if (typeof ttag !== "string") continue;
      if (allowTag(ttag)) continue;
      if (!coreTags) {
        warnings.push(`bond_rule.${r.id}.when.any_tag: core tags not loaded; cannot validate '${ttag}'`);
      } else if (!coreTags.has(ttag)) {
        const msg = `bond_rule.${r.id}.when.any_tag: unknown tag '${ttag}'`;
        (strict ? errors : warnings).push(msg);
      }
    }

    for (const tb of whenTableAnyOf) {
      if (typeof tb !== "string") continue;
      if (!TABLES.has(tb)) errors.push(`bond_rule.${r.id}.when.table_any_of: unknown table '${tb}'`);
    }

    const reqAllOf = pickArr(req, ["all_of","elements","all_of_elements"]);
    const reqAnyOf = pickArr(req, ["any_of","any_of_elements"]);
    const reqInvariants = pickArr(req, ["invariants"]);

    for (const id of [...reqAllOf, ...reqAnyOf, ...reqInvariants]) {
      if (typeof id !== "string") continue;
      if (!elementIndex.has(id)) errors.push(`bond_rule.${r.id}.require: references unknown element '${id}'`);
    }

    if (Array.isArray(req.state_requirements)) {
      for (const sr of req.state_requirements) {
        if (!sr || typeof sr.element_id !== "string") continue;
        if (!elementIndex.has(sr.element_id)) errors.push(`bond_rule.${r.id}.require.state_requirements: unknown element '${sr.element_id}'`);
        if (Array.isArray(sr.must_include)) {
          for (const id of sr.must_include) {
            if (typeof id !== "string") continue;
            if (!elementIndex.has(id)) errors.push(`bond_rule.${r.id}.require.state_requirements.must_include: unknown element '${id}'`);
          }
        }
      }
    }
  }
}

function formatBecause(because) {
  if (!Array.isArray(because) || because.length === 0) return "";
  const parts = [];
  for (const b of because) {
    if (!b || typeof b.kind !== "string") continue;
    if (b.kind === "when.table_any_of") {
      const tables = Array.isArray(b.tables) ? [...new Set(b.tables.filter((x) => typeof x === "string"))] : [];
      const els = Array.isArray(b.elements) ? [...new Set(b.elements.filter((x) => typeof x === "string"))] : [];
      tables.sort((a,b) => a.localeCompare(b));
      els.sort((a,b) => a.localeCompare(b));
      parts.push(`table_any_of tables=[${tables.join(", ")}] elements=[${els.join(", ")}]`);
      continue;
    }
    const values = Array.isArray(b.values) ? [...new Set(b.values.filter((x) => typeof x === "string"))] : [];
    values.sort((a,b) => a.localeCompare(b));
    parts.push(`${b.kind} [${values.join(", ")}]`);
  }
  return parts.join("; ");
}

function ruleTriggered(rule, compound, elementIndex) {
  const when = rule.when || {};
  const els = new Set(compound.elements || []);
  const because = [];

  // Support both v1 schema keys (any_of/all_of/any_tag/table_any_of)
  // and legacy/internal keys (any_of_elements/all_of_elements/any_of_tags).
  const anyOf = Array.isArray(when.any_of) ? when.any_of : (Array.isArray(when.any_of_elements) ? when.any_of_elements : []);
  const allOf = Array.isArray(when.all_of) ? when.all_of : (Array.isArray(when.all_of_elements) ? when.all_of_elements : []);
  const anyTag = Array.isArray(when.any_tag) ? when.any_tag : (Array.isArray(when.any_of_tags) ? when.any_of_tags : []);
  const tableAnyOf = Array.isArray(when.table_any_of) ? when.table_any_of : [];

  if (anyOf.length > 0) {
    const matched = anyOf.filter((id) => els.has(id));
    if (matched.length === 0) return { triggered: false, because: [] };
    because.push({ kind: "when.any_of", values: matched });
  }

  if (allOf.length > 0) {
    const ok = allOf.every((id) => els.has(id));
    if (!ok) return { triggered: false, because: [] };
    because.push({ kind: "when.all_of", values: allOf });
  }

  if (anyTag.length > 0) {
    const tags = new Set();
    for (const id of els) {
      const e = elementIndex.get(id);
      for (const t of e?.tags || []) tags.add(t);
    }
    const matched = anyTag.filter((t) => tags.has(t));
    if (matched.length === 0) return { triggered: false, because: [] };
    because.push({ kind: "when.any_tag", values: matched });
  }

  if (tableAnyOf.length > 0) {
    const matchedEls = [];
    const matchedTables = new Set();
    for (const id of els) {
      const e = elementIndex.get(id);
      if (e && tableAnyOf.includes(e.table)) {
        matchedEls.push(id);
        matchedTables.add(e.table);
      }
    }
    if (matchedEls.length === 0) return { triggered: false, because: [] };
    because.push({ kind: "when.table_any_of", tables: [...matchedTables], elements: matchedEls });
  }

  return { triggered: true, because };
}

function chooseAnyOfRemediation({ candidatesSorted, elementIndex, strategy }) {
  if (!Array.isArray(candidatesSorted) || candidatesSorted.length === 0) return { chosen: null, tie_break: null };
  const strat = typeof strategy === "string" && strategy.trim() ? strategy.trim() : "lexicographic_smallest";

  if (strat === "safety_first") {
    // Deterministic safety-first tie-break:
    // Prefer elements from tables that represent constraints/evidence over mere capabilities.
    // principle < evidence < workshop < capability < experience
    const rank = new Map([
      ["principle", 0],
      ["evidence", 1],
      ["workshop", 2],
      ["capability", 3],
      ["experience", 4],
    ]);

    let best = null;
    let bestKey = null;
    for (const id of candidatesSorted) {
      const el = elementIndex.get(id);
      const table = el?.table || "";
      const r = rank.has(table) ? rank.get(table) : 99;
      const key = `${String(r).padStart(2, "0")}|${String(id)}`;
      if (bestKey === null || key.localeCompare(bestKey) < 0) {
        bestKey = key;
        best = id;
      }
    }
    return { chosen: best, tie_break: "safety_first_table_rank_then_lex" };
  }

  // Default: lexicographically smallest.
  return { chosen: candidatesSorted[0], tie_break: "lexicographic_smallest" };
}

function applyRule(rule, compound, elementIndex, errors, warnings, waived, waiverSet, waiverMap, domainMeta) {
  const trig = ruleTriggered(rule, compound, elementIndex);
  if (!trig.triggered) return;
  const because = formatBecause(trig.because);

  const req = rule.require || {};
  const els = new Set(compound.elements || []);
  let ok = true;

  const allOf = Array.isArray(req.all_of) ? req.all_of
    : (Array.isArray(req.elements) ? req.elements
    : (Array.isArray(req.all_of_elements) ? req.all_of_elements : []));

  const anyOf = Array.isArray(req.any_of) ? req.any_of
    : (Array.isArray(req.any_of_elements) ? req.any_of_elements : []);

  const missingAll = [];
  for (const id of allOf) {
    if (!els.has(id)) missingAll.push(id);
  }
  if (missingAll.length > 0) ok = false;

  if (anyOf.length > 0) {
    const hit = anyOf.some((id) => els.has(id));
    if (!hit) ok = false;
  }

  // Legacy explicit state requirements (more precise than v1 require.states).
  if (Array.isArray(req.state_requirements) && req.state_requirements.length > 0) {
    for (const sr of req.state_requirements) {
      const el = elementIndex.get(sr.element_id);
      if (!el) { ok = false; continue; }
      const have = new Set(el.required_states || []);
      const miss = (sr.must_include || []).filter((s) => !have.has(s));
      if (miss.length > 0) ok = false;
    }
  } else if (Array.isArray(req.states) && req.states.length > 0) {
    // v1 shorthand: require.states implies the tx status experience element is present and state-complete.
    const txId = "exp.value.tx_status";
    if (!els.has(txId)) ok = false;
    else {
      const el = elementIndex.get(txId);
      if (!el) ok = false;
      else {
        const have = new Set(el.required_states || []);
        const miss = req.states.filter((s) => !have.has(s));
        if (miss.length > 0) ok = false;
      }
    }
  }

  if (Array.isArray(req.invariants) && req.invariants.length > 0) {
    const have = new Set(compound.invariants || []);
    const miss = req.invariants.filter((i) => !have.has(i));
    if (miss.length > 0) ok = false;
  }

  // Evidence satisfaction binding (Explain Trace v6 discipline)
  // In explicit_only mode, evidence elements MUST be bound to the rule they satisfy.
  const evidence_binding_mode = (compound && typeof ((compound.evidence_binding_mode ?? compound.x_evidence_binding_mode)) === "string" && ((compound.evidence_binding_mode ?? compound.x_evidence_binding_mode)).trim())
    ? ((compound.evidence_binding_mode ?? compound.x_evidence_binding_mode)).trim()
    : "implicit_by_id";
  const evidence_bindings = (compound && ((compound.evidence_bindings ?? compound.x_evidence_bindings)) && typeof ((compound.evidence_bindings ?? compound.x_evidence_bindings)) === "object")
    ? ((compound.evidence_bindings ?? compound.x_evidence_bindings))
    : {};
  const bound_for_rule = Array.isArray(evidence_bindings[rule.id]) ? evidence_bindings[rule.id].map(String) : [];
  const bound_set = new Set(bound_for_rule);

  const obligation_ids_pass = Array.from(new Set([
    ...allOf,
    ...anyOf,
    ...((Array.isArray(req.state_requirements)
      ? req.state_requirements.map((x) => x?.element_id).filter((x) => typeof x === "string")
      : [])),
    ...(Array.isArray(req.states) && req.states.length ? ["exp.value.tx_status"] : []),
  ])).sort((a,b)=>String(a).localeCompare(String(b)));

  const evidence_ids_pass = obligation_ids_pass
    .filter((id) => (elementIndex.get(id)?.table) === "evidence")
    .sort((a,b)=>String(a).localeCompare(String(b)));

  const evidence_satisfied_by_pass = evidence_ids_pass.map((id) => {
    const bound = (evidence_binding_mode === "explicit_only") ? bound_set.has(id) : true;
    return {
      evidence_id: id,
      satisfaction_mode: "direct",
      satisfied_by: bound ? [{ kind: "compound_element", element_id: id }] : [],
    };
  });

  const missing_evidence_binding_ids_pass = (evidence_binding_mode === "explicit_only")
    ? evidence_ids_pass.filter((id) => !bound_set.has(id))
    : [];

  if (ok && missing_evidence_binding_ids_pass.length > 0) {
    const explain_requires_bind = {
      all_of: allOf,
      any_of: anyOf,
      state_requirements: Array.isArray(req.state_requirements) ? req.state_requirements : null,
      states: Array.isArray(req.states) ? req.states : null,
      invariants: Array.isArray(req.invariants) ? req.invariants : null,
      evidence_binding_mode,
      evidence_bindings_expected_for_rule: rule.id,
    };
    const explain_atom_bind = {
      kind: "evidence_binding_missing",
      missing_evidence_binding_ids: missing_evidence_binding_ids_pass.slice().sort((a,b)=>String(a).localeCompare(String(b))),
    };
    const explain_obligations_bind = {
      obligation_ids: obligation_ids_pass,
      invariants: Array.isArray(req.invariants) ? req.invariants : [],
    };
    const explain_evidence_bind = {
      evidence_ids: evidence_ids_pass,
      missing_evidence_ids: [],
      missing_evidence_binding_ids: missing_evidence_binding_ids_pass.slice().sort((a,b)=>String(a).localeCompare(String(b))),
    };
    const remediation_bind = {
      kind: "bind_evidence_to_rule",
      rule_id: rule.id,
      bind_evidence_ids: missing_evidence_binding_ids_pass.slice().sort((a,b)=>String(a).localeCompare(String(b))),
    };
    pushViolation({
      kind: "compound",
      compoundId: compound.id,
      ruleId: rule.id,
      severity: "error",
      message: "Evidence present but not bound to rule (explicit evidence binding required).",
      because,
      atom: explain_atom_bind,
      requires: explain_requires_bind,
      remediation: remediation_bind,
      obligations: explain_obligations_bind,
      evidence: explain_evidence_bind,
      evidence_satisfied_by: evidence_satisfied_by_pass,
      source_pack: rule.source_pack || "base",
      waivers: waiverSet,
      waiver_map: waiverMap,
      errors,
      warnings,
      waived,
    });
    return;
  }

  if (ok) return;

  // Explainability trace: structured requirements + the specific missing pieces.
  const explain_requires = {
    all_of: allOf,
    any_of: anyOf,
    state_requirements: Array.isArray(req.state_requirements) ? req.state_requirements : null,
    states: Array.isArray(req.states) ? req.states : null,
    invariants: Array.isArray(req.invariants) ? req.invariants : null,
  };
  const explain_atom = {
    kind: "requirement_miss",
    missing_all_of: missingAll,
    missing_any_of: (anyOf.length > 0 && !anyOf.some((id) => els.has(id))) ? anyOf : [],
  };

  // Obligation/evidence linkage:
  // - obligations are the element IDs a rule requires (the "what must exist")
  // - evidence_ids are the subset that live in the evidence table (the "what must be produced")
  // This makes receipts actionable without leaking internals into Director UI.
  const obligation_ids = Array.from(new Set([
    ...allOf,
    ...anyOf,
    ...((Array.isArray(explain_requires.state_requirements)
      ? explain_requires.state_requirements.map((x) => x?.element_id).filter((x) => typeof x === "string")
      : [])),
    // require.states shorthand implies tx_status experience element; include it in obligations when present.
    ...(Array.isArray(explain_requires.states) && explain_requires.states.length ? ["exp.value.tx_status"] : []),
  ])).sort((a,b)=>String(a).localeCompare(String(b)));

  const evidence_ids = obligation_ids
    .filter((id) => (elementIndex.get(id)?.table) === "evidence")
    .sort((a,b)=>String(a).localeCompare(String(b)));

  const missing_evidence_ids = Array.from(new Set([
    ...(Array.isArray(explain_atom.missing_all_of) ? explain_atom.missing_all_of : []),
    ...(Array.isArray(explain_atom.missing_any_of) ? explain_atom.missing_any_of : []),
  ]))
    .filter((id) => (elementIndex.get(id)?.table) === "evidence")
    .sort((a,b)=>String(a).localeCompare(String(b)));

  const explain_obligations = {
    obligation_ids,
    invariants: Array.isArray(explain_requires.invariants) ? explain_requires.invariants : [],
  };

  const explain_evidence = {
    evidence_ids,
    missing_evidence_ids,
  };

  // Evidence satisfaction mapping for Explain Trace v6 (rule → evidence satisfaction provenance)
  const missingEvidenceSet = new Set(missing_evidence_ids.map(String));
  const evidence_satisfied_by = evidence_ids
    .slice()
    .sort((a,b)=>String(a).localeCompare(String(b)))
    .map((id) => {
      const bound = (evidence_binding_mode === "explicit_only") ? bound_set.has(String(id)) : true;
      const present = els.has(String(id)) && !missingEvidenceSet.has(String(id));
      return {
        evidence_id: String(id),
        satisfaction_mode: "direct",
        satisfied_by: (present && bound) ? [{ kind: "compound_element", element_id: String(id) }] : [],
      };
    });

  // Remediation plan (machine-readable): minimal deterministic patch set.
  // Goal: help LLM/Operator converge without guesswork.
  // - missing_all_of => must add all
  // - missing_any_of => add exactly one (tie-break: domain-scoped strategy; default lexicographic)
  let remediation = null;
  try {
    const missingAllSorted = Array.isArray(explain_atom.missing_all_of)
      ? explain_atom.missing_all_of.slice().map(String).sort((a,b)=>a.localeCompare(b))
      : [];
    const missingAnySorted = Array.isArray(explain_atom.missing_any_of)
      ? explain_atom.missing_any_of.slice().map(String).sort((a,b)=>a.localeCompare(b))
      : [];

    const strat = (domainMeta && typeof domainMeta.remediation_any_of_strategy === "string")
      ? domainMeta.remediation_any_of_strategy
      : "lexicographic_smallest";
    const choice = chooseAnyOfRemediation({ candidatesSorted: missingAnySorted, elementIndex, strategy: strat });
    const chooseAny = choice.chosen;
    const addElements = Array.from(new Set([
      ...missingAllSorted,
      ...(chooseAny ? [chooseAny] : []),
    ])).sort((a,b)=>a.localeCompare(b));

    // Evidence subset for tooling that wants to generate receipts/tests/etc.
    const addEvidenceIds = addElements
      .filter((id) => (elementIndex.get(id)?.table) === "evidence")
      .sort((a,b)=>a.localeCompare(b));

    if (addElements.length) {
      remediation = {
        kind: "add_elements",
        add_elements: addElements,
        add_evidence_ids: addEvidenceIds,
        any_of_choice: chooseAny,
        tie_break: chooseAny ? choice.tie_break : null,
      };
    }
  } catch {
    remediation = null;
  }

  pushViolation({
    kind: "compound",
    compoundId: compound.id,
    ruleId: rule.id,
    severity: rule.severity,
    message: rule.message,
    because,
    atom: explain_atom,
    requires: explain_requires,
    remediation,
    obligations: explain_obligations,
    evidence: explain_evidence,
    evidence_satisfied_by,
    source_pack: rule.source_pack || "base",
    waivers: waiverSet,
    waiver_map: waiverMap,
    errors,
    warnings,
    waived,
  });
}

function readCompound(p, errors) {
  const abs = path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) {
    errors.push(`missing_compound_file: ${p}`);
    return null;
  }
  const c = readJson(abs);
  return c;
}

function readSystem(p, errors) {
  const SYS_ALIAS_RE = /^[a-z0-9_]+$/;
  const abs = path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) {
    errors.push(`rule 'system.file.missing' :: missing system file (${p})`);
    return null;
  }
  const s = readJson(abs);
  if (!isObject(s)) {
    errors.push(`rule 'system.file.invalid' :: expected object in ${p}`);
    return null;
  }
  keysAreClosed(s, new Set(["schema","id","name","version","compounds","links","waivers"]), errors, "system");
  if (s.schema !== "periodic.system.v1") errors.push(`rule 'system.schema.invalid' :: system.schema: expected 'periodic.system.v1' (${p})`);
  if (typeof s.id !== "string" || !s.id.startsWith("system.")) errors.push(`rule 'system.id.invalid' :: system.id: invalid (${p})`);
  if (typeof s.name !== "string" || !s.name.trim()) errors.push(`rule 'system.name.required' :: system.name: required (${p})`);
  if (typeof s.version !== "number" || s.version < 1) errors.push(`rule 'system.version.invalid' :: system.version: invalid (${p})`);
  validateWaiversArray(s.waivers, `system.${s.id || "<unknown>"}`, errors);
  if (!Array.isArray(s.compounds) || s.compounds.length === 0) errors.push(`rule 'system.compounds.required' :: system.compounds: required (${p})`);
  if (!Array.isArray(s.links)) errors.push(`rule 'system.links.required' :: system.links: required (${p})`);
  if (Array.isArray(s.compounds)) {
    const seen = new Set();
    for (const c of s.compounds) {
      if (!isObject(c)) { errors.push(`rule 'system.compound.invalid' :: system.compounds: expected objects (${p})`); continue; }
      keysAreClosed(c, new Set(["as","path"]), errors, "system.compound");
      if (typeof c.as !== "string" || !c.as.trim()) errors.push(`rule 'system.compound.as.required' :: system.compound.as: required (${p})`);
      if (typeof c.as === "string" && c.as.trim() && !SYS_ALIAS_RE.test(c.as)) errors.push(`rule 'system.alias.invalid' :: system.compound.as: invalid alias '${c.as}' (${p})`);
      if (typeof c.path !== "string" || !c.path.trim()) errors.push(`rule 'system.compound.path.required' :: system.compound.path: required (${p})`);
      if (typeof c.as === "string") {
        if (seen.has(c.as)) errors.push(`rule 'system.compound.as.duplicate' :: duplicate compound alias '${c.as}' (${p})`);
        seen.add(c.as);
      }
    }
  }
  if (Array.isArray(s.links)) {
    for (const l of s.links) {
      if (!isObject(l)) { errors.push(`rule 'system.link.invalid' :: system.links: expected objects (${p})`); continue; }
      keysAreClosed(l, new Set(["from","to","via"]), errors, "system.link");
      if (typeof l.from !== "string" || !l.from.trim()) errors.push(`rule 'system.link.from.required' :: system.link.from: required (${p})`);
      if (typeof l.to !== "string" || !l.to.trim()) errors.push(`rule 'system.link.to.required' :: system.link.to: required (${p})`);
      if (typeof l.from === "string" && l.from.trim() && !SYS_ALIAS_RE.test(l.from)) errors.push(`rule 'system.link.endpoint.invalid' :: system.link.from: invalid endpoint '${l.from}' (${p})`);
      if (typeof l.to === "string" && l.to.trim() && !SYS_ALIAS_RE.test(l.to)) errors.push(`rule 'system.link.endpoint.invalid' :: system.link.to: invalid endpoint '${l.to}' (${p})`);
      if (!isObject(l.via)) errors.push(`rule 'system.link.via.required' :: system.link.via: required (${p})`);
      if (isObject(l.via)) {
        keysAreClosed(l.via, new Set(["cap","notes","endorsement_id"]), errors, "system.link.via");
        if (typeof l.via.cap !== "string" || !l.via.cap.startsWith("cap.membrane.")) {
          errors.push(`rule 'system.link.via.cap.invalid' :: system.link.via.cap must be a membrane capability (${p})`);
        }
      }
    }
  }

  // System waivers must scar: targets and mitigations must reference real system parts.
  if (Array.isArray(s.waivers)) {
    const aliasSet = new Set((s.compounds || []).map((c) => c && typeof c.as === "string" ? c.as : null).filter(Boolean));
    const linkSet = new Set((s.links || []).map((l) => (l && typeof l.from === "string" && typeof l.to === "string") ? `${l.from}->${l.to}` : null).filter(Boolean));
    const parseLink = (v) => {
      const m = /^link:([a-z0-9_]+)->([a-z0-9_]+)$/.exec(v);
      return m ? `${m[1]}->${m[2]}` : null;
    };
    for (const w of s.waivers) {
      if (!w || typeof w.rule_id !== "string") continue;
      const tgt = typeof w.target === "string" ? w.target.trim() : "";
      if (tgt !== "system") {
        const lk = parseLink(tgt);
        if (!lk || !linkSet.has(lk)) {
          errors.push(`rule 'system.waiver.target.invalid' :: waiver target must be 'system' or 'link:<from>-><to>' (got '${tgt}') (${p})`);
        }
      }
      if (Array.isArray(w.mitigations)) {
        for (const m of w.mitigations) {
          const ms = typeof m === "string" ? m.trim() : "";
          if (!ms) continue;
          if (ms.startsWith("compound:")) {
            const a = ms.slice("compound:".length);
            if (!aliasSet.has(a)) errors.push(`rule 'system.waiver.mitigation.invalid' :: mitigation references missing compound alias '${a}' (${p})`);
          } else if (ms.startsWith("link:")) {
            const lk = parseLink(ms);
            if (!lk || !linkSet.has(lk)) errors.push(`rule 'system.waiver.mitigation.invalid' :: mitigation references missing link '${ms}' (${p})`);
          } else {
            errors.push(`rule 'system.waiver.mitigation.invalid' :: mitigation must be 'compound:<alias>' or 'link:<from>-><to>' (got '${ms}') (${p})`);
          }
        }
      }
    }
  }
  return s;
}

function loadSystemNegativeExamples(p, strict, errors, warnings) {
  if (!p) return [];
  const abs = path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) {
    if (strict) errors.push(`system_negative_examples: missing file (${p})`);
    return [];
  }
  const doc = readJson(abs);
  if (!isObject(doc)) {
    errors.push(`system_negative_examples: expected object in ${p}`);
    return [];
  }
  keysAreClosed(doc, new Set(["schema","version","cases"]), errors, "system_negative_examples");
  if (doc.schema !== "periodic.system_negative_examples.v1") errors.push(`system_negative_examples.schema: expected 'periodic.system_negative_examples.v1'`);
  if (typeof doc.version !== "string" || !doc.version.trim()) errors.push("system_negative_examples.version: required");
  if (!Array.isArray(doc.cases)) {
    errors.push("system_negative_examples.cases: expected array");
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const c of doc.cases) {
    if (!isObject(c)) { errors.push("system_negative_examples.case: expected object"); continue; }
    keysAreClosed(c, new Set(["id","path","expect_errors","expect_warnings","note"]), errors, "system_negative_examples.case");
    if (typeof c.id !== "string" || !ID_RE.test(c.id)) errors.push(`system_negative_examples.case.id: invalid '${c.id}'`);
    if (seen.has(c.id)) errors.push(`system_negative_examples.case: duplicate id '${c.id}'`);
    seen.add(c.id);
    if (typeof c.path !== "string" || !c.path.trim()) errors.push(`system_negative_examples.case.${c.id}: path required`);
    if (c.expect_errors !== undefined && !Array.isArray(c.expect_errors)) errors.push(`system_negative_examples.case.${c.id}.expect_errors: expected array`);
    if (c.expect_warnings !== undefined && !Array.isArray(c.expect_warnings)) errors.push(`system_negative_examples.case.${c.id}.expect_warnings: expected array`);
    out.push(c);
  }
  return out;
}


function validateCompound(c, elementIndex, errors, warnings) {
  assert(isObject(c), `compound: expected object`, errors);
  if (!isObject(c)) return;

  keysAreClosed(c, new Set(["schema","id","name","domain","tables_version","elements","invariants","director_notes","waivers"]), errors, `compound.${c.id || "<unknown>"}`);
  assert(c.schema === "periodic.compound.v1", `compound.${c.id || "<unknown>"}.schema: expected 'periodic.compound.v1'`, errors);
  assert(typeof c.id === "string" && ID_RE.test(c.id), `compound.id: invalid '${c.id}'`, errors);
  assert(typeof c.name === "string" && c.name.trim(), `compound.${c.id}.name: required`, errors);
  assert(typeof c.tables_version === "string" && c.tables_version.trim(), `compound.${c.id}.tables_version: required`, errors);
  assert(Array.isArray(c.elements) && c.elements.length > 0, `compound.${c.id}.elements: required`, errors);

  // Prevent free-text blob drift: director_notes is allowed but bounded and single-line.
  if (c.director_notes !== undefined) {
    if (typeof c.director_notes !== "string") {
      errors.push(`compound.${c.id}.director_notes: expected string`);
    } else {
      if (c.director_notes.length > 280) errors.push(`compound.${c.id}.director_notes: too long (max 280)`);
      if (/[\r\n]/.test(c.director_notes)) errors.push(`compound.${c.id}.director_notes: must be single-line`);
    }
  }

  validateWaiversArray(c.waivers, `compound.${c.id}`, errors);

  // Ensure elements exist
  for (const id of c.elements || []) {
    if (!elementIndex.has(id)) errors.push(`compound.${c.id}: unknown element '${id}'`);
  }

  // Enforce no duplicate element ids (determinism + semantic correctness).
  const seenEls = new Set();
  for (const id of c.elements || []) {
    if (typeof id !== "string") continue;
    if (seenEls.has(id)) { errors.push(`compound.${c.id}: duplicate element '${id}'`); }
    seenEls.add(id);
  }

  // Waiver targets/mitigations must reference real element IDs to avoid "vibes mitigation".
  for (const w of c.waivers || []) {
    if (!w || typeof w.rule_id !== "string") continue;
    const tgt = typeof w.target === "string" ? w.target.trim() : "";
    const parseEl = (s) => (s.startsWith("element:") ? s.slice("element:".length) : s);
    if (tgt === "compound") {
      // ok
    } else if (tgt.startsWith("element:")) {
      const eid = parseEl(tgt);
      if (!seenEls.has(eid)) errors.push(`compound.${c.id}.waivers.${w.rule_id}.target: unknown element '${eid}'`);
    } else {
      errors.push(`compound.${c.id}.waivers.${w.rule_id}.target: expected 'compound' or 'element:<id>'`);
    }

    if (Array.isArray(w.mitigations)) {
      for (const m of w.mitigations) {
        if (typeof m !== "string" || !m.trim()) continue;
        const mid = parseEl(m.trim());
        if (!seenEls.has(mid)) errors.push(`compound.${c.id}.waivers.${w.rule_id}.mitigations: must reference existing element id (got '${m}')`);
      }
    }

    // Optional waiver extension: x_missing[] lists element ids that are *missing* and being waived.
    // This prevents "meaningless mitigations" while still allowing waivers for absent requirements.
    const xMissing = w.x_missing;
    if (xMissing !== undefined) {
      if (!Array.isArray(xMissing) || xMissing.length === 0 || !xMissing.every((x) => typeof x === "string" && x.trim())) {
        errors.push(`compound.${c.id}.waivers.${w.rule_id}.x_missing: expected non-empty array<string>`);
      } else {
        // Validate ids exist globally, and that they are actually missing from this compound.
        for (const mid of xMissing) {
          if (!elementIndex.has(mid)) {
            errors.push(`compound.${c.id}.waivers.${w.rule_id}.x_missing: unknown element id '${mid}'`);
          } else if (seenEls.has(mid)) {
            errors.push(`compound.${c.id}.waivers.${w.rule_id}.x_missing: element '${mid}' is not missing (it is present in compound)`);
          }
        }

        // Coarse sanity linkage: at least one mitigation shares (domain OR table OR group) with each missing id.
        const mitigationIds = Array.isArray(w.mitigations)
          ? w.mitigations
              .filter((m) => typeof m === "string" && m.trim())
              .map((m) => parseEl(m.trim()))
              .filter((m) => seenEls.has(m))
          : [];

        for (const missId of xMissing) {
          const missEl = elementIndex.get(missId);
          if (!missEl) continue;
          const missDomain = missEl.domain || "";
          const missTable = missEl.table || "";
          const missGroup = missEl.group || "";
          let linked = false;
          for (const mitId of mitigationIds) {
            const mitEl = elementIndex.get(mitId);
            if (!mitEl) continue;
            if ((missDomain && mitEl.domain === missDomain) || (missTable && mitEl.table === missTable) || (missGroup && mitEl.group === missGroup)) {
              linked = true;
              break;
            }
          }
          if (!linked) {
            errors.push(`compound.${c.id}.waivers.${w.rule_id}.x_missing: missing element '${missId}' is not plausibly linked to mitigations (no shared domain/table/group)`);
          }
        }
      }
    }
  }

  // Determinism: sorted ids in compounds
  const ids = (c.elements || []).filter((x) => typeof x === "string");
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] !== sorted[i]) {
      warnings.push(`compound.${c.id}: elements are not sorted by id (determinism risk)`);
      break;
    }
  }
}

function writeReportMd({ ok, input, errors, warnings, waived }, outPath) {
  const lines = [];
  lines.push(`# Periodic System Contracts Report`);
  lines.push("");
  lines.push(`- input: ${input}`);
  lines.push(`- profile: ${ACTIVE_PROFILE}`);
  lines.push(`- ok: ${ok ? "yes" : "no"}`);
  lines.push("");

  if (errors.length) {
    lines.push(`## Errors (${errors.length})`);
    lines.push("");
    for (const e of errors) lines.push(`- ${e}`);
    lines.push("");
  }
  if (warnings.length) {
    lines.push(`## Warnings (${warnings.length})`);
    lines.push("");
    for (const w of warnings) lines.push(`- ${w}`);
    lines.push("");
  }

  if (waived && waived.length) {
    lines.push(`## Waived (${waived.length})`);
    lines.push("");
    for (const w of waived) lines.push(`- ${w}`);
    lines.push("");
  }
  if (!errors.length && !warnings.length) {
    lines.push(`## Notes`);
    lines.push("");
    lines.push(`No errors or warnings.`);
    lines.push("");
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
}

function main() {
  const argv = process.argv.slice(2);
  const strict = argv.includes("--strict");
  TRACE_ENABLED = argv.includes("--trace");
  TRACE_HASH_ONLY = argv.includes("--trace_hash_only");
  // Hash-only trace mode still requires trace computation, but avoids emitting the full trace/receipt payloads.
  if (TRACE_HASH_ONLY) TRACE_ENABLED = true;
  const profileIdx = argv.indexOf("--profile");
  const requestedProfile = profileIdx >= 0 ? argv[profileIdx + 1] : null;
  const idxArg = argv.find((a) => !a.startsWith("--")) || "periodic/v1/periodic.index.v1.json";
  const asOfIdx = argv.indexOf("--as_of");
  const asOfArg = asOfIdx >= 0 ? argv[asOfIdx + 1] : null;
  const AS_OF = (typeof asOfArg === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asOfArg))
    ? asOfArg
    : new Date().toISOString().slice(0, 10);
  const reportIdx = argv.indexOf("--report");
  const reportPath = reportIdx >= 0 ? argv[reportIdx + 1] : null;

  const outJsonIdx = argv.indexOf("--out-json");
  const outJsonPath = outJsonIdx >= 0 ? argv[outJsonIdx + 1] : null;

  const stdoutJson = argv.includes("--stdout-json");
  const quiet = argv.includes("--quiet");

  const receiptOutIdx = argv.indexOf("--receipt-out");
  const receiptOutPath = receiptOutIdx >= 0 ? argv[receiptOutIdx + 1] : null;

  // Optional: DSSE receipt export (signed envelope).
  // This is Proof Lane / Operator surface only; it does not affect Director UX.
  const receiptDsseOutIdx = argv.indexOf("--receipt-dsse-out");
  const receiptDsseOutPath = receiptDsseOutIdx >= 0 ? argv[receiptDsseOutIdx + 1] : null;
  const receiptDsseKeyIdx = argv.indexOf("--receipt-dsse-key");
  const receiptDsseKeyPath = receiptDsseKeyIdx >= 0 ? argv[receiptDsseKeyIdx + 1] : null;
  const receiptDssePayloadTypeIdx = argv.indexOf("--receipt-dsse-payloadType");
  const receiptDssePayloadType = receiptDssePayloadTypeIdx >= 0 ? argv[receiptDssePayloadTypeIdx + 1] : "application/vnd.kindred.spel.receipt+json";
  const receiptDsseKeyIdIdx = argv.indexOf("--receipt-dsse-keyid");
  const receiptDsseKeyId = receiptDsseKeyIdIdx >= 0 ? argv[receiptDsseKeyIdIdx + 1] : null;

  // Optional: bundle export (single-file portable capsule)
  const receiptBundleOutIdx = argv.indexOf("--receipt-bundle-out");
  const receiptBundleOutPath = receiptBundleOutIdx >= 0 ? argv[receiptBundleOutIdx + 1] : null;

  // Optional: DSSE self-verification (requires public key PEM)
  const receiptDsseVerifyIdx = argv.indexOf("--receipt-dsse-verify");
  const receiptDsseVerify = receiptDsseVerifyIdx >= 0;
  const receiptDssePubIdx = argv.indexOf("--receipt-dsse-pub");
  const receiptDssePubPath = receiptDssePubIdx >= 0 ? argv[receiptDssePubIdx + 1] : null;

  // If a receipt export is requested, force trace mode so the receipt capsule exists.
  if (receiptOutPath || receiptDsseOutPath || receiptBundleOutPath) TRACE_ENABLED = true;

  const res = loadIndex(idxArg);
  const errors = [...(res.errors || [])];
  const warnings = [...(res.warnings || [])];
  const waived = [];

  // CLI invariants: hash-only trace mode is for determinism checks, not export surfaces.
  if (TRACE_HASH_ONLY && (receiptOutPath || receiptDsseOutPath || receiptBundleOutPath || receiptDsseVerify)) {
    errors.push("--trace_hash_only cannot be combined with receipt export/verification flags");
  }

  if (res.index) {
    const idx = res.index;

    loadProfiles(idx.profiles?.path, errors, strict, requestedProfile);
    CORE_TAGS = loadCoreTags(errors, warnings);

    const DOMAINS = loadDomains(idx.domains?.path, strict, errors, warnings);

    const tables = {};
    for (const t of Object.keys(idx.tables || {})) {
      tables[t] = readTable(idx.tables[t].path, t, errors, warnings);
    }

    const elementIndex = compileElementIndex(tables);

    // Atomic properties: periodic-table-like predictability. Required in strict mode.
    loadAtomicProperties(idx.atomic_properties?.path, strict, errors, warnings, elementIndex);

    // Load SPEL semantics doctrine (endorsement identity vs post-condition).
    SPEL_SEMANTICS = loadSpelSemantics(idx.spel_semantics?.path, strict, errors, warnings);


// In strict mode, do not allow elements to omit domain: silent defaults cause physics drift.
for (const el of elementIndex.values()) {
  const hasDomain = typeof el.domain === "string" && el.domain.trim().length > 0;
  if (!hasDomain) {
    const msg = `element.${el.id}.domain: required (missing explicit domain)`;
    if (strict) errors.push(msg);
    else warnings.push(msg);
  }
}

// Validate element dependency references (implies/requires/invariants) against the compiled element index.
validateElementDependencyReferences(elementIndex, errors, warnings, strict);



    // Domain validation (immiscible domains; membrane is neutral).
    if (DOMAINS) {
      for (const el of elementIndex.values()) {
        const d = (typeof el.domain === "string" && el.domain.trim()) ? el.domain : "internet_app";
        el.domain = d;
        if (!DOMAINS.ids.has(d)) errors.push(`element.${el.id}: unknown domain '${d}'`);
      }
    }

    const baseRules = readBondRules(idx.bond_rules?.path, errors, warnings, strict);
    for (const r of baseRules) { if (r && typeof r === 'object') r.source_pack = 'base'; }
    const packBundle = readBondPacks(idx.bond_packs?.path, errors, warnings, ACTIVE_PACKS, strict);
    const packMetaById = packBundle.metaById;
    const packRulesById = packBundle.rulesByPack;
    // Validate pack domain mappings against the domain registry (prevents silent typos that disable physics).
    if (DOMAINS && DOMAINS.ids) {
      for (const [pid, meta] of packMetaById.entries()) {
        const domains = Array.isArray(meta.domains) ? meta.domains : [];
        for (const d of domains) {
          if (!DOMAINS.ids.has(d)) errors.push(`bond_packs.packs.${pid}.domains: unknown domain '${d}'`);
        }
      }
    }

    const allRules = [...baseRules, ...packBundle.flatRules];
    // Global uniqueness across base + enabled packs (prevents silent drift)
    ensureUniqueIds(allRules, "bond_rules+packs", errors);
    validateBondRuleReferences(allRules, elementIndex, CORE_TAGS, errors, warnings, strict);

    function rulesForCompound(inf, usesMembrane) {
      // Apply only packs whose declared domains intersect the compound's inferred non-neutral domains.
      // Membrane pack applies when membrane elements are present.
      const domains = inf && inf.domains ? inf.domains : new Set();
      const out = [...baseRules];
      if (!ENABLED_PACK_IDS) return out;

      // Membrane boundary physics
      if (usesMembrane && ENABLED_PACK_IDS.has("membrane")) {
        const rs = packRulesById.get("membrane") || [];
        out.push(...rs);
      }

      // Cross-cut packs: a pack may declare that it applies to multiple domains.
      // We apply any enabled pack whose declared domains intersect this compound's inferred domains.
      const enabledSorted = [...ENABLED_PACK_IDS].sort((a, b) => a.localeCompare(b));
      for (const pid of enabledSorted) {
        if (pid === "membrane") continue;
        const meta = packMetaById.get(pid);
        const decl = meta && Array.isArray(meta.domains) ? meta.domains : [];
        if (decl.some((d) => domains.has(d))) {
          const rs = packRulesById.get(pid) || [];
          out.push(...rs);
        }
      }

      return out;
    }

    const pairsPath = idx.pairing?.flow_workshop?.path;
    const pairs = loadFlowWorkshopPairs(pairsPath, strict, errors, warnings);
    // Validate pair references exist (best-effort; do not crash).
    for (const pair of pairs) {
      if (pair.flow && !elementIndex.has(pair.flow)) errors.push("flow_workshop_pairs: unknown flow element '" + pair.flow + "'");
      if (pair.workshop && !elementIndex.has(pair.workshop)) errors.push("flow_workshop_pairs: unknown workshop element '" + pair.workshop + "'");
    }


    function inferCompoundDomain(c) {
      if (!DOMAINS) return { inferred: null, domains: new Set() };
      const domains = new Set();
      for (const id of c.elements || []) {
        const el = elementIndex.get(id);
        if (!el) continue;
        domains.add(el.domain || "internet_app");
      }
      // Neutral domains (membrane + optional helpers like proof_lane) should not count as primary domains.
      // This keeps oil/water immiscibility focused on the "real" domains.
      const neutralSet = DOMAINS.neutralSet instanceof Set ? DOMAINS.neutralSet : new Set([DOMAINS.neutral]);
      for (const nd of neutralSet) domains.delete(nd);
      let inferred = null;
      if (domains.size === 1) inferred = [...domains][0];
      return { inferred, domains };
    }

    function evaluateCompound(c, outErrors, outWarnings, outWaived) {
      validateCompound(c, elementIndex, outErrors, outWarnings);
      const waiverSet = waiverSetFor(c, AS_OF, errors, `compound.${c.id}`);
      const waiverMap = waiverMapFor(c, AS_OF, errors, `compound.${c.id}`);

      const inf = inferCompoundDomain(c);

      // Determine whether any membrane (neutral domain) elements are present.
      let usesMembrane = false;
      if (DOMAINS) {
        for (const id of c.elements || []) {
          const el = elementIndex.get(id);
          if (el && el.domain === DOMAINS.neutral) { usesMembrane = true; break; }
        }
      }

      // Domain immiscibility: compounds may include membrane (neutral) plus any set of domains that are mutually miscible.
      if (DOMAINS && inf.domains.size > 1 && DOMAINS.immiscible && DOMAINS.immiscible.size) {
        const arr = [...inf.domains];
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const a = arr[i];
            const b = arr[j];
            const key = [a, b].sort().join("|");
            if (DOMAINS.immiscible.has(key)) {
              {
                const pair = [a, b].slice().sort();
                pushViolation({
                  kind: "compound",
                  compoundId: c.id,
                  ruleId: "domain.immiscible",
                  severity: "error",
                  message: `domains '${pair[0]}' and '${pair[1]}' are immiscible within a single compound (split into system-of-compounds + membranes)`,
                  waivers: waiverSet,
                  waiver_map: waiverMap,
                  errors: outErrors,
                  warnings: outWarnings,
                  waived: outWaived,
                });
              }
            }
          }
        }
      }

      if (typeof c.domain === "string" && c.domain.trim()) {
        if (inf.inferred && c.domain !== inf.inferred) {
          pushViolation({
            kind: "compound",
            compoundId: c.id,
            ruleId: "domain.declared_mismatch",
            severity: "error",
            message: `compound declares domain '${c.domain}' but inferred is '${inf.inferred}'`,
            remediation: {
              kind: "set_domain",
              from: c.domain,
              to: inf.inferred,
            },
            waivers: waiverSet,
            waiver_map: waiverMap,
            errors: outErrors,
            warnings: outWarnings,
            waived: outWaived,
          });
        }
        // Declared domain is only meaningful when inference is unambiguous.
        // If inference yields none (membrane-only) or multiple domains, declaring a single domain is a lie.
        if (!inf.inferred) {
          const inferredList = inf.domains && inf.domains.size ? [...inf.domains].sort().join(",") : "(none)";
          pushViolation({
            kind: "compound",
            compoundId: c.id,
            ruleId: "domain.declared_ambiguous",
            severity: "error",
            message: `compound declares domain '${c.domain}' but inferred domains are ${inferredList}; omit 'domain' or split into system-of-compounds`,
            remediation: {
              kind: "remove_domain",
              remove: true,
              note: "Declared domain is only valid when inference is unambiguous. Remove 'domain' or split into a system-of-compounds.",
            },
            waivers: waiverSet,
            waiver_map: waiverMap,
            errors: outErrors,
            warnings: outWarnings,
            waived: outWaived,
          });
        }
      }

      // NOTE: multi-domain compounds are allowed only when all domain pairs are miscible (not listed in domains.immiscible).
      // This keeps "water/oil" as a real contract without forcing everything into a single-domain straitjacket.
      // Domain→pack linkage: if a compound uses a domain, the corresponding pack must exist and be enabled.
      // This prevents 'checker passed by omission' when profiles forget to enable domain physics.
      if (ENABLED_PACK_IDS && KNOWN_PACK_IDS && DOMAINS) {
        const nonNeutralDomains = inf.domains;
        const checkPack = (d) => {
          if (!KNOWN_PACK_IDS.has(d)) {
            pushViolation({
              kind: 'compound',
              compoundId: c.id,
              ruleId: 'packs.missing_for_domain',
              severity: 'error',
              message: `compound uses domain "${d}" but no pack exists for that domain`,
              remediation: {
                kind: 'create_pack_stub',
                pack_id: d,
                note: 'Create a bond pack for this domain and enable it in the active profile to avoid proof-by-omission.',
              },
              waivers: waiverSet,
              waiver_map: waiverMap,
              errors: outErrors,
              warnings: outWarnings,
              waived: outWaived,
            });
          } else if (!ENABLED_PACK_IDS.has(d)) {
            pushViolation({
              kind: 'compound',
              compoundId: c.id,
              ruleId: 'profile.pack_missing_for_domain',
              severity: 'error',
              message: `compound uses domain "${d}" but pack "${d}" is not enabled for profile "${ACTIVE_PROFILE || 'unknown'}"`,
              remediation: {
                kind: 'enable_pack',
                profile: ACTIVE_PROFILE || 'unknown',
                enable_pack_id: d,
              },
              waivers: waiverSet,
              waiver_map: waiverMap,
              errors: outErrors,
              warnings: outWarnings,
              waived: outWaived,
            });
          }
        };

        if (nonNeutralDomains.size === 0) {
          if (usesMembrane) checkPack('membrane');
        } else {
          for (const d of nonNeutralDomains) checkPack(d);
          if (usesMembrane) checkPack('membrane');
        }
      }

      // Flow↔workshop pairing (drift prevention)
      for (const pair of pairs) {
        if (!pair.flow || !pair.workshop) continue;
        const hasFlow = Array.isArray(c.elements) && c.elements.includes(pair.flow);
        const hasWorkshop = Array.isArray(c.elements) && c.elements.includes(pair.workshop);
        if (hasFlow && !hasWorkshop) {
          const msg = "compound." + c.id + ": rule 'pair.flow_workshop.missing' pairing requires '" + pair.workshop + "' when '" + pair.flow + "' is present :: " + pair.message;
          pushViolation({
            kind: "compound",
            compoundId: c.id,
            ruleId: "pair.flow_workshop.missing",
            severity: pair.severity === "warn" ? "warn" : "error",
            message: `pairing requires '${pair.workshop}' when '${pair.flow}' is present :: ${pair.message}`,
            remediation: {
              kind: "add_elements",
              add_elements: [pair.workshop],
              add_evidence_ids: (elementIndex.get(pair.workshop)?.table === 'evidence') ? [pair.workshop] : [],
              any_of_choice: null,
              tie_break: null,
            },
            waivers: waiverSet,
            waiver_map: waiverMap,
            errors: outErrors,
            warnings: outWarnings,
            waived: outWaived,
          });
        }
      }
      const applicableRules = rulesForCompound(inf, usesMembrane);
      const domId = (typeof c.domain === "string" && c.domain.trim()) ? c.domain : inf.inferred;
      const domMeta = (DOMAINS && DOMAINS.metaById && domId && DOMAINS.metaById.get(domId)) ? DOMAINS.metaById.get(domId) : null;
      for (const r of applicableRules) applyRule(r, c, elementIndex, outErrors, outWarnings, outWaived, waiverSet, waiverMap, domMeta);
    }

    // Negative examples are regression tests for known failure cliffs.
    const negPath = idx.negative_examples?.path;
    const negCases = loadNegativeExamples(negPath, strict, errors, warnings);

    // Domain completion enforcement (strict only): enabled packs must be "real", not JSON stubs.
    // Completion is pack-scoped to preserve federation immiscibility: each domain is its own physics table.
    if (strict && ENABLED_PACK_IDS && packMetaById && packRulesById) {
      const completion = loadDomainCompletion(strict, errors, warnings);
      const enabled = [...ENABLED_PACK_IDS].sort((a, b) => a.localeCompare(b));

      // Count positive and negative examples per pack based on applicability (domain intersection).
      const posCount = new Map();
      const negCount = new Map();

      function bump(map, key) {
        map.set(key, (map.get(key) || 0) + 1);
      }

      function applicablePacksForCompound(c) {
        const usesMembrane = Array.isArray(c.elements) && DOMAINS ? c.elements.some((id) => {
          const el = elementIndex.get(id);
          return !!(el && el.domain === DOMAINS.neutral);
        }) : false;
        const inf = inferCompoundDomain(c);
        const domains = inf && inf.domains ? inf.domains : new Set();
        const out = new Set();
        if (usesMembrane) out.add("membrane");
        for (const pid of enabled) {
          if (pid === "membrane") continue;
          const meta = packMetaById.get(pid);
          const decl = meta && Array.isArray(meta.domains) ? meta.domains : [];
          if (decl.some((d) => domains.has(d))) out.add(pid);
        }
        return out;
      }

      // Completion counts are computed against the *global* index (phase-agnostic) so Phase0/Phase1 indices
      // don't accidentally look "incomplete" merely because they scope their own example sets.
      let globalIdx = null;
      try {
        const gAbs = path.resolve(process.cwd(), "periodic/v1/periodic.index.v1.json");
        if (fs.existsSync(gAbs)) globalIdx = readJson(gAbs);
      } catch {
        globalIdx = null;
      }
      const globalExamples = (globalIdx && Array.isArray(globalIdx.examples)) ? globalIdx.examples : (idx.examples || []);
      const globalNegPath = (globalIdx && globalIdx.negative_examples && globalIdx.negative_examples.path) ? globalIdx.negative_examples.path : negPath;
      const globalNegCases = loadNegativeExamples(globalNegPath, strict, errors, warnings);

      for (const p of globalExamples) {
        const c = readCompound(p, errors);
        if (!c) continue;
        const apps = applicablePacksForCompound(c);
        for (const pid of apps) bump(posCount, pid);
      }

      for (const nc of globalNegCases) {
        const c = readCompound(nc.path, errors);
        if (!c) continue;
        const apps = applicablePacksForCompound(c);
        for (const pid of apps) bump(negCount, pid);
      }

      for (const pid of enabled) {
        if (!completion || !completion.has(pid)) {
          errors.push(`domain_completion.missing_entry: enabled pack '${pid}' has no completion entry (${DOMAIN_COMPLETION_PATH})`);
          continue;
        }
        const req = completion.get(pid);
        if (!req || req.status !== "complete") continue;
        const rules = packRulesById.get(pid) || [];
        if (rules.length === 0) errors.push(`domain_completion.missing_rules: enabled pack '${pid}' has 0 rules (stub physics)`);
        const gotPos = posCount.get(pid) || 0;
        const gotNeg = negCount.get(pid) || 0;
        if (gotPos < req.min_positive_examples) {
          errors.push(`domain_completion.insufficient_positive: pack '${pid}' has ${gotPos} positive examples (min ${req.min_positive_examples})`);
        }
        if (gotNeg < req.min_negative_examples) {
          errors.push(`domain_completion.insufficient_negative: pack '${pid}' has ${gotNeg} negative examples (min ${req.min_negative_examples})`);
        }
      }
    }
    for (const nc of negCases) {
      const localErrors = [];
      const localWarnings = [];
      const c = readCompound(nc.path, localErrors);
      if (!c) {
        errors.push(`negative_examples.case.${nc.id}: missing compound file (${nc.path})`);
        continue;
      }
      evaluateCompound(c, localErrors, localWarnings, waived);
      const gotErrIds = extractRuleIds(localErrors);
      const gotWarnIds = extractRuleIds(localWarnings);
      const expErr = Array.isArray(nc.expect_errors) ? nc.expect_errors : [];
      const expWarn = Array.isArray(nc.expect_warnings) ? nc.expect_warnings : [];
      if (localErrors.length === 0 && localWarnings.length === 0) {
        errors.push(`negative_examples.case.${nc.id}: expected failure but compound passed`);
        continue;
      }
      for (const rid of expErr) {
        if (!gotErrIds.has(rid)) errors.push(`negative_examples.case.${nc.id}: expected error rule '${rid}' not found`);
      }
      for (const rid of expWarn) {
        if (!gotWarnIds.has(rid) && !gotErrIds.has(rid)) errors.push(`negative_examples.case.${nc.id}: expected warning rule '${rid}' not found`);
      }

      // Negative example purity: each negative example should fail for the intended rule(s) only.
      // This prevents cascades from masking root causes and makes counterexamples hostile-reader safe.
      // Enforced only in strict mode.
      if (strict) {
        const expectedSet = new Set([...(expErr || []), ...(expWarn || [])]);
        const gotAll = new Set([...(Array.from(gotErrIds || [])), ...(Array.from(gotWarnIds || []))]);
        for (const rid of gotAll) {
          if (!expectedSet.has(rid)) {
            errors.push(
              `negative_examples.case.${nc.id}: unexpected rule '${rid}' fired (expected only ${Array.from(expectedSet).join(",") || "<none>"})`
            );
          }
        }
      }
    }

    // Positive examples: validate + apply bond rules
    for (const p of idx.examples || []) {
      const c = readCompound(p, errors);
      if (!c) continue;
      evaluateCompound(c, errors, warnings, waived);
    }

    // Golden corpus: commercially-viable regression spine.
    // If this fails, we consider the product "not shippable" even if other examples pass.
    const gcPath = idx.golden_corpus?.path;
    const gcDoc = loadGoldenCorpus(gcPath, strict, errors, warnings);
    if (gcDoc && Array.isArray(gcDoc.corpora)) {
      const isPhase2 = (ACTIVE_PROFILE === "phase2");
      for (const corpus of gcDoc.corpora) {
        if (!corpus || !Array.isArray(corpus.examples)) continue;
        const id = String(corpus.id || "");
        // Profile scoping: Phase 2 enforces the *_phase2 corpus (proof receipts required).
        // Other profiles enforce the baseline commercial corpus.
        if (isPhase2) {
          if (!id.includes("phase2")) continue;
        } else {
          if (id.includes("phase2")) continue;
        }
        for (const p of corpus.examples) {
          if (typeof p !== "string" || !p.trim()) {
            errors.push(`golden_corpus.${corpus.id}: invalid example path`);
            continue;
          }
          const localErrors = [];
          const localWarnings = [];
          const c = readCompound(p, localErrors);
          if (!c) {
            errors.push(`golden_corpus.${corpus.id}: missing compound file (${p})`);
            continue;
          }
          evaluateCompound(c, localErrors, localWarnings, waived);
          if (localErrors.length) {
            errors.push(`golden_corpus.${corpus.id}: example failed (${p})`);
            for (const m of localErrors) errors.push(String(m));
          }
          // warnings are not allowed in strict mode anyway, but we bubble them for context.
          for (const m of localWarnings) warnings.push(String(m));
        }
      }
    }

    // System-of-compounds examples: validate cross-domain composition through membrane boundaries.
    const systemsDir = idx.systems?.path;
    const systemsAbs = systemsDir ? path.resolve(process.cwd(), systemsDir) : null;
    function systemRule(id, msg) { return `rule '${id}' :: ${msg}`; }

    function evaluateSystem(sysDoc, outErrors, outWarnings, outWaived) {
      const sysWaiverSet = waiverSetFor(sysDoc, AS_OF, errors, `system.${sysDoc.id || "<unknown>"}`);
      const sysWaiverMap = waiverMapFor(sysDoc, AS_OF, errors, `system.${sysDoc.id || "<unknown>"}`);
      // Map aliases to compounds
      const aliasToCompound = new Map();
      const aliasToDomain = new Map();

      const endorsementMode = SPEL_SEMANTICS?.endorsement_semantics || "identity_bearing";
      const linkGroups = new Map(); // key -> links[]

      for (const cRef of sysDoc.compounds || []) {
        const local = [];
        const c = readCompound(cRef.path, local);
        if (!c) {
          pushViolation({ kind: "system", ruleId: "system.compound.missing", severity: "error", message: `missing compound (${cRef.path}) in ${sysDoc.id}`, waivers: sysWaiverSet, waiver_map: sysWaiverMap, errors: outErrors, warnings: outWarnings, waived: outWaived });
          continue;
        }
        const compErrors = [];
        const compWarnings = [];
        evaluateCompound(c, compErrors, compWarnings, waived);
        if (compErrors.length) {
          // bubble up as system error marker; include underlying messages for context
          pushViolation({ kind: "system", ruleId: "system.compound.invalid", severity: "error", message: `compound '${c.id}' invalid in ${sysDoc.id}`, waivers: sysWaiverSet, waiver_map: sysWaiverMap, errors: outErrors, warnings: outWarnings, waived: outWaived });
          for (const m of compErrors) outErrors.push(String(m));
        }
        // warnings do not block in strict? strict already enforces 0 warnings overall
        for (const m of compWarnings) outWarnings.push(String(m));

        aliasToCompound.set(cRef.as, c);
        const inf = inferCompoundDomain(c);
        aliasToDomain.set(cRef.as, inf.inferred || "internet_app");
      }


      // Validate links use membrane caps present in both endpoints
      for (const l of sysDoc.links || []) {
        const fromC = aliasToCompound.get(l.from);
        const toC = aliasToCompound.get(l.to);
        if (!fromC || !toC) {
          pushViolation({ kind: "system", ruleId: "system.link.endpoint_missing", severity: "error", message: `link endpoints missing for ${sysDoc.id} (${l.from} -> ${l.to})`, waivers: sysWaiverSet, waiver_map: sysWaiverMap, errors: outErrors, warnings: outWarnings, waived: outWaived });
          continue;
        }
        const cap = l.via?.cap;
        if (!cap || typeof cap !== "string") {
          pushViolation({ kind: "system", ruleId: "system.link.via_missing", severity: "error", message: `link via.cap missing for ${sysDoc.id} (${l.from} -> ${l.to})`, waivers: sysWaiverSet, waiver_map: sysWaiverMap, errors: outErrors, warnings: outWarnings, waived: outWaived });
          continue;
        }
        const el = elementIndex.get(cap);
        if (!el || (el.domain !== DOMAINS.neutral)) {
          pushViolation({ kind: "system", ruleId: "system.link.via_not_membrane", severity: "error", message: `via.cap '${cap}' is not a membrane capability (${sysDoc.id})`, waivers: sysWaiverSet, waiver_map: sysWaiverMap, errors: outErrors, warnings: outWarnings, waived: outWaived });
        }

        const fromHas = Array.isArray(fromC.elements) && fromC.elements.includes(cap);
        const toHas = Array.isArray(toC.elements) && toC.elements.includes(cap);
        const key = `${l.from}::${l.to}::${cap}`;
        const arr = linkGroups.get(key) || [];
        arr.push(l);
        linkGroups.set(key, arr);
        if (!fromHas || !toHas) {
          pushViolation({ kind: "system", ruleId: "system.link.membrane_cap_missing_in_compound", severity: "error", message: `compound missing '${cap}' for ${sysDoc.id} (${l.from}:${fromHas} ${l.to}:${toHas})`, waivers: sysWaiverSet, waiver_map: sysWaiverMap, errors: outErrors, warnings: outWarnings, waived: outWaived });
        }
      }

      // Endorsement semantics: composition ambiguity guard.
      // If multiple links share the same endpoints and membrane capability, meaning depends on endorsement doctrine.
      for (const [k, links] of linkGroups.entries()) {
        if (!Array.isArray(links) || links.length <= 1) continue;
        const parts = String(k).split("::");
        const from = parts[0] || "<unknown>";
        const to = parts[1] || "<unknown>";
        const cap = parts[2] || "<unknown>";

        if (endorsementMode === "post_condition") {
          pushViolation({ kind: "system", ruleId: "system.link.ambiguous_endorsement", severity: "error", message: `ambiguous multiple links for ${sysDoc.id} (${from} -> ${to}) via '${cap}' under post_condition semantics`, waivers: sysWaiverSet, waiver_map: sysWaiverMap, errors: outErrors, warnings: outWarnings, waived: outWaived });
          continue;
        }

        // identity_bearing: require explicit endorsement_id for each link, and they must be unique.
        const ids = [];
        let missing = 0;
        for (const l of links) {
          const eid = l?.via?.endorsement_id;
          if (!eid || typeof eid !== "string" || !eid.trim()) missing++;
          else ids.push(eid.trim());
        }
        if (missing > 0) {
          pushViolation({ kind: "system", ruleId: "system.link.endorsement_id.required", severity: "error", message: `multiple links require via.endorsement_id for ${sysDoc.id} (${from} -> ${to}) via '${cap}'`, waivers: sysWaiverSet, waiver_map: sysWaiverMap, errors: outErrors, warnings: outWarnings, waived: outWaived });
          continue;
        }
        const uniq = new Set(ids);
        if (uniq.size !== ids.length) {
          pushViolation({ kind: "system", ruleId: "system.link.endorsement_id.duplicate", severity: "error", message: `duplicate via.endorsement_id for ${sysDoc.id} (${from} -> ${to}) via '${cap}'`, waivers: sysWaiverSet, waiver_map: sysWaiverMap, errors: outErrors, warnings: outWarnings, waived: outWaived });
        }
      }

      // Domain immiscibility across compounds is allowed only via membranes; we ensure compounds are individually valid.
      return;
    }

    // System negative examples: must fail with expected system rule ids.
    const sysNegPath = idx.system_negative_examples?.path;
    const sysNegCases = loadSystemNegativeExamples(sysNegPath, strict, errors, warnings);
    for (const nc of sysNegCases) {
      const localErrors = [];
      const localWarnings = [];
      const sdoc = readSystem(nc.path, localErrors);
      if (!sdoc) {
        errors.push(`system_negative_examples.case.${nc.id}: missing system file (${nc.path})`);
        continue;
      }
      evaluateSystem(sdoc, localErrors, localWarnings, waived);

      if (localErrors.length === 0 && localWarnings.length === 0) {
        errors.push(`system_negative_examples.case.${nc.id}: expected failures but got none`);
        continue;
      }

      const gotErrIds = extractRuleIds(localErrors);
      const gotWarnIds = extractRuleIds(localWarnings);
      const expErr = nc.expect_errors || [];
      const expWarn = nc.expect_warnings || [];
      for (const rid of expErr) {
        if (!gotErrIds.has(rid) && !gotWarnIds.has(rid)) errors.push(`system_negative_examples.case.${nc.id}: expected error rule '${rid}' not found`);
      }
      for (const rid of expWarn) {
        if (!gotWarnIds.has(rid) && !gotErrIds.has(rid)) errors.push(`system_negative_examples.case.${nc.id}: expected warning rule '${rid}' not found`);
      }

      // System negative example purity: prevent rule cascades in strict mode.
      if (strict) {
        const expectedSet = new Set([...(expErr || []), ...(expWarn || [])]);
        const gotAll = new Set([...(Array.from(gotErrIds || [])), ...(Array.from(gotWarnIds || []))]);
        for (const rid of gotAll) {
          if (!expectedSet.has(rid)) {
            errors.push(
              `system_negative_examples.case.${nc.id}: unexpected rule '${rid}' fired (expected only ${Array.from(expectedSet).join(",") || "<none>"})`
            );
          }
        }
      }
    }

    // System positive examples: validate all system.*.json in systems folder except system.neg_*
    if (systemsAbs && fs.existsSync(systemsAbs)) {
      const files = fs.readdirSync(systemsAbs).filter((f) => f.endsWith(".json"));
      for (const f of files) {
        const p = path.join(systemsDir, f);
        const sErrors = [];
        const sWarnings = [];
        const sdoc = readSystem(p, sErrors);
        if (!sdoc) {
          errors.push(...sErrors);
          continue;
        }
        if (String(sdoc.id).startsWith("system.neg_")) continue;
        if (TRACE_ENABLED) {
          // Hostile-reader κ: canonicalize system examples using the shared κ tool.
          // This normalizes up to graph isomorphism (deterministic node relabeling) and
          // emits an issued-identifier map digest so auditors can reproduce renames.
          try {
            const rawK = execFileSync(process.execPath, [
              "tools/spel_kappa.mjs",
              p,
              "--json",
            ], { encoding: "utf8" });
            const parsedK = JSON.parse(rawK);
            const kh = parsedK?.kappa_hash_sha256;
            const nd = parsedK?.kappa_node_map_digest_sha256;
            if (typeof kh === "string" && kh.length >= 16) {
              SYSTEM_KAPPA.push({
                system_id: String(sdoc.id),
                hash_sha256: kh,
                node_map_digest_sha256: typeof nd === "string" ? nd : null,
              });
            } else {
              // Fallback to in-process canonicalization (best-effort) if tool output is unexpected.
              const canonSys = canonicalizeSystemForKappa(sdoc);
              const canonStr = stableStringify(canonSys);
              SYSTEM_KAPPA.push({ system_id: String(sdoc.id), hash_sha256: sha256Hex(canonStr), node_map_digest_sha256: null });
            }
          } catch {
            const canonSys = canonicalizeSystemForKappa(sdoc);
            const canonStr = stableStringify(canonSys);
            SYSTEM_KAPPA.push({ system_id: String(sdoc.id), hash_sha256: sha256Hex(canonStr), node_map_digest_sha256: null });
          }

          // Hostile-reader aid: system obligation hashes (⟦System⟧) under current profile/semantics.
          // We delegate to the interpreter tool so the obligation vector stays a single source of truth.
          try {
            const raw = execFileSync(process.execPath, [
              "tools/spel_interpret.mjs",
              p,
              "--profile",
              ACTIVE_PROFILE,
              "--kind",
              "system",
              "--json",
            ], { encoding: "utf8" });
            const parsed = JSON.parse(raw);
            const oh = parsed?.obligations_hash_sha256;
            if (typeof oh === "string" && oh.length >= 16) {
              SYSTEM_OBLIGATIONS.push({ system_id: String(sdoc.id), obligations_hash_sha256: oh });
            } else {
              warnings.push(`trace: system obligations hash missing for ${String(sdoc.id)}`);
            }
          } catch (e) {
            warnings.push(`trace: failed to compute system obligations hash for ${String(sdoc.id)}: ${e?.message || e}`);
          }
        }
        evaluateSystem(sdoc, sErrors, sWarnings, waived);
        errors.push(...sErrors);
        warnings.push(...sWarnings);
      }
    } else if (strict) {
      errors.push(`systems: missing folder (${systemsDir})`);
    }
    // Strategy Registry conformance (ALPHA posture):
    // Built-in combining strategies must be canonically sealed and deterministic.
    // Unknown strategies MUST NOT exist in the registry.
    // Future "Beta" strategy artifacts are explicitly out of scope unless allowlisted by a Trust Policy.
    try {
      const regAbs = path.join(process.cwd(), 'periodic', 'v1', 'strategies', 'strategy_registry.v1.json');
      if (fs.existsSync(regAbs)) {
        const regObj = readJson(regAbs);
        const allowedAlgos = new Set(['deny_overrides', 'permit_overrides', 'first_applicable', 'only_one_applicable']);
        const list = Array.isArray(regObj?.strategies) ? regObj.strategies : [];
        const seen = new Set();

        // Minimal conformance runner: built-in strategies must behave as specified
        // on their attached counterexample fixtures. This prevents silent drift
        // in combining semantics while keeping the check deterministic + small.
        function normalizeEffect(v) {
          if (!v) return null;
          const s = String(v).trim().toLowerCase();
          if (s === 'permit' || s === 'allow') return 'PERMIT';
          if (s === 'deny') return 'DENY';
          return null;
        }

        function resolveDecision(effectsInOrder, algo) {
          const hasPermit = effectsInOrder.includes('PERMIT');
          const hasDeny = effectsInOrder.includes('DENY');
          if (!hasPermit && !hasDeny) return { decision: 'NONE' };
          if (algo === 'deny_overrides') return { decision: hasDeny ? 'DENY' : 'PERMIT' };
          if (algo === 'permit_overrides') return { decision: hasPermit ? 'PERMIT' : 'DENY' };
          if (algo === 'only_one_applicable') {
            if (hasPermit && hasDeny) return { decision: 'AMBIGUOUS' };
            return { decision: hasPermit ? 'PERMIT' : 'DENY' };
          }
          // first_applicable: deterministic order assumed (fixtures should be canonical)
          for (const e of effectsInOrder) {
            if (e === 'PERMIT') return { decision: 'PERMIT' };
            if (e === 'DENY') return { decision: 'DENY' };
          }
          return { decision: 'NONE' };
        }

        function strategyFixtureExpect(systemId, algo) {
          // For the current shipped fixtures, a conflicting PERMIT+DENY set must collapse
          // to a deterministic decision. These are the semantics we pin.
          if (String(systemId).includes('deny_overrides') && algo === 'deny_overrides') return 'DENY';
          if (String(systemId).includes('permit_overrides') && algo === 'permit_overrides') return 'PERMIT';
          if (String(systemId).includes('first_applicable') && algo === 'first_applicable') return 'PERMIT';
          if (String(systemId).includes('only_one_applicable') && algo === 'only_one_applicable') return 'AMBIGUOUS';
          return null;
        }

        for (const s of list) {
          const sid = typeof s?.strategy_id === 'string' ? s.strategy_id.trim() : '';
          if (!sid) {
            errors.push('strategy_registry: missing strategy_id');
            continue;
          }
          if (seen.has(sid)) errors.push(`strategy_registry: duplicate strategy_id ${sid}`);
          seen.add(sid);
          if (typeof s?.doc_id !== 'string' || !s.doc_id.trim()) {
            errors.push(`strategy_registry: strategy_id=${sid} missing doc_id`);
          }
          const algo = typeof s?.combining?.algorithm === 'string' ? s.combining.algorithm.trim() : '';
          if (!algo || !allowedAlgos.has(algo)) {
            errors.push(`strategy_registry: strategy_id=${sid} bad combining.algorithm '${algo}'`);
          }
          const declared = typeof s?.canonical_semantics_hash_sha256 === 'string' ? s.canonical_semantics_hash_sha256.trim() : '';
          const payload = {
            strategy_id: sid,
            kind: typeof s?.kind === 'string' ? s.kind.trim() : null,
            name: typeof s?.name === 'string' ? s.name.trim() : null,
            combining: { algorithm: algo || null },
          };
          const computed = sha256Hex(stableStringify(payload));
          if (!declared) {
            errors.push(`strategy_registry: strategy_id=${sid} missing canonical_semantics_hash_sha256`);
          } else if (declared !== computed) {
            errors.push(`strategy_registry: strategy_id=${sid} canonical_semantics_hash_sha256 mismatch`);
          }

          // Conformance fixtures (if present): ensure the algorithm produces the expected
          // decision on the minimal attached counterexample systems.
          try {
            const fixtures = Array.isArray(s?.tests?.counterexample_systems) ? s.tests.counterexample_systems : [];
            for (const rel of fixtures) {
              if (typeof rel !== 'string' || !rel.trim()) continue;
              const absSys = path.join(process.cwd(), rel);
              if (!fs.existsSync(absSys)) {
                errors.push(`strategy_registry: strategy_id=${sid} missing fixture ${rel}`);
                continue;
              }
              const sys = readJson(absSys);
              // For conformance, preserve a deterministic evaluation order for
              // first_applicable. We order by link.id (lexicographic) when present.
              // NOTE: This is *not* the same as sorting by effect value.
              const linksRaw = Array.isArray(sys?.links) ? sys.links : [];
              const links = linksRaw
                .slice()
                .sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
              const effects = links
                .map((l) => normalizeEffect(l?.via?.declassification_effect))
                .filter(Boolean);
              const wantDecision = strategyFixtureExpect(sys?.id || rel, algo);
              if (wantDecision) {
                const got = resolveDecision(effects, algo).decision;
                if (got !== wantDecision) {
                  errors.push(`strategy_registry: strategy_id=${sid} fixture ${rel} expected ${wantDecision} got ${got}`);
                }
              }
            }
          } catch (e) {
            errors.push(`strategy_registry: strategy_id=${sid} fixture eval failed: ${String(e?.message || e)}`);
          }
        }
      } else if (strict) {
        errors.push('strategy_registry: missing periodic/v1/strategies/strategy_registry.v1.json');
      }
    } catch (e) {
      errors.push(`strategy_registry: conformance check failed: ${String(e?.message || e)}`);
    }

    const ok = errors.length === 0 && (!strict || warnings.length === 0);

  const report = {
    ok,
    input: idxArg,
    profile: ACTIVE_PROFILE,
    spel_semantics: SPEL_SEMANTICS,
    errors,
    warnings,
    waived,
  };

  // Hostile-reader aid: profile contract must be hashable/reproducible.
  // This pins the build context identity (selected profile + enabled packs + severity overrides).
  try {
    const profileContract = {
      profile: ACTIVE_PROFILE,
      enabled_packs: (ACTIVE_PACKS || []).slice().sort(),
      severity_overrides: PROFILE_OVERRIDES || {},
    };
    const pcCanon = stableStringify(profileContract);
    report.profile_contract_hash_sha256 = sha256Hex(pcCanon);
  } catch {
    // leave unset
  }

  // Hostile-reader aid: semantics config must be hashable/reproducible.
  // This becomes part of the unified receipt hash in --trace mode.
  try {
    const semCanon = stableStringify(SPEL_SEMANTICS);
    report.spel_semantics_hash_sha256 = sha256Hex(semCanon);
  } catch {
    // leave unset; strict enforcement happens in trace mode receipt generation
  }

  // Hostile-reader aid: strategy registry must be hashable/reproducible.
  // This is the policy allowlist for "pluggable" semantics (Beta with Alpha core).
  try {
    const regAbs = path.join(process.cwd(), 'periodic', 'v1', 'strategies', 'strategy_registry.v1.json');
    if (fs.existsSync(regAbs)) {
      const regObj = readJson(regAbs);
      const regCanon = stableStringify(regObj) + "\n";
      report.strategy_registry_hash_sha256 = sha256Hex(regCanon);
    }
  } catch {
    // leave unset
  }

  if (TRACE_ENABLED) {
    const trace = canonicalizeTrace(TRACE);
    const traceCanon = stableStringify(trace);
    // In hash-only trace mode, do not emit the full trace payload (it can be very large).
    if (!TRACE_HASH_ONLY) report.trace = trace;
    report.trace_hash_sha256 = sha256Hex(traceCanon);
    if (SYSTEM_KAPPA && SYSTEM_KAPPA.length) {
      // Hostile-reader aid: kappa hashes for positive system examples (ordering-insensitive arrays canonicalized).
      report.system_kappa_hashes = SYSTEM_KAPPA.slice().sort((a,b)=>String(a.system_id).localeCompare(String(b.system_id)));
    }
    if (SYSTEM_OBLIGATIONS && SYSTEM_OBLIGATIONS.length) {
      // Hostile-reader aid: ⟦System⟧ obligation vector hashes for positive system examples.
      report.system_obligations_hashes = SYSTEM_OBLIGATIONS.slice().sort((a,b)=>String(a.system_id).localeCompare(String(b.system_id)));
    }

    // Optional: input attestations (VSA-style) identifying the attestations/configs used to perform verification.
    // Minimal, deterministic, hostile-reader safe: index + policy contract + semantics.
    // Digests are computed over canonical JSON (stableStringify) so they are reproducible.
    const inputAttestations = [];
    // κ(index) commitment for receipts: we intentionally exclude volatile, path-heavy
    // example wiring so equivalence isn't broken by harmless relocation of example files.
    // The receipt remains bound to policy+semantics+trace; this κ is a config identity.
    try {
      if (res && res.index) {
        const idxView = JSON.parse(JSON.stringify(res.index));
        // Volatile wiring: these commonly contain file paths which may be rewritten by harnesses.
        // Excluding them keeps receipt identity stable under harmless example relocation.
        delete idxView.examples;
        delete idxView.negative_examples;
        delete idxView.system_negative_examples;
        delete idxView.systems;

        const idxCanon = stableStringify(idxView) + "\n";
        report.kappa_index_hash_sha256 = sha256Hex(idxCanon);
        inputAttestations.push({
          uri: `spel://periodic/index/profile/${ACTIVE_PROFILE}`,
          digest: { sha256: report.kappa_index_hash_sha256 },
        });
      }
    } catch {}

    // Hostile-reader aid: bind the κ identity for system examples as a single digest.
    // This commits the receipt to the canonical forms, not just downstream constraints.
    try {
      if (report.system_kappa_hashes) {
        report.kappa_system_examples_hash_sha256 = sha256Hex(stableStringify(report.system_kappa_hashes) + "\n");
      }
    } catch {}
    try {
      if (report.profile_contract_hash_sha256) {
        inputAttestations.push({
          uri: `spel://policy/profile_contract/${ACTIVE_PROFILE}`,
          digest: { sha256: report.profile_contract_hash_sha256 },
        });
      }
    } catch {}
    try {
      if (report.spel_semantics_hash_sha256) {
        inputAttestations.push({
          uri: "spel://config/spel_semantics.v1",
          digest: { sha256: report.spel_semantics_hash_sha256 },
        });
      }
    } catch {}

    // Unified receipt hash: binds trace + κ + ⟦·⟧ + semantics into one proof capsule.
    // Also includes a VSA-style verifier identity so hostile readers can see *who* asserted the result.
    // See SLSA VSA `verifier.id` + optional `verifier.version` fields.
    let verifier_keyid = null;
    // If DSSE signing key is provided, bind the verifier key identity into the receipt.
    // This prevents signing with a different key while claiming the same verifier.id.
    if (typeof receiptDsseKeyPath === "string" && receiptDsseKeyPath.trim().length && !String(receiptDsseKeyPath).startsWith("--")) {
      try {
        const absK = path.resolve(process.cwd(), receiptDsseKeyPath);
        if (fs.existsSync(absK)) {
          const privPemK = fs.readFileSync(absK, "utf8");
          const privKeyK = crypto.createPrivateKey(privPemK);
          const pubKeyK = crypto.createPublicKey(privKeyK);
          const computed = computeKeyIdFromPublicKey(pubKeyK);
          if (receiptDsseKeyId && !String(receiptDsseKeyId).startsWith("--")) {
            const want = String(receiptDsseKeyId);
            if (want !== computed) {
              throw new Error(`--receipt-dsse-keyid mismatch (expected ${computed}, got ${want})`);
            }
            verifier_keyid = want;
          } else {
            verifier_keyid = computed;
          }
        }
      } catch {
        verifier_keyid = null;
      }
    }

    // Receipt target κ commitments: bind the specific verified target object (index/compound/system)
    // so hostile readers can reason about equivalence at the boundary: E1 ≡ E2 iff κ(E1)=κ(E2).
    const target_kind = "index";
    const target_path = `spel://periodic/index/profile/${ACTIVE_PROFILE}`;
    const target_path_abs = null;

    const explain_trace_v2 = toExplainTraceV2(report.trace || []);
    const policyBindingForTrace = {
      uri: `spel://policy/profile/${ACTIVE_PROFILE}`,
      digest: { sha256: report.profile_contract_hash_sha256 || null },
      semantics_digest: { sha256: report.spel_semantics_hash_sha256 || null },
      strategy_registry_digest: { sha256: report.strategy_registry_hash_sha256 || null },
    };
    const explain_trace_v3 = toExplainTraceV3(report.trace || [], policyBindingForTrace);
    const explain_trace_v6 = toExplainTraceV6(report.trace || [], policyBindingForTrace);
    const explain_trace_v61 = toExplainTraceV61(report.trace || [], policyBindingForTrace);
    const explain_trace_v62 = toExplainTraceV62(report.trace || [], policyBindingForTrace, {
      target_ref: { kind: 'spel_target', uri: target_path, digest_sha256: report.kappa_index_hash_sha256 || null },
    });

    // Safety envelope: compact posture bindings (semantics + domain tie-breaks)
    const safety_envelope = buildSafetyEnvelopeV1(ACTIVE_PROFILE, SPEL_SEMANTICS, (DOMAINS && DOMAINS.doc) ? DOMAINS.doc : null);


    const receipt = {
      verifier: {
        id: "spel://verifier/kindred.periodic_contracts_check",
        version: {
          "kindred-ai-builders": "1.1.1",
        },
        keyid: verifier_keyid || null,
      },
      // Policy identity (VSA-style): what policy was applied and the exact digest of that policy contract.
      policy: {
        uri: `spel://policy/profile/${ACTIVE_PROFILE}` ,
        digest: { sha256: report.profile_contract_hash_sha256 || null },
        semantics_digest: { sha256: report.spel_semantics_hash_sha256 || null },
      },
      // Optional VSA-style list of inputs used for verification.
      // MUST include digest; uri is best-effort and may be "spel://" internal.
      input_attestations: inputAttestations,
      // Target κ commitments (receipt boundary): the specific target object verified by this run.
      target_kind,
      target_path,
      target_path_abs,
      target_kappa_hash_sha256: report.kappa_index_hash_sha256 || null,
      target_kappa_node_map_digest_sha256: null,
      profile: ACTIVE_PROFILE,
      trace_level: 'full',
      profile_contract_hash_sha256: report.profile_contract_hash_sha256 || null,
      spel_semantics_hash_sha256: report.spel_semantics_hash_sha256 || null,
      strategy_registry_hash_sha256: report.strategy_registry_hash_sha256 || null,
      safety_envelope: safety_envelope || null,
      safety_envelope_hash_sha256: null,
      trace_hash_sha256: report.trace_hash_sha256 || null,
      // Explainability trace: machine-readable chain for each violation (hostile-reader aid).
      // For strict-pass runs this is typically empty, but stays deterministic.
      explain_trace: report.trace || [],
      explain_trace_hash_sha256: report.trace_hash_sha256 || null,
      explain_trace_v2: explain_trace_v2 || [],
      explain_trace_v2_hash_sha256: null,
      explain_trace_v3: explain_trace_v3 || [],
      explain_trace_v3_hash_sha256: null,
      explain_trace_v6: explain_trace_v6 || [],
      explain_trace_v6_hash_sha256: null,
      explain_trace_v61: explain_trace_v61 || [],
      explain_trace_v62: explain_trace_v62 || [],
      explain_trace_v61_hash_sha256: null,
      explain_trace_v62_hash_sha256: null,
      // Hash-first justification objects referenced by explain_trace_v6.1
      explain_justifications_v1: null,
      explain_justifications_v1_hash_sha256: null,
      // Proof Graph v1: receipt-bound deterministic proof DAG derived from explain_trace_v6.
      // This turns "verification logs" into an auditable graph of satisfaction.
      proof_graph: null,
      proof_graph_hash_sha256: null,
      kappa_index_hash_sha256: report.kappa_index_hash_sha256 || null,
      kappa_system_examples_hash_sha256: report.kappa_system_examples_hash_sha256 || null,
      system_kappa_hashes: report.system_kappa_hashes || [],
      system_obligations_hashes: report.system_obligations_hashes || [],
    };

    // Bind explain_trace_v2 hash after receipt assembly (prevents mismatch due to mutation/order drift).
    receipt.explain_trace_v2_hash_sha256 = hashExplainTraceV2(receipt.explain_trace_v2 || []);
    receipt.explain_trace_v3_hash_sha256 = hashExplainTraceV3(receipt.explain_trace_v3 || []);
    receipt.explain_trace_v6_hash_sha256 = hashExplainTraceV6(receipt.explain_trace_v6 || []);
    receipt.explain_trace_v61_hash_sha256 = hashExplainTraceV61(receipt.explain_trace_v61 || []);
    receipt.explain_trace_v62_hash_sha256 = hashExplainTraceV62(receipt.explain_trace_v62 || []);

    // Build + bind justification object store (hash-first, compressible).
    try {
      receipt.explain_justifications_v1 = buildExplainJustificationsV1(receipt.explain_trace_v61 || []);
      receipt.explain_justifications_v1_hash_sha256 = hashExplainJustificationsV1(receipt.explain_justifications_v1);
    } catch {
      receipt.explain_justifications_v1 = null;
      receipt.explain_justifications_v1_hash_sha256 = null;
    }
  // Bind safety envelope hash (portable posture binding).
    if (receipt.safety_envelope) {
      receipt.safety_envelope_hash_sha256 = hashSafetyEnvelopeV1(receipt.safety_envelope);
    }

  // Bind proof graph (derived from explain_trace_v6.1) deterministically.
    try {
      const { graph, graph_hash_sha256 } = buildProofGraphV1FromReceipt(receipt, {
        profile: String(receipt.profile || ''),
        policy_uri: String(receipt?.policy?.uri || ''),
        explain_trace_v61_hash_sha256: String(receipt.explain_trace_v61_hash_sha256 || ''),
        explain_trace_v62_hash_sha256: String(receipt.explain_trace_v62_hash_sha256 || ''),
      });
      receipt.proof_graph = graph;
      receipt.proof_graph_hash_sha256 = graph_hash_sha256;
    } catch {
      // If this fails, the receipt is still exportable, but proof receipts will not be graph-auditable.
      // This should not fail under normal circumstances.
      receipt.proof_graph = null;
      receipt.proof_graph_hash_sha256 = null;
    }

    // Receipt bytes are canonical JSON + trailing newline (matches file export + DSSE payload).
    const receiptCanonBytes = Buffer.from(stableStringify(receipt) + "\n", "utf8");
    report.receipt = receipt;
    report.receipt_hash_sha256 = sha256Hex(receiptCanonBytes);

    // Optional: export proof receipt capsule (portable proof object).
    // Uses canonical JSON (stableStringify) so comparisons are byte-for-byte stable.
    if (typeof receiptOutPath === "string" && receiptOutPath.trim().length) {
      try {
        const absReceipt = path.resolve(process.cwd(), receiptOutPath);
        fs.mkdirSync(path.dirname(absReceipt), { recursive: true });
        fs.writeFileSync(absReceipt, stableStringify(receipt) + "\n", "utf8");
        report.receipt_out_path = absReceipt;
      } catch (e) {
        report.receipt_out_error = String(e && e.message ? e.message : e);
      }
    }

    // Optional: export DSSE envelope (signed) for the receipt capsule.
    // This is an interoperability surface for Proof Lane / Operator flows.
    // The envelope signs the raw receipt bytes using DSSE PAE.
    if (typeof receiptDsseOutPath === "string" && receiptDsseOutPath.trim().length) {
      try {
        if (!receiptDsseKeyPath || String(receiptDsseKeyPath).startsWith("--")) {
          throw new Error("Missing --receipt-dsse-key <private-key-pem>");
        }

        const absKey = path.resolve(process.cwd(), receiptDsseKeyPath);
        if (!fs.existsSync(absKey)) throw new Error(`Not found: ${receiptDsseKeyPath}`);

        // Receipt bytes are canonical JSON.
        const receiptBytes = Buffer.from(stableStringify(receipt) + "\n", "utf8");
        const payloadType = String(receiptDssePayloadType || "application/vnd.kindred.spel.receipt+json");

        // DSSE PAE (Pre-Auth-Encoding)
        // PAE(payloadType, payload) = "DSSEv1 " + len(payloadType) + " " + payloadType + " " + len(payload) + " " + payload
        function dssePAE(pt, payloadBuf) {
          const ptBytes = Buffer.from(String(pt), "utf8");
          const pre = Buffer.from("DSSEv1 ", "utf8");
          const a = Buffer.from(String(ptBytes.length), "utf8");
          const sp = Buffer.from(" ", "utf8");
          const c = Buffer.from(String(payloadBuf.length), "utf8");
          return Buffer.concat([pre, a, sp, ptBytes, sp, c, sp, payloadBuf]);
        }

        const privPem = fs.readFileSync(absKey, "utf8");
        const privKey = crypto.createPrivateKey(privPem);
        const pubKey = crypto.createPublicKey(privKey);
        const pubPem = pubKey.export({ type: "spki", format: "pem" }).toString();
        const computedKeyId = computeKeyIdFromPublicKey(pubKey);
        const keyidFromReceipt = receipt && receipt.verifier ? receipt.verifier.keyid : null;
        if (keyidFromReceipt && keyidFromReceipt !== computedKeyId) {
          throw new Error(`verifier.keyid mismatch (receipt has ${keyidFromReceipt}, signing key computes ${computedKeyId})`);
        }
        const keyid = (receiptDsseKeyId && !String(receiptDsseKeyId).startsWith("--"))
          ? String(receiptDsseKeyId)
          : (keyidFromReceipt || computedKeyId);

        const pae = dssePAE(payloadType, receiptBytes);
        const sigBuf = crypto.sign(null, pae, privKey);

        const envelope = {
          payloadType,
          payload: receiptBytes.toString("base64"),
          signatures: [
            {
              keyid,
              sig: sigBuf.toString("base64"),
            },
          ],
        };

        // Optional: self-verify DSSE envelope for immediate proof-lane confidence.
        // If --receipt-dsse-verify is set, verify signature using provided public key (or derived).
        if (receiptDsseVerify) {
          try {
            let pubPemToUse = pubPem;
            if (receiptDssePubPath && !String(receiptDssePubPath).startsWith("--")) {
              const absPub = path.resolve(process.cwd(), receiptDssePubPath);
              if (!fs.existsSync(absPub)) throw new Error(`Not found: ${receiptDssePubPath}`);
              pubPemToUse = fs.readFileSync(absPub, "utf8");
            }
            const pubKeyVerify = crypto.createPublicKey(pubPemToUse);
            const okVerify = crypto.verify(null, pae, pubKeyVerify, Buffer.from(envelope.signatures[0].sig, "base64"));
            if (!okVerify) throw new Error("DSSE verification failed");
            report.receipt_dsse_verified = true;
          } catch (ve) {
            report.receipt_dsse_verified = false;
            report.receipt_dsse_verify_error = String(ve && ve.message ? ve.message : ve);
            // In strict mode, treat a requested self-verify failure as fatal.
            if (strict) {
              errors.push({
                kind: "error",
                where: "receipt.dsse.verify",
                message: report.receipt_dsse_verify_error,
              });
            }
          }
        }

        const absDsse = path.resolve(process.cwd(), receiptDsseOutPath);
        fs.mkdirSync(path.dirname(absDsse), { recursive: true });
        fs.writeFileSync(absDsse, stableStringify(envelope) + "\n", "utf8");
        report.receipt_dsse_out_path = absDsse;
        report.receipt_dsse_keyid = keyid;

        // Optional: export a single-file proof bundle (receipt + dsse envelope + public key).
        if (typeof receiptBundleOutPath === "string" && receiptBundleOutPath.trim().length) {
          try {
            const bundle = {
              schema: "spel.proof_bundle_dsse.v1",
              profile: receipt.profile,
              receipt_hash_sha256: report.receipt_hash_sha256 || null,
              spel_semantics_hash_sha256: report.spel_semantics_hash_sha256 || null,
      safety_envelope: safety_envelope || null,
      safety_envelope_hash_sha256: null,
              profile_contract_hash_sha256: report.profile_contract_hash_sha256 || null,
              receipt,
              dsse_envelope: envelope,
              public_key_pem: pubPem,
            };
            const absBundle = path.resolve(process.cwd(), receiptBundleOutPath);
            fs.mkdirSync(path.dirname(absBundle), { recursive: true });
            const bundleCanon = stableStringify(bundle) + "\n";
            fs.writeFileSync(absBundle, bundleCanon, "utf8");
            report.receipt_bundle_out_path = absBundle;
            report.receipt_bundle_hash_sha256 = sha256Hex(Buffer.from(bundleCanon, "utf8"));
          } catch (be) {
            report.receipt_bundle_out_error = String(be && be.message ? be.message : be);
          }
        }

      } catch (e) {
        report.receipt_dsse_out_error = String(e && e.message ? e.message : e);
      }
    }
  }

  if (reportPath) {
    const abs = path.resolve(process.cwd(), reportPath);
    writeReportMd(report, abs);
  }

  // Optional: emit full JSON report to a file (preferred for CI).
  if (outJsonPath && typeof outJsonPath === "string" && outJsonPath.trim().length) {
    const absOut = path.resolve(process.cwd(), outJsonPath);
    fs.mkdirSync(path.dirname(absOut), { recursive: true });
    fs.writeFileSync(absOut, JSON.stringify(report, null, 2) + "\n", "utf8");
  }

  // Default: do NOT spam stdout in CI.
  // Only print full JSON if explicitly requested.
  if (stdoutJson) {
    // IMPORTANT:
    // When this checker is executed under tools that capture stdout (spawnSync),
    // calling process.exit immediately after an async stdout write can truncate the JSON.
    // We therefore write synchronously to fd=1 (stdout) and set exitCode instead.
    const outJson = JSON.stringify(report, null, 2) + "\n";
    try {
      fs.writeFileSync(1, outJson);
    } catch {
      process.stdout.write(outJson);
    }
  } else if (!quiet) {
    const errCount = Array.isArray(report.errors) ? report.errors.length : 0;
    const warnCount = Array.isArray(report.warnings) ? report.warnings.length : 0;
    process.stdout.write(`[periodic_contracts_check] ${ok ? "PASS" : "FAIL"} errors=${errCount} warnings=${warnCount}\n`);
  }

  process.exitCode = ok ? 0 : 2;
}

}
main();
