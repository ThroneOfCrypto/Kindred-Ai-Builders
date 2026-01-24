"use client";

import { ProjectState, PaletteId, CopyBlock, LaunchPathId } from "./types";
import { deletePackGovernance, duplicatePackGovernance } from "./pack_governance";
import { applyDerivedTemplates, deriveBriefFromIntent } from "./templates";
import { defaultIntentIntake, legacyBriefToNotes, normalizeIntentIntake } from "./intake";
import { getLaunchPathById } from "./launch_paths";
import { defaultCapabilityVector, normalizeCapabilityVector } from "./capability_vector";

// ---------------------------------------------------------------------------
// Project workspace v1 (offline, multi-project)
// ---------------------------------------------------------------------------

const LEGACY_SINGLE_STATE_KEY = "kindred_ai_builders_state_v1";

const PROJECT_INDEX_KEY = "kindred_ai_builders_projects_index_v1";
const CURRENT_PROJECT_KEY = "kindred_ai_builders_current_project_id_v1";
const PROJECT_STATE_PREFIX = "kindred_ai_builders_project_state_v1:";

// These keys existed before multi-project; we keep them as legacy fallbacks.
export const LEGACY_LAST_BASE_PACK_KEY = "kindred_last_spec_pack_b64_v1";
export const LEGACY_LAST_PROPOSAL_PACK_KEY = "kindred_last_proposal_pack_b64_v1";

export type ProjectIndexEntry = {
  id: string;
  name: string;
  created_at_utc: string;
  updated_at_utc: string;
  archived_at_utc?: string;
};

type ProjectIndexV1 = {
  schema: "kindred.project_index.v1";
  projects: ProjectIndexEntry[];
};

function utcNow() {
  return new Date().toISOString();
}

function safeId(prefix: string) {
  const raw = Math.random().toString(16).slice(2);
  return `${prefix}_${raw}`;
}

export function lastBasePackKeyForProject(projectId: string): string {
  return `${LEGACY_LAST_BASE_PACK_KEY}:${projectId}`;
}

export function lastProposalPackKeyForProject(projectId: string): string {
  return `${LEGACY_LAST_PROPOSAL_PACK_KEY}:${projectId}`;
}

function projectStateKey(projectId: string): string {
  return `${PROJECT_STATE_PREFIX}${projectId}`;
}

function dispatch(name: string) {
  try {
    window.dispatchEvent(new CustomEvent(name));
  } catch {
    // ignore
  }
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function normalizeIndex(raw: any): ProjectIndexV1 | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.schema !== "kindred.project_index.v1") return null;
  if (!Array.isArray(raw.projects)) return null;

  const projects: ProjectIndexEntry[] = [];
  for (const p of raw.projects) {
    if (!p || typeof p !== "object") continue;
    const id = typeof p.id === "string" ? p.id : "";
    if (!id) continue;
    const name = typeof p.name === "string" ? p.name : "Untitled Project";
    const created_at_utc = typeof p.created_at_utc === "string" ? p.created_at_utc : utcNow();
    const updated_at_utc = typeof p.updated_at_utc === "string" ? p.updated_at_utc : created_at_utc;
    const archived_at_utc = typeof p.archived_at_utc === "string" ? p.archived_at_utc : undefined;
    projects.push({ id, name, created_at_utc, updated_at_utc, archived_at_utc });
  }

  if (projects.length === 0) return null;
  return { schema: "kindred.project_index.v1", projects };
}

function loadIndex(): ProjectIndexV1 | null {
  try {
    const raw = localStorage.getItem(PROJECT_INDEX_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse<any>(raw);
    return normalizeIndex(parsed);
  } catch {
    return null;
  }
}

function saveIndex(idx: ProjectIndexV1) {
  try {
    localStorage.setItem(PROJECT_INDEX_KEY, JSON.stringify(idx));
  } catch {
    // ignore
  }
  dispatch("kindred_projects_changed");
}

function pickFirstActive(idx: ProjectIndexV1): string {
  const active = idx.projects.find((p) => !p.archived_at_utc);
  return (active ? active.id : "") || "";
}

function ensureInitialized(): ProjectIndexV1 {
  const existing = loadIndex();
  if (existing) {
    try {
      const cur = localStorage.getItem(CURRENT_PROJECT_KEY) || "";
      const has = existing.projects.some((p) => p.id === cur && !p.archived_at_utc);
      if (!has) {
        const next = pickFirstActive(existing);
        if (next) localStorage.setItem(CURRENT_PROJECT_KEY, next);
      }
    } catch {
      // ignore
    }
    return existing;
  }

  // Migration: single-project state (v0.21 and earlier) → project workspace v1
  try {
    const legacyRaw = localStorage.getItem(LEGACY_SINGLE_STATE_KEY);
    if (legacyRaw) {
      const parsed = safeJsonParse<any>(legacyRaw);
      const normalized = normalizeState(parsed);

      const projectId = (normalized.project?.id || "").trim() || safeId("p");
      const created = (normalized.project?.created_at_utc || "").trim() || utcNow();
      const name = (normalized.project?.name || "").trim() || "Untitled Project";

      const migrated: ProjectState = {
        ...normalized,
        project: {
          ...normalized.project,
          id: projectId,
          name,
          created_at_utc: created,
        },
      };

      try {
        localStorage.setItem(projectStateKey(projectId), JSON.stringify(migrated));
      } catch {
        // ignore
      }

      const idx: ProjectIndexV1 = {
        schema: "kindred.project_index.v1",
        projects: [
          {
            id: projectId,
            name,
            created_at_utc: created,
            updated_at_utc: utcNow(),
          },
        ],
      };

      saveIndex(idx);
      try {
        localStorage.setItem(CURRENT_PROJECT_KEY, projectId);
      } catch {
        // ignore
      }

      // Pack cache migration (optional): keep legacy keys as fallbacks.
      try {
        const legacyBase = localStorage.getItem(LEGACY_LAST_BASE_PACK_KEY);
        if (legacyBase && !localStorage.getItem(lastBasePackKeyForProject(projectId))) {
          localStorage.setItem(lastBasePackKeyForProject(projectId), legacyBase);
        }
      } catch {
        // ignore
      }
      try {
        const legacyProp = localStorage.getItem(LEGACY_LAST_PROPOSAL_PACK_KEY);
        if (legacyProp && !localStorage.getItem(lastProposalPackKeyForProject(projectId))) {
          localStorage.setItem(lastProposalPackKeyForProject(projectId), legacyProp);
        }
      } catch {
        // ignore
      }

      dispatch("kindred_project_changed");
      dispatch("kindred_state_changed");
      return idx;
    }
  } catch {
    // ignore
  }

  // Fresh install: create default project
  const st = defaultState();
  const projectId = st.project.id;
  const name = st.project.name;
  const created = st.project.created_at_utc;

  try {
    localStorage.setItem(projectStateKey(projectId), JSON.stringify(st));
  } catch {
    // ignore
  }

  const idx: ProjectIndexV1 = {
    schema: "kindred.project_index.v1",
    projects: [
      {
        id: projectId,
        name,
        created_at_utc: created,
        updated_at_utc: utcNow(),
      },
    ],
  };

  saveIndex(idx);
  try {
    localStorage.setItem(CURRENT_PROJECT_KEY, projectId);
  } catch {
    // ignore
  }

  dispatch("kindred_project_changed");
  dispatch("kindred_state_changed");

  return idx;
}

export function listProjects(opts?: { includeArchived?: boolean }): ProjectIndexEntry[] {
  const includeArchived = Boolean(opts?.includeArchived);
  const idx = ensureInitialized();
  const projects = includeArchived ? idx.projects : idx.projects.filter((p) => !p.archived_at_utc);
  const sorted = [...projects].sort((a, b) => b.updated_at_utc.localeCompare(a.updated_at_utc));
  return sorted;
}

export function getCurrentProjectId(): string {
  const idx = ensureInitialized();
  try {
    const cur = (localStorage.getItem(CURRENT_PROJECT_KEY) || "").trim();
    if (cur && idx.projects.some((p) => p.id === cur && !p.archived_at_utc)) return cur;
  } catch {
    // ignore
  }

  const next = pickFirstActive(idx);
  if (next) {
    try {
      localStorage.setItem(CURRENT_PROJECT_KEY, next);
    } catch {
      // ignore
    }
    return next;
  }

  // If all existing projects are archived, auto-create a new empty project so the app stays usable.
  const created = createProject("Untitled Project");
  return created.id;
}

export function setCurrentProjectId(projectId: string) {
  const idx = ensureInitialized();
  const ok = idx.projects.some((p) => p.id === projectId && !p.archived_at_utc);
  if (!ok) return;

  try {
    localStorage.setItem(CURRENT_PROJECT_KEY, projectId);
  } catch {
    // ignore
  }
  dispatch("kindred_project_changed");
  dispatch("kindred_state_changed");
}

function clampName(s: string): string {
  const x = String(s || "").trim();
  return x ? x.slice(0, 80) : "Untitled Project";
}

export function createProject(name?: string): ProjectIndexEntry {
  const st = defaultState();
  const projectId = st.project.id;
  const created = utcNow();
  const projectName = clampName(name || st.project.name || "Untitled Project");

  const seeded: ProjectState = {
    ...st,
    project: { ...st.project, id: projectId, name: projectName, created_at_utc: created },
  };

  saveProjectStateById(projectId, seeded);
  setCurrentProjectId(projectId);

  const entry = listProjects({ includeArchived: true }).find((p) => p.id === projectId);
  return (
    entry || {
      id: projectId,
      name: projectName,
      created_at_utc: created,
      updated_at_utc: created,
    }
  );
}


export function createProjectFromLaunchPath(args: { launch_path_id: LaunchPathId; name?: string }): ProjectIndexEntry {
  const lp = getLaunchPathById(args.launch_path_id);
  if (!lp) {
    // Fall back to a plain project if unknown.
    return createProject(args.name);
  }

  const entry = createProject(args.name || lp.title);
  const pid = entry.id;

  let st = loadProjectStateById(pid);

  // Seed intent from launch path, then derive brief + templates deterministically.
  st = {
    ...st,
    intent: {
      ...st.intent,
      launch_path_id: lp.id,
      build_intent: lp.intent.build_intent,
      primary_surface: lp.intent.primary_surface,
      palettes: lp.intent.palettes.slice(),
      constraints: { ...(st.intent.constraints || {}), offline_first: true },
    },
    design: {
      ...st.design,
      brand: { ...st.design.brand, name: st.design.brand.name || entry.name },
    },
  };

  st = deriveBriefFromIntent(st);
  st = applyDerivedTemplates(st);

  // Seed copy blocks from derived pages + brief (deterministic).
  try {
    const pages = Array.isArray(st.design?.ia?.pages) ? st.design.ia.pages : [];
    st = {
      ...st,
      content: {
        ...st.content,
        copy_blocks: defaultCopyBlocksForPages({
          pages: pages.map((p: any) => ({ id: String(p.id || ""), title: String(p.title || "") })),
          brand_name: st.design?.brand?.name || "",
          brief: st.intent?.brief || {},
        }),
      },
    };
  } catch {
    // ignore
  }

  saveProjectStateById(pid, st);
  dispatch("kindred_state_changed");
  return entry;
}

export function duplicateProject(sourceProjectId: string): ProjectIndexEntry | null {
  const source = listProjects({ includeArchived: true }).find((p) => p.id === sourceProjectId);
  if (!source || source.archived_at_utc) return null;

  const srcState = loadProjectStateById(sourceProjectId);
  const nextId = safeId("p");
  const created = utcNow();
  const name = clampName(`${source.name} Copy`);

  const cloned: ProjectState = JSON.parse(JSON.stringify(srcState));
  cloned.project = { ...cloned.project, id: nextId, name, created_at_utc: created };

  saveProjectStateById(nextId, cloned);

  // Also duplicate pack caches if present.
  try {
    const base = localStorage.getItem(lastBasePackKeyForProject(sourceProjectId));
    if (base) localStorage.setItem(lastBasePackKeyForProject(nextId), base);
  } catch {
    // ignore
  }
  try {
    const prop = localStorage.getItem(lastProposalPackKeyForProject(sourceProjectId));
    if (prop) localStorage.setItem(lastProposalPackKeyForProject(nextId), prop);
  } catch {
    // ignore
  }

  // Duplicate governance (truth lock state + locked snapshot) if present.
  try {
    duplicatePackGovernance(sourceProjectId, nextId);
  } catch {
    // ignore
  }

  setCurrentProjectId(nextId);

  const entry = listProjects({ includeArchived: true }).find((p) => p.id === nextId);
  return (
    entry || {
      id: nextId,
      name,
      created_at_utc: created,
      updated_at_utc: created,
    }
  );
}

export function renameProject(projectId: string, newName: string) {
  const idx = ensureInitialized();
  const entry = idx.projects.find((p) => p.id === projectId);
  if (!entry) return;
  if (entry.archived_at_utc) return;

  const name = clampName(newName);
  entry.name = name;
  entry.updated_at_utc = utcNow();
  saveIndex(idx);

  const st = loadProjectStateById(projectId);
  const next: ProjectState = { ...st, project: { ...st.project, name } };
  saveProjectStateById(projectId, next);
}

export function archiveProject(projectId: string) {
  const idx = ensureInitialized();
  const entry = idx.projects.find((p) => p.id === projectId);
  if (!entry) return;
  if (entry.archived_at_utc) return;

  entry.archived_at_utc = utcNow();
  entry.updated_at_utc = entry.archived_at_utc;
  saveIndex(idx);

  // If you archived the current project, move to another active one.
  const cur = getCurrentProjectId();
  if (cur === projectId) {
    const next = pickFirstActive(idx);
    if (next && next !== projectId) setCurrentProjectId(next);
    else createProject("Untitled Project");
  }

  dispatch("kindred_project_changed");
  dispatch("kindred_state_changed");
}

export function resetProject(projectId: string) {
  // Resets builder state and clears local pack caches + governance for the given project.
  // This is intentionally local-only and does not delete the project from the index.
  try {
    ensureInitialized();
  } catch {
    // ignore
  }

  const prev = loadProjectStateById(projectId);
  const fresh = defaultState();
  const reset: ProjectState = {
    ...fresh,
    project: {
      ...fresh.project,
      id: projectId,
      name: clampName(prev.project?.name || "Untitled Project"),
      created_at_utc: (prev.project?.created_at_utc || "").trim() || utcNow(),
    },
  };

  saveProjectStateById(projectId, reset);

  // Clear cached packs for this project.
  try {
    localStorage.removeItem(lastBasePackKeyForProject(projectId));
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(lastProposalPackKeyForProject(projectId));
  } catch {
    // ignore
  }

  // Clear legacy caches too (safety: avoid confusing fallback loads).
  try {
    localStorage.removeItem(LEGACY_LAST_BASE_PACK_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(LEGACY_LAST_PROPOSAL_PACK_KEY);
  } catch {
    // ignore
  }

  // Reset truth lock state.
  try {
    deletePackGovernance(projectId);
  } catch {
    // ignore
  }

  dispatch("kindred_state_changed");
  dispatch("kindred_project_changed");
}

export function loadProjectStateById(projectId: string): ProjectState {
  ensureInitialized();
  try {
    const raw = localStorage.getItem(projectStateKey(projectId));
    if (!raw) {
      const st = defaultState();
      const seeded: ProjectState = {
        ...st,
        project: { ...st.project, id: projectId, name: st.project.name || "Untitled Project" },
      };
      saveProjectStateById(projectId, seeded);
      return seeded;
    }
    const parsed = safeJsonParse<any>(raw);
    const normalized = normalizeState(parsed);
    return {
      ...normalized,
      project: {
        ...normalized.project,
        id: projectId,
        name: clampName(normalized.project?.name || "Untitled Project"),
        created_at_utc: (normalized.project?.created_at_utc || "").trim() || utcNow(),
      },
    };
  } catch {
    const st = defaultState();
    return { ...st, project: { ...st.project, id: projectId } };
  }
}

export function saveProjectStateById(projectId: string, state: ProjectState) {
  const idx = ensureInitialized();

  const normalized = normalizeState(state);
  const fixed: ProjectState = {
    ...normalized,
    project: {
      ...normalized.project,
      id: projectId,
      name: clampName(normalized.project?.name || "Untitled Project"),
      created_at_utc: (normalized.project?.created_at_utc || "").trim() || utcNow(),
    },
  };

  try {
    localStorage.setItem(projectStateKey(projectId), JSON.stringify(fixed));
  } catch {
    // ignore
  }

  const now = utcNow();
  const entry = idx.projects.find((p) => p.id === projectId);
  if (entry) {
    entry.name = fixed.project.name;
    entry.created_at_utc = entry.created_at_utc || fixed.project.created_at_utc;
    entry.updated_at_utc = now;
  } else {
    idx.projects.unshift({
      id: projectId,
      name: fixed.project.name,
      created_at_utc: fixed.project.created_at_utc,
      updated_at_utc: now,
    });
  }

  saveIndex(idx);
  dispatch("kindred_state_changed");
}

function idToPathSegment(id: string): string {
  const s = String(id || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_/g, "-");
  return s || "page";
}

function defaultRoutePathForId(id: string): string {
  const x = String(id || "").trim().toLowerCase();
  if (x === "home" || x === "landing") return "/";
  return `/${idToPathSegment(x)}`;
}


function idForCopy(page_id: string, slot: string): string {
  return `${page_id}:${slot}`;
}

export function defaultCopyBlocksForPages(args: {
  pages: { id: string; title: string }[];
  brand_name: string;
  brief: any;
}): CopyBlock[] {
  const pages = Array.isArray(args.pages) ? args.pages : [];
  const brand = String(args.brand_name || "").trim();
  const brief = args.brief || {};

  const offer = typeof brief.offer === "string" ? brief.offer.trim() : "";
  const problem = typeof brief.problem === "string" ? brief.problem.trim() : "";
  const keyActions = Array.isArray(brief.key_actions)
    ? brief.key_actions.map((x: any) => String(x || "").trim()).filter((x: string) => x.length > 0)
    : [];
  const cta = keyActions[0] || "Get started";

  const blocks: CopyBlock[] = [];

  for (const p of pages) {
    const page_id = String(p?.id || "").trim();
    const title = String(p?.title || page_id || "Page").trim();
    if (!page_id) continue;

    if (page_id === "home" || page_id === "landing") {
      blocks.push({
        id: idForCopy(page_id, "hero_headline"),
        page_id,
        slot: "hero_headline",
        text: brand ? `Welcome to ${brand}` : "Welcome",
      });
      blocks.push({
        id: idForCopy(page_id, "hero_subhead"),
        page_id,
        slot: "hero_subhead",
        text: offer || problem || "Write a one-sentence offer for your homepage.",
      });
      blocks.push({
        id: idForCopy(page_id, "primary_cta"),
        page_id,
        slot: "primary_cta",
        text: cta,
      });
    }

    blocks.push({
      id: idForCopy(page_id, "page_headline"),
      page_id,
      slot: "page_headline",
      text: title,
    });

    blocks.push({
      id: idForCopy(page_id, "page_intro"),
      page_id,
      slot: "page_intro",
      text: "",
    });
  }

  // Deterministic ordering for stability.
  blocks.sort((a, b) => {
    if (a.page_id !== b.page_id) return a.page_id.localeCompare(b.page_id);
    return a.slot.localeCompare(b.slot);
  });

  return blocks;
}

function normalizeCopyBlocks(existing: any, args: {
  pages: { id: string; title: string }[];
  brand_name: string;
  brief: any;
}): CopyBlock[] {
  const pages = Array.isArray(args.pages) ? args.pages : [];
  const pageIdSet = new Set(pages.map((p) => String(p.id || "")));

  const map = new Map<string, CopyBlock>();
  const existingArr = Array.isArray(existing) ? existing : [];

  for (const raw of existingArr) {
    if (!raw || typeof raw !== "object") continue;
    const page_id = String((raw as any).page_id || "").trim();
    const slot = String((raw as any).slot || "").trim();
    const text = typeof (raw as any).text === "string" ? (raw as any).text : "";
    if (!page_id || !slot) continue;
    if (!pageIdSet.has(page_id)) continue;
    const id = String((raw as any).id || idForCopy(page_id, slot)).trim() || idForCopy(page_id, slot);
    map.set(id, { id, page_id, slot, text });
  }

  const defaults = defaultCopyBlocksForPages(args);
  for (const d of defaults) {
    if (!map.has(d.id)) map.set(d.id, d);
  }

  const out = Array.from(map.values());
  out.sort((a, b) => {
    if (a.page_id !== b.page_id) return a.page_id.localeCompare(b.page_id);
    return a.slot.localeCompare(b.slot);
  });
  return out;
}

export function defaultState(): ProjectState {
  return {
    schema: "kindred.builder.state.v1",
    project: {
      id: safeId("p"),
      name: "Untitled Project",
      created_at_utc: utcNow(),
    },
    intent: {
      palettes: [],
      domains: [],
      intake: defaultIntentIntake(),
      capability_vector: defaultCapabilityVector(),
      constraints: { offline_first: true, no_payments: false, required_env_names: [] },
      brief: {
        audience_description: "",
        problem: "",
        offer: "",
        differentiators: [],
        key_actions: [],
        success_metrics: [],
        non_goals: [],
      },
    },
    design: {
      brand: { name: "", tagline: "", audience: "general_public", tone: "friendly" },
      references: [],
      tokens: {
        radius: "balanced",
        density: "balanced",
        contrast: "balanced",
        motion: "subtle",
        type_scale: "balanced",
        line_height: "balanced",
        focus: "standard",
        elevation: "balanced",
        layout_width: "balanced",
        voice: "serious",
        mode: "dark",
      },
      ia: {
        pages: [{ id: "home", title: "Home", route_path: "/", scene_id: "home" }],
      },
      lofi: {
        active_variant_id: "balanced",
        variants: [
          {
            id: "strict",
            label: "Strict (minimal)",
            pages: { home: { sections: ["hero", "value_props", "cta", "footer"] } },
          },
          {
            id: "balanced",
            label: "Balanced",
            pages: { home: { sections: ["hero", "value_props", "social_proof", "cta", "footer"] } },
          },
          {
            id: "explore",
            label: "Explore (more sections)",
            pages: { home: { sections: ["top_nav", "hero", "value_props", "social_proof", "faq", "secondary_cta", "footer"] } },
          },
        ],
      },
    },
    kernel_min: {
      actors: [{ id: "visitor", display_name: "Visitor" }],
      scenes: [{ id: "home", title: "Home", entry: true }],
      flows: [{ id: "primary", scenes: ["home"] }],
    },
    content: {
      copy_blocks: [
        { id: "home:hero_headline", page_id: "home", slot: "hero_headline", text: "Welcome" },
        { id: "home:hero_subhead", page_id: "home", slot: "hero_subhead", text: "" },
        { id: "home:primary_cta", page_id: "home", slot: "primary_cta", text: "Get started" },
        { id: "home:page_headline", page_id: "home", slot: "page_headline", text: "Home" },
        { id: "home:page_intro", page_id: "home", slot: "page_intro", text: "" },
      ],
    },

    director: {
      schema: "kindred.director_state.v1",
      intent_proposals: [],
      libraries_v1: {
        schema: "kindred.director_libraries.v1",
        catalog_version: "v1",
        draft_library_ids: [],
        adopted_library_ids: [],
      },
      patterns_v1: {
        schema: "kindred.director_patterns.v1",
        catalog_version: "v1",
        draft_pattern_ids: [],
        adopted_pattern_ids: [],
      },
      kits_v1: {
        schema: "kindred.director_kits.v1",
        catalog_version: "v1",
        draft_kit_ids: [],
        adopted_kit_ids: [],
      },
    },
  };
}


export function loadState(): ProjectState {
  const projectId = getCurrentProjectId();
  return loadProjectStateById(projectId);
}

export function saveState(state: ProjectState) {
  const projectId = getCurrentProjectId();
  saveProjectStateById(projectId, state);
}

function normalizeState(input: any): ProjectState {
  const d = defaultState();
  const s = typeof input === "object" && input ? input : {};

  const tokensIn = s.design && s.design.tokens ? s.design.tokens : {};
  const tokens: ProjectState["design"]["tokens"] = {
    ...d.design.tokens,
    ...tokensIn,
  };

  // Ensure required arrays exist.
  const palettes = Array.isArray(s.intent?.palettes) ? s.intent.palettes : d.intent.palettes;
  const domains = Array.isArray(s.intent?.domains) ? s.intent.domains : (d.intent as any).domains || [];
  const pages = Array.isArray(s.design?.ia?.pages) && s.design.ia.pages.length > 0 ? s.design.ia.pages : d.design.ia.pages;
  const variants = Array.isArray(s.design?.lofi?.variants) && s.design.lofi.variants.length > 0 ? s.design.lofi.variants : d.design.lofi.variants;
  const active_variant_id = typeof s.design?.lofi?.active_variant_id === "string" ? s.design.lofi.active_variant_id : d.design.lofi.active_variant_id;

  const actors = Array.isArray(s.kernel_min?.actors) && s.kernel_min.actors.length > 0 ? s.kernel_min.actors : d.kernel_min.actors;
  const scenes = Array.isArray(s.kernel_min?.scenes) && s.kernel_min.scenes.length > 0 ? s.kernel_min.scenes : d.kernel_min.scenes;
  const flows = Array.isArray(s.kernel_min?.flows) && s.kernel_min.flows.length > 0 ? s.kernel_min.flows : d.kernel_min.flows;

  const sceneIdSet = new Set((Array.isArray(scenes) ? scenes : []).map((x: any) => String(x?.id || "")));

  // Normalize IA pages (ensure route_path exists; scene_id defaults to matching id when possible).
  const pagesNorm = (Array.isArray(pages) ? pages : []).map((p: any) => {
    const id = String(p?.id || "");
    const route_path = typeof p?.route_path === "string" && p.route_path.trim() ? p.route_path : defaultRoutePathForId(id);
    const scene_id = typeof p?.scene_id === "string" && p.scene_id.trim() ? p.scene_id : sceneIdSet.has(id) ? id : undefined;
    return { ...p, id, route_path, scene_id };
  });

  // Ensure low-fi variants have at least a stub page entry for every IA page.
  const variantsNorm = (Array.isArray(variants) ? variants : []).map((v: any) => {
    const pagesMap = v && typeof v.pages === "object" && v.pages ? { ...v.pages } : {};
    for (const p of pagesNorm) {
      const key = String(p.id || "");
      if (!key) continue;
      if (!pagesMap[key]) pagesMap[key] = { sections: ["top_nav", "content", "footer"] };
    }
    return { ...v, pages: pagesMap };
  });

  // Normalize constraints (additive; older states may not include newer fields).
  const constraintsRaw: any = {
    ...d.intent.constraints,
    ...(s.intent?.constraints || {}),
  };
  const required_env_names = Array.isArray(constraintsRaw.required_env_names)
    ? constraintsRaw.required_env_names
        .map((x: any) => String(x || "").trim())
        .filter((x: string) => x.length > 0)
    : [];
  const constraintsNorm: ProjectState["intent"]["constraints"] = {
    ...constraintsRaw,
    required_env_names,
  };

  // Normalize Director Intake (schema-locked; no free-text requirements).
  const legacyNotes =
    !(s.intent && (s.intent as any).intake) && s.intent?.brief ? legacyBriefToNotes(s.intent.brief) : "";

  const intakeNorm = normalizeIntentIntake({
    raw: (s.intent as any)?.intake,
    build_intent: (s.intent as any)?.build_intent,
    palettes,
    legacy_notes: legacyNotes,
  });

  // Normalize director state extensions (libraries/patterns/kits adoption info).
  const directorRaw: any = (s as any).director || {};
  const libsRaw: any = directorRaw.libraries_v1 || {};
  const libsNorm: any = {
    schema: "kindred.director_libraries.v1",
    catalog_version: typeof libsRaw.catalog_version === "string" && libsRaw.catalog_version.trim() ? libsRaw.catalog_version : "v1",
    draft_library_ids: Array.isArray(libsRaw.draft_library_ids) ? libsRaw.draft_library_ids : [],
    adopted_library_ids: Array.isArray(libsRaw.adopted_library_ids) ? libsRaw.adopted_library_ids : [],
    adopted_from_spec_pack_sha256: typeof libsRaw.adopted_from_spec_pack_sha256 === "string" ? libsRaw.adopted_from_spec_pack_sha256 : undefined,
    adopted_libraries_spel_sha256: typeof libsRaw.adopted_libraries_spel_sha256 === "string" ? libsRaw.adopted_libraries_spel_sha256 : undefined,
    adopted_at_utc: typeof libsRaw.adopted_at_utc === "string" ? libsRaw.adopted_at_utc : undefined,
  };

  const patternsRaw: any = directorRaw.patterns_v1 || {};
  const patternsNorm: any = {
    schema: "kindred.director_patterns.v1",
    catalog_version: typeof patternsRaw.catalog_version === "string" && patternsRaw.catalog_version.trim() ? patternsRaw.catalog_version : "v1",
    draft_pattern_ids: Array.isArray(patternsRaw.draft_pattern_ids) ? patternsRaw.draft_pattern_ids : [],
    adopted_pattern_ids: Array.isArray(patternsRaw.adopted_pattern_ids) ? patternsRaw.adopted_pattern_ids : [],
    adopted_from_spec_pack_sha256: typeof patternsRaw.adopted_from_spec_pack_sha256 === "string" ? patternsRaw.adopted_from_spec_pack_sha256 : undefined,
    adopted_patterns_spel_sha256: typeof patternsRaw.adopted_patterns_spel_sha256 === "string" ? patternsRaw.adopted_patterns_spel_sha256 : undefined,
    adopted_at_utc: typeof patternsRaw.adopted_at_utc === "string" ? patternsRaw.adopted_at_utc : undefined,
  };

  const kitsRaw: any = directorRaw.kits_v1 || {};
  const kitsNorm: any = {
    schema: "kindred.director_kits.v1",
    catalog_version: typeof kitsRaw.catalog_version === "string" && kitsRaw.catalog_version.trim() ? kitsRaw.catalog_version : "v1",
    draft_kit_ids: Array.isArray(kitsRaw.draft_kit_ids) ? kitsRaw.draft_kit_ids : [],
    adopted_kit_ids: Array.isArray(kitsRaw.adopted_kit_ids) ? kitsRaw.adopted_kit_ids : [],
    adopted_from_spec_pack_sha256: typeof kitsRaw.adopted_from_spec_pack_sha256 === "string" ? kitsRaw.adopted_from_spec_pack_sha256 : undefined,
    adopted_kits_spel_sha256: typeof kitsRaw.adopted_kits_spel_sha256 === "string" ? kitsRaw.adopted_kits_spel_sha256 : undefined,
    adopted_at_utc: typeof kitsRaw.adopted_at_utc === "string" ? kitsRaw.adopted_at_utc : undefined,
  };

  const directorNorm: any = {
    schema: "kindred.director_state.v1",
    ...directorRaw,
    intent_proposals: Array.isArray(directorRaw.intent_proposals) ? directorRaw.intent_proposals : (d as any).director?.intent_proposals || [],
    libraries_v1: libsNorm,
    patterns_v1: patternsNorm,
    kits_v1: kitsNorm,
  };

  // Build base normalized state.
  let out: ProjectState = {
    ...d,
    ...s,
    project: { ...d.project, ...(s.project || {}) },
    intent: {
      ...d.intent,
      ...(s.intent || {}),
      palettes,
      domains,
      intake: intakeNorm,
      capability_vector: normalizeCapabilityVector((s.intent as any)?.capability_vector),
      constraints: constraintsNorm,
      // brief is derived deterministically below
      brief: {
        ...d.intent.brief,
        ...(s.intent?.brief || {}),
        differentiators: Array.isArray(s.intent?.brief?.differentiators) ? s.intent.brief.differentiators : d.intent.brief.differentiators,
        key_actions: Array.isArray(s.intent?.brief?.key_actions) ? s.intent.brief.key_actions : d.intent.brief.key_actions,
        success_metrics: Array.isArray(s.intent?.brief?.success_metrics) ? s.intent.brief.success_metrics : d.intent.brief.success_metrics,
        non_goals: Array.isArray(s.intent?.brief?.non_goals) ? s.intent.brief.non_goals : d.intent.brief.non_goals,
      },
    },
    design: {
      ...d.design,
      ...(s.design || {}),
      brand: { ...d.design.brand, ...(s.design?.brand || {}) },
      references: Array.isArray(s.design?.references) ? s.design.references : d.design.references,
      tokens,
      ia: { pages: pagesNorm },
      lofi: { active_variant_id, variants: variantsNorm },
    },
    kernel_min: {
      ...d.kernel_min,
      ...(s.kernel_min || {}),
      actors,
      scenes,
      flows,
    },
    content: {
      copy_blocks: Array.isArray(s.content?.copy_blocks) ? s.content.copy_blocks : d.content.copy_blocks,
    },
    director: directorNorm,
  };

  // Derive canonical brief from intake.
  out = deriveBriefFromIntent(out);

  // Normalize copy blocks using the derived brief (not legacy free-text).
  const copy_blocks_norm = normalizeCopyBlocks(out.content?.copy_blocks, {
    pages: pagesNorm.map((p: any) => ({ id: String(p.id || ""), title: String(p.title || p.id || "") })),
    brand_name: typeof out.design?.brand?.name === "string" ? out.design.brand.name : d.design.brand.name,
    brief: out.intent?.brief || d.intent.brief,
  });

  out = {
    ...out,
    content: {
      copy_blocks: copy_blocks_norm,
    },
  };

  return out;
}


export function togglePalette(state: ProjectState, p: PaletteId): ProjectState {
  const set = new Set(state.intent.palettes);
  if (set.has(p)) set.delete(p);
  else set.add(p);
  return { ...state, intent: { ...state.intent, palettes: Array.from(set) } };
}

export function deriveDoneSteps(state: ProjectState): Set<string> {
  const done = new Set<string>();
  if (state.project.name.trim()) done.add("project");
  if (state.intent.launch_path_id || (state.intent.build_intent && state.intent.primary_surface)) done.add("launch");
  if (state.intent.build_intent) done.add("intent");
  if (state.intent.primary_surface) done.add("surface");
  if (state.intent.palettes.length > 0) done.add("palettes");
  if (state.design.brand.name.trim()) done.add("brief");
  if (state.kernel_min.actors.length > 0 && state.kernel_min.scenes.length > 0) done.add("journey");
  if (state.design.ia.pages.length > 0) done.add("ia");
  if (state.design.tokens.mode) done.add("tokens");
  if (state.content?.copy_blocks?.some((b) => typeof b.text === "string" && b.text.trim().length > 0)) done.add("copy");
  return done;
}

export function validateForExport(state: ProjectState): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!state.intent.build_intent) issues.push("Choose a Build Intent.");
  if (!state.intent.primary_surface) issues.push("Choose a Primary Surface.");
  if (state.intent.palettes.length === 0) issues.push("Select at least one Palette.");
  if (!state.design.brand.name.trim()) issues.push("Set a brand name (brief).");
  const entryCount = state.kernel_min.scenes.filter((s) => s.entry).length;
  if (entryCount !== 1) issues.push("Exactly one scene must be marked entry.");
  if (!state.design.ia.pages || state.design.ia.pages.length === 0) issues.push("Define an IA tree (at least one page).");
  const flow = state.kernel_min.flows[0];
  if (!flow || flow.scenes.length === 0) issues.push("Define at least one flow.");
  return { ok: issues.length === 0, issues };
}
