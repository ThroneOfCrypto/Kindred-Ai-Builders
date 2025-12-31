# Definitive Guide — Kindred AI Builders (Offline-first)

Date: 2025-12-31

This guide assumes you are not a developer. It uses copy/paste commands and avoids “magic steps”.

## What you are building

You will deploy a website that has:

- A **Builder Wizard** that unfolds page by page:
  1. Launch Path
  2. Basics
  3. Palettes + Tradeoffs
  4. Design Studio (Actors + Scenes)
  5. AI Connectors (optional)
  6. Review → Download

- A “Spec Pack ZIP” generator endpoint:
  - `POST /api/spec-pack`
  - Returns a zip containing canonical blueprint files.

Offline is the default: no wallet, no API keys, no database.

---

## Step 1 — Put the repo on GitHub

### Option A: Upload via GitHub website (no terminal)
1. Go to GitHub and create a new repository.
2. On your computer, unzip the repo zip you downloaded from ChatGPT.
3. On GitHub, click **Add file → Upload files**.
4. Drag the whole folder contents (not the zip) into the upload area.
5. Click **Commit changes**.

### Option B: Use terminal (Codespaces or local)
If you already know git basics, you can initialize and push normally.

---

## Step 2 — Open Codespaces (beginner-friendly)

1. In GitHub, open your repository.
2. Click **Code → Codespaces → Create codespace on main**.
3. When the terminal opens, run:

```bash
npm install
npm run dev
```

You should see a message like “ready on http://localhost:3000”.

4. In Codespaces, open the forwarded port link.
5. Visit:
- `/builder`

---

## Step 3 — Deploy to Vercel (Production)

1. Go to Vercel.
2. **Add New → Project**
3. Import your GitHub repo.
4. Vercel should detect **Next.js** automatically.

If Vercel shows “Framework preset: Other”, set:
- Framework preset: **Next.js**
- Root directory: `.`
- Build command: `npm run build`
- Output directory: (leave default)

5. Click **Deploy**.

### Common Vercel errors and fixes

#### Error: “Vulnerable version of Next.js detected…”
Fix by upgrading Next.js in `package.json` (this repo already pins `next@15.5.7`).

If you ever update and hit it again:

```bash
npm install next@latest
git add package.json package-lock.json
git commit -m "Upgrade Next.js"
git push
```

#### Error: “Module not found: Can't resolve 'jszip'”
It means `jszip` isn’t in `package.json` or wasn’t committed.
This repo includes it by default.

---

## Step 4 — (Optional) Enable Hosted AI later

Offline mode works without any setup.

To enable Hosted AI on Vercel:
1. Vercel → Project → **Settings → Environment Variables**
2. Add:
- `AI_MODE` = `hosted`
- `OPENAI_API_KEY` = your key

Redeploy.

To test, open your site and in the Builder:
- Step 5 → set mode “hosted” → click “Test connector”.

---

## Step 5 — What “Switch to SDDE OS to build SDDE OS” means

Right now, this Builder exports deterministic blueprint packs.
The transition to SDDE OS being the primary builder happens when the app also supports:

- Import Spec Pack → create a project workspace
- Run gates → show gate reports
- Apply patches → update the repo with reviewable diffs

That is the point where you stop using chat for day-to-day building and use chat only to improve SDDE OS itself.

---

## Files you are expected to edit (safe)

- `sdde/contracts/launch_paths.json`  
  Add more launch paths and change defaults.

- `components/SpecPackBuilder.tsx`  
  Add more design primitives (Flows, Policies, Ops hooks) step-by-step.

- `app/api/spec-pack/route.ts`  
  Add more blueprint files into the zip.

---

## What’s intentionally NOT included yet

- Wallet login (you said “wallet last”)
- Database
- Multi-user state
- Full SDDE kernel execution in the browser

Those come after the builder UX is correct and the export format is stable.
