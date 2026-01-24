import { Panel } from "../../../components/Panel";
import { readDocFile } from "../../../lib/read_doc_file";

export default function GovernanceDocsPage() {
  const threshold = readDocFile("PUBLISH_READY_THRESHOLD_V1.md");
  const contract = readDocFile("ENGINEERING_SPEC_AND_CONTRIBUTOR_CONTRACT.md");

  return (
    <div className="container">
      <div className="hero">
        <h1>Governance (normative)</h1>
        <p>These documents define the rules for changing and shipping Kindred AI Builders.</p>
      </div>

      <div className="grid">
        <Panel title="Publish-ready threshold (v1)">
          <p className="small" style={{ marginBottom: 0 }}>
            Repo doc: <code>docs/PUBLISH_READY_THRESHOLD_V1.md</code> (mirrors <code>contracts/governance</code>)
          </p>
          <div className="codeBlock" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{threshold.text}</div>
        </Panel>

        <Panel title="Engineering spec + contributor contract">
          <p className="small" style={{ marginBottom: 0 }}>
            Repo doc: <code>docs/ENGINEERING_SPEC_AND_CONTRIBUTOR_CONTRACT.md</code> (mirrors <code>contracts/governance</code>)
          </p>
          <div className="codeBlock" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>{contract.text}</div>
        </Panel>
      </div>
    </div>
  );
}
