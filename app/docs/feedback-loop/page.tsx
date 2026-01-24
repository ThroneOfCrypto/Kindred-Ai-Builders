import { Panel } from "../../../components/Panel";

export default function FeedbackLoopDocPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Feedback loop (FEARR)</h1>
        <p>Post-deploy iteration that stays local-first and evidence-driven.</p>
      </div>

      <div className="grid">
        <Panel title="What FEARR is">
          <ul>
            <li>
              <strong>F</strong>eedback: capture what happened using human language.
            </li>
            <li>
              <strong>E</strong>vidence: export a structured report (JSON) that can be attached to issues/tags.
            </li>
            <li>
              <strong>A</strong>ction: make the smallest change that resolves the report.
            </li>
            <li>
              <strong>R</strong>e-run: re-run proof lanes (Verify plans / CI).
            </li>
            <li>
              <strong>R</strong>elease: promote only when evidence exists.
            </li>
          </ul>
          <p className="small" style={{ marginBottom: 0 }}>
            Canonical text: <code>docs/FEEDBACK_LOOP_FEARR.md</code>
          </p>
        </Panel>

        <Panel title="Beginner workflow">
          <ol>
            <li>Open the deployed site.</li>
            <li>Use Vercel Preview Deployments for feedback loops (recommended).</li>
            <li>
              Capture feedback in <code>/feedback</code>, download the JSON, and attach it to the work item.
            </li>
          </ol>
        </Panel>

        <Panel title="Vercel-native feedback (optional)">
          <p className="small" style={{ marginBottom: 0 }}>
            On Vercel preview deployments, the Toolbar can provide Comments, a11y audits, layout shift inspection, and quick links.
          </p>
        </Panel>
      </div>
    </div>
  );
}
