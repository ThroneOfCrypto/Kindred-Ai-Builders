// Vercel environment contract checks.
//
// This repo is intentionally opinionated: it targets Vercel.
// If you want to run verifiers locally, set KDC_ALLOW_LOCAL=1.

export function assertNodeRange(nodeVersion, { minMajor, maxMajor }) {
  if (process.env.KDC_ALLOW_LOCAL === '1') return;
  const major = Number(String(nodeVersion).split('.')[0]);
  if (!Number.isFinite(major)) {
    throw new Error(`Could not parse Node major from: ${nodeVersion}`);
  }
  if (major < minMajor || major > maxMajor) {
    throw new Error(
      `Node major ${major} is outside allowed range [${minMajor}, ${maxMajor}].` +
        ` (Expected a pinned toolchain. This repo targets Vercel Node ${minMajor}.x)`
    );
  }
}

export function assertVercelBuildEnvironment() {
  if (process.env.KDC_ALLOW_LOCAL === '1') return;

  // Vercel sets VERCEL=1 on builds/runtimes.
  // See Vercel docs for environment variables.
  if (process.env.VERCEL !== '1') {
    throw new Error(
      'Vercel environment not detected (VERCEL!=1). ' +
        'This repository is designed to run inside Vercel. ' +
        'For local rehearsal only, set KDC_ALLOW_LOCAL=1.'
    );
  }
}
