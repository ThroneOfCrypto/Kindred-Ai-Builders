# Legacy Translation Status

The legacy reference repo (`patched366`) contains a large Next.js Director/Operator UI and multiple API routes.

The deterministic core kernel intentionally stays **static + Vercel-authoritative**.

Therefore, legacy intentions are translated into three lanes:

1. **Kernel surfaces** (static): Director-first, proof-backed
2. **Target Kits** (export lanes): external toolchains and UI stacks
3. **Operator tooling** (secondary): optional, never default

## How completeness is measured

`docs/LEGACY_PARITY_LEDGER.v1.json` is the canonical checklist.

### Diagnostic progress

```bash
npm run legacy:parity
```

### Strict completeness gate

```bash
npm run legacy:parity:strict
```

Strict mode fails unless **100% of ledger items** are marked `status: done`.
