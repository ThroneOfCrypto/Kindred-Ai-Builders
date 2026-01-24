import { Panel } from "../../../components/Panel";

export default function RepoProjectsDocPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Repo Projects (experimental)</h1>
        <p>
          Repo Projects are the general substrate for "build SDDE OS from scratch in the interface" without any core special casing.
        </p>
      </div>

      <div className="grid">
        <Panel title="The big idea">
          <ul>
            <li>
              A <strong>Repo Pack</strong> is a deterministic snapshot of a repository: stable ordering, per-file hashes, and clear caps.
            </li>
            <li>
              A <strong>Repo Workbench</strong> compares Base vs Proposal Repo Packs and applies patch ops: add/edit/delete/move.
            </li>
            <li>
              A <strong>Kit</strong> contributes templates + verify adapters (e.g. SDDE OS seed), but core remains repo-agnostic.
            </li>
          </ul>
          <p className="small" style={{ marginBottom: 0 }}>
            Repo Packs export as a normal ZIP containing <code>repo_pack_manifest.json</code> plus files stored under <code>repo/</code>.
            The displayed Pack SHA is the SHA-256 of the deterministic ZIP bytes.
          </p>
        </Panel>

        <Panel title="What’s in scope">
          <ul>
            <li>Import any repo ZIP and export a deterministic Repo Pack ZIP (offline-first).</li>
            <li>Scaffold a new repo as a Repo Pack (Repo Builder v1).</li>
            <li>Diff + patch + adopt + lock for repos (same loop as Spec Packs).</li>
            <li>Verification adapters that are local-first (copy/paste commands + report upload).</li>
          </ul>
        </Panel>

        <Panel title="Repo Pack layout">
          <p className="small">
            Exported Repo Packs store files under <code>repo/</code> and include a root <code>repo_pack_manifest.json</code>.
            The UI reports a Pack SHA which is the SHA-256 of the deterministic ZIP bytes.
          </p>
        </Panel>

        <Panel title="What’s explicitly rejected">
          <ul>
            <li>Running arbitrary user code on the server (including Vercel functions as a build farm).</li>
            <li>A full web IDE inside the browser.</li>
          </ul>
        </Panel>

        <Panel title="Normative contract">
          <p className="small">
            The definition of done and schema identifiers live in: <code>contracts/milestones/repo_projects_v1.md</code>
          </p>
          <p className="small">
            Repo-side deep dive (operator doc): <code>docs/REPO_PROJECTS.md</code>
          </p>
          <div className="row">
            <a className="btn" href="/repo">Open Repos hub</a>
            <a className="btn" href="/repo-projects">Open Repo Projects</a>
            <a className="btn" href="/repo-builder">Open Repo Builder</a>
            <a className="btn" href="/repo-workbench">Open Repo Workbench</a>
          </div>
        </Panel>

        <Panel title="Storage (important)">
          <p className="small">
            Repo Pack ZIP bytes can be large. Base/Proposal/Locked bytes are stored in <strong>IndexedDB</strong>, while small metadata is stored
            in localStorage.
          </p>
          <ul>
            <li>If you clear site storage, the UI may still show a lock record but the locked ZIP bytes may be missing.</li>
            <li>Project ZIP export/import does not yet include Repo Pack bytes.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
