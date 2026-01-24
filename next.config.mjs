/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Deterministic gating posture:
  // - Lint is enforced in CI (eslint CLI) and by publish_ready proofs.
  // - Vercel/next build should not be your linter.
  // TypeScript posture:
  // - Production builds MUST fail on TS errors.
  // - CI is still the proof lane, but Vercel should never deploy a broken bundle.
  // (Do not set `typescript.ignoreBuildErrors`.)

  // Security headers (baseline).
  // See docs/SECURITY_HEADERS.md
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // Connector support: allow loopback HTTP from a secure Vercel surface.
      // Browsers treat localhost/127.0.0.1 as potentially trustworthy origins,
      // but CSP must still explicitly allow them.
      "connect-src 'self' https: http://127.0.0.1:* http://localhost:* http://[::1]:*",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },

  eslint: {
    // Warning: this allows production builds to complete even with ESLint errors.
    // Only enable if lint runs elsewhere (CI/pre-commit).
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
