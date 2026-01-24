import { Panel } from "../../../components/Panel";

export default function DirectorBriefDocPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Director Brief</h1>
        <p>
          Directors do not build software. They steer. Your job is to make deterministic selections that a world-class team (and Operators)
          can execute, and to reject bad suggestions quickly.
        </p>
      </div>

      <div className="grid">
        <Panel title="What you select">
          <ul className="small">
            <li><strong>7 Options</strong>: the high-level build intent (no free-text specs).</li>
            <li><strong>14 Palettes</strong>: visual posture lenses (composition macros, not templates).</li>
            <li><strong>Primary outcome + key actions</strong>: bounded chips that keep direction clear.</li>
          </ul>
        </Panel>

        <Panel title="Workflow">
          <ol className="small">
            <li>Open <a href="/director/brief">Director → Brief</a>.</li>
            <li>Select your <strong>7 Options</strong> and <strong>14 Palettes</strong>.</li>
            <li>Export the <strong>Intent Pack (JSON)</strong> for portability and team alignment.</li>
            <li>Generate a small set of proposals and adopt one (no silent mutations).</li>
            <li>Review in <a href="/director/proposals">Proposals</a>, then capture proof in <a href="/director/ship">Ship</a>.</li>
          </ol>
        </Panel>

        <Panel title="What you get">
          <ul className="small">
            <li><strong>Intent Pack (JSON)</strong>: the portable record of direction for Operators and teams.</li>
            <li><strong>Content hash</strong>: stable across repeated exports if your selections don’t change.</li>
            <li><strong>Proposals</strong>: adoptable changes you can accept/reject quickly.</li>
          </ul>
        </Panel>

        <Panel title="Design stance">
          <ul className="small">
            <li>Director mode is central. Operators can go deeper, but Directors never lose control.</li>
            <li>Presets first. Minimal free text. Visual selections over prose.</li>
            <li>AI is optional and proposal-only; offline-first remains the default.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
