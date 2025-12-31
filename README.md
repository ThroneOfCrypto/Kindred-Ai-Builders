# Kindred AI Builders (Offline-first)

A deployable Next.js app that provides a page-by-page wizard and exports a deterministic **Spec Pack ZIP**.

## Quick start (local / Codespaces)

```bash
npm install
npm run dev
```

Open the Builder:
- http://localhost:3000/builder

## Deploy to Vercel

- Import the GitHub repo into Vercel
- Framework preset: **Next.js**
- Build command: `npm run build`
- Output: default
- No environment variables required for Offline mode

If you enable Hosted AI:
- `AI_MODE=hosted`
- `OPENAI_API_KEY=...`

## What the Builder exports

The ZIP contains:

- `blueprint/intake.json`
- `blueprint/palettes.json`
- `blueprint/tradeoffs.json`
- `blueprint/actors.json`
- `blueprint/scenes.json`
- `blueprint/ai_connector.json` (no secrets)
- `blueprint/secrets_instructions.md`
- `manifest.json`

## Editing launch paths

Edit:
- `sdde/contracts/launch_paths.json`

This file controls the “Launch Path” catalog shown in Step 1.
