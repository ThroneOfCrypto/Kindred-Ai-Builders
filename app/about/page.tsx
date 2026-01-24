import { Panel } from "../../components/Panel";

export default function AboutPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>About</h1>
        <p>
          Kindred AI Builders is a deterministic, artefact-first builder. It aims to make serious engineering accessible to beginners.
        </p>
      </div>
      <Panel title="Product stance">
        <ul className="small">
          <li>Beginner-first, train-friendly</li>
          <li>Deterministic state (schemas + typed holes)</li>
          <li>AI as proposals, not authority</li>
          <li>Offline project workspace (local-only) + project ZIP import/export</li>
          <li>Gates that feel real</li>
        </ul>
      </Panel>
    </div>
  );
}
