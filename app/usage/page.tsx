"use client";

import { Panel } from "../../components/Panel";
import { Callout } from "../../components/Callout";
import { TokenCostEstimator } from "../../components/TokenCostEstimator";
import { AiSpendPanel } from "../../components/AiSpendPanel";

export default function UsagePage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>AI costs (awareness)</h1>
        <p>
          This page is intentionally boring: costs are real, surprises are expensive, and your provider dashboard is the source of truth.
        </p>
      </div>

      <div className="grid">
        <AiSpendPanel />

        <Panel title="What SDDE can and cannot do">
          <ul className="small">
            <li>
              SDDE can estimate token spend <em>before</em> you run prompts (roughly) so you can plan.
            </li>
            <li>
              SDDE cannot see your provider invoices or balances (non-custodial).
            </li>
            <li>
              If you want hard accounting, use your provider dashboard and set budget limits there.
            </li>
          </ul>
        </Panel>

        <Panel title="Estimator">
          <TokenCostEstimator title="Token cost estimator" defaultInputRatePer1M={0.8} defaultOutputRatePer1M={3.2} />
          <div className="small" style={{ marginTop: 8 }}>
            Update the rates to match your chosen model/provider. Estimates are not a bill.
          </div>
        </Panel>

        <Panel title="Safety reminders">
          <Callout title="Keys stay server-side" tone="warn">
            Never paste API keys into browser fields unless you understand the risk. Prefer host environment variables.
          </Callout>
          <Callout title="Budget limits" tone="info">
            Set usage caps in your provider account. If SDDE ever helps you spend money, it should help you not overspend.
          </Callout>

          <div className="small" style={{ marginTop: 10 }}>
            Useful refs:
            {" "}
            <a href="https://openai.com/api/pricing/" target="_blank" rel="noreferrer">
              OpenAI pricing
            </a>
            {" · "}
            <a href="https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key" target="_blank" rel="noreferrer">
              Find your API key
            </a>
            {" · "}
            <a href="https://help.openai.com/en/articles/8554956-usage-dashboard-legacy" target="_blank" rel="noreferrer">
              Usage dashboard
            </a>
            {" · "}
            <a href="https://platform.openai.com/settings/organization/limits" target="_blank" rel="noreferrer">
              Org limits & budgets
            </a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
