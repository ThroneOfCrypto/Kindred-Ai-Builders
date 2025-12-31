# Kindred Official v2 (Greenfield)

A minimal, Vercel-friendly Next.js app intended to become the SDDE-governed “builder-first” experience.

## Goals (v0)
- Deploy cleanly on Vercel with **no database** and **no required env vars**.
- Wallet-first “login” (client-side CIP-30 connect) for the Builder screen.
- A safe “AI status” endpoint that never calls external services (no keys required).

## Run locally (Codespaces / local)
```bash
npm install
npm run dev
```

Open: http://localhost:3000

## Deploy on Vercel
- Import the repo in Vercel.
- Build command: `npm run build` (default)
- Output: Next.js (default)

### Optional env vars (for future SDDE / AI wiring)
Create these only when you are ready:
- `AI_MODE` = `offline` | `hosted` | `local`
- `OPENAI_API_KEY` (hosted)
- `OPENAI_COMPAT_BASE_URL` (local)

No env vars are required for a successful deploy.

## Notes
This repo intentionally avoids NextAuth, Prisma, and any server-side state in v0.
Add complexity only after the “builder-first” UX is nailed.
