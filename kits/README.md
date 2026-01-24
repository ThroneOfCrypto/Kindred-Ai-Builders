# Target Kits

Target Kits are explicit, hashable execution contracts.

- The **kernel repo** (this repo) currently implements exactly one authoritative kit:
  - `vercel-node24`

Other kits may exist as *planned* or *experimental* contracts for exported repos, but they are **not enforced** by this kernel unless explicitly implemented.

Why Kits exist:
- Preserve legacy intention (users can export repos that run anywhere)
- Prevent "environment ambiguity" (every export declares a contract)
- Allow multiple targets without weakening the core physics
