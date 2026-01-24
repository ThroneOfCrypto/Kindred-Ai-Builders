"use client";

/**
 * Repo Workbench localStorage keys.
 *
 * IMPORTANT: Keys are scoped per project id to prevent cross-project state bleed.
 */

export const REPO_WB_BASE_B64_KEY_PREFIX = "kindred_repo_workbench_base_pack_b64_v1:";
export const REPO_WB_BASE_NAME_KEY_PREFIX = "kindred_repo_workbench_base_pack_name_v1:";
export const REPO_WB_PROP_B64_KEY_PREFIX = "kindred_repo_workbench_proposal_pack_b64_v1:";
export const REPO_WB_PROP_NAME_KEY_PREFIX = "kindred_repo_workbench_proposal_pack_name_v1:";

export function repoWorkbenchBaseB64KeyForProject(projectId: string): string {
  return `${REPO_WB_BASE_B64_KEY_PREFIX}${projectId}`;
}

export function repoWorkbenchBaseNameKeyForProject(projectId: string): string {
  return `${REPO_WB_BASE_NAME_KEY_PREFIX}${projectId}`;
}

export function repoWorkbenchProposalB64KeyForProject(projectId: string): string {
  return `${REPO_WB_PROP_B64_KEY_PREFIX}${projectId}`;
}

export function repoWorkbenchProposalNameKeyForProject(projectId: string): string {
  return `${REPO_WB_PROP_NAME_KEY_PREFIX}${projectId}`;
}
