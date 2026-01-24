import { Panel } from "../../components/Panel";
import { AiPingPanel } from "../../components/AiPingPanel";

function envMode() {
  const m = process.env.AI_MODE || "offline";
  return m;
}

export default function AiStatusPage() {
  const mode = envMode();
  return (
    <div className="container">
      <div className="hero">
        <h1>AI Status</h1>
        <p>Offline is first-class. Hosted/local are optional and must never leak secrets into artefacts.</p>
      </div>
      <div className="grid">
        <AiPingPanel />

        <Panel title="Current mode">
          <p className="small">
            <strong>AI_MODE</strong> = <code>{mode}</code>
          </p>
          <ul className="small">
            <li>
              <code>offline</code>: deterministic proposals only (no external calls)
            </li>
            <li>
              <code>hosted</code>: uses <code>OPENAI_API_KEY</code> server-side
            </li>
            <li>
              <code>local</code>: uses <code>AI_BASE_URL</code> (OpenAI-compatible) server-side
            </li>
          </ul>
        </Panel>

        <Panel title="Environment variables">
          <ul className="small">
            <li>
              <code>AI_MODE</code> = <code>offline</code> | <code>hosted</code> | <code>local</code>
            </li>
            <li>
              <code>OPENAI_API_KEY</code> (hosted) — server-side only
            </li>
            <li>
              <code>AI_BASE_URL</code> (local) — e.g. <code>http://localhost:11434/v1</code>
            </li>
            <li>
              <code>AI_API_KEY</code> (optional for local)
            </li>
            <li>
              <code>OPENAI_MODEL</code> or <code>AI_MODEL</code> (optional)
            </li>
          </ul>
          <p className="small">
            Never prefix secrets with <code>NEXT_PUBLIC_</code>. Spec packs must never contain keys.
          </p>
        </Panel>

        <Panel title="Proposal-only contract">
          <ul className="small">
            <li>AI outputs proposals (patches / candidate packs) only</li>
            <li>No automatic application; diffs are always reviewable</li>
            <li>Offline deterministic fallbacks must exist</li>
          </ul>
        </Panel>

        <Panel title="API routes">
          <ul className="small">
            <li>
              <code>/api/ai/ping</code> — checks server config (no prompts, no secrets)
            </li>
            <li>
              <code>/api/ai/suggest</code> — text suggestions for the current state
            </li>
            <li>
              <code>/api/ai/propose-pack</code> — returns candidate Spec Pack proposals (tokens, low-fi layout hints, copy)
            </li>
            <li>
              <code>/api/ai/brownfield-propose</code> — proposes an SPEL module from a brownfield inventory (proposal-only)
            </li>
          </ul>
        </Panel>

        <Panel title="Non-technical setup">
          <p className="small">
            If you want hosted AI, you create a key in your provider account and store it as a server-side environment variable on your host.
            Kindred will never ask you to paste a key into a permanent browser field.
          </p>
          <div className="row">
            <a className="btn primary" href="/ai/setup">
              Guided setup wizard
            </a>
            <a className="btn" href="/docs/ai-keys-and-costs">
              API keys & costs
            </a>
            <a className="btn" href="https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key" target="_blank" rel="noreferrer">
              Find your OpenAI API key
            </a>
            <a className="btn" href="https://openai.com/api/pricing/" target="_blank" rel="noreferrer">
              Pricing
            </a>
            <a className="btn" href="https://vercel.com/docs/environment-variables/sensitive-environment-variables" target="_blank" rel="noreferrer">
              Vercel sensitive env vars
            </a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
