/**
 * Version identifiers used across exported artefacts.
 *
 * Keep these values stable within a given release to support determinism:
 * same inputs -> same outputs.
 */

// NOTE: update in package.json as well.
export const APP_VERSION = "1.1.1";

// Validation is deterministic; tie its reported version to the app release.
export const VALIDATOR_VERSION = "1.1.1";


// Spec Pack format version (independent from app version).
export const SPEC_PACK_VERSION = "v1";

// Repo Pack format version (independent from app version).
export const REPO_PACK_VERSION = "v1";

// Deterministic ZIP parameters (fflate uses DOS time; 1980-01-01 is the epoch).
export const ZIP_MTIME_UTC = "1980-01-01T00:00:00.000Z";
