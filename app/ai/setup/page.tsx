import { Panel } from "../../../components/Panel";
import { AiSetupWizard } from "../../../components/AiSetupWizard";

export default function AiSetupPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>AI Setup</h1>
        <p>Guided setup for non-technical users. Non-custodial by default. No secrets stored in the browser.</p>
      </div>

      <div className="grid">
        <Panel title="Quick links">
          <div className="row" style={{ flexWrap: "wrap" }}>
            <a className="btn primary" href="/ai">
              AI status + ping test
            </a>
            <a className="btn" href="/docs/ai-keys-and-costs">
              API keys & costs
            </a>
            <a className="btn" href="/usage">
              Spend awareness
            </a>
          </div>
        </Panel>

        <AiSetupWizard />
      </div>
    </div>
  );
}
