import { Panel } from "../../../components/Panel";

export default function BackupDocsPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>Backup &amp; restore</h1>
        <p>Portable project export/import (local-first). Designed for beginners: no accounts, no server execution.</p>
      </div>

      <div className="grid">
        <Panel title="What a backup is">
          <p className="small">
            A Kindred project backup is a single ZIP that captures the app&apos;s local state for one project. It is meant for:
            moving to a new browser, sharing a project snapshot with a collaborator, and keeping a recoverable trail.
          </p>
          <ul className="small">
            <li><strong>Offline-first:</strong> backup/restore works without any cloud.</li>
            <li><strong>Deterministic artefacts:</strong> packs inside the backup preserve their own deterministic hashes.</li>
            <li><strong>No special casing:</strong> SDDE OS is just a Kit; the backup format is generic.</li>
          </ul>
        </Panel>

        <Panel title="What is included (v2)">
          <ul className="small">
            <li>Project state (brief/journey/IA/tokens and related local state)</li>
            <li>Spec Pack caches (Base/Proposal) + locked snapshot (when present)</li>
            <li>Spec governance</li>
            <li><strong>Repo Pack bytes</strong> exported from IndexedDB (Base/Proposal/Locked, when present)</li>
            <li>Repo governance + Repo pack metadata (when present)</li>
            <li>Verify reports (uploaded or captured locally)</li>
            <li>Enabled kits
- Rigor contract (rigor dial)
- Evidence ledger list (kit ids used by the project)</li>
            <li>Dogfood report (when present)</li>
            <li>Snapshots (optional safety trail)</li>
          </ul>
        </Panel>

        <Panel title="How to export">
          <ol className="small">
            <li>Open <code>/backup</code>.</li>
            <li>Click <strong>Run health check</strong> to confirm what will be included.</li>
            <li>Click <strong>Download backup ZIP</strong>.</li>
          </ol>
        </Panel>

        <Panel title="How to restore">
          <ol className="small">
            <li>Open <code>/backup</code> in the target browser.</li>
            <li>Choose the backup ZIP under <strong>Import</strong>.</li>
            <li>After restore, check <code>/workbench</code> (Spec) and <code>/repo-workbench</code> (Repo) and <code>/verify</code>.</li>
          </ol>
          <p className="small">
            Note: if a browser blocks IndexedDB (rare, but possible in strict private modes), Repo Pack bytes may not restore.
            The UI will show warnings.
          </p>
        </Panel>

        <Panel title="Restore test checklist">
          <ul className="small">
            <li>Spec Base and Spec Proposal visible in Workbench</li>
            <li>Repo Base and Repo Proposal visible in Repo Workbench</li>
            <li>Verify reports present</li>
            <li>Enabled kits
- Rigor contract (rigor dial)
- Evidence ledger list preserved</li>
            <li>Health check hashes match what the backup meta reports</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
