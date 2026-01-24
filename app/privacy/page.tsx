import React from "react";

export default function PrivacyPage() {
  return (
    <main className="container" style={{ padding: "24px 0" }}>
      <h1>Privacy Policy</h1>
      <p>
        Kindred AI Builders is <strong>offline-first</strong>. By default, your projects, packs, and evidence are stored
        locally in your browser (localStorage / IndexedDB).
      </p>
      <h2>What we store</h2>
      <ul>
        <li>Project state (your selections, brief, design/UX data)</li>
        <li>Exported packs (base/proposal/locked) and governance metadata</li>
        <li>Evidence ledger entries and failure records (when you choose to save them)</li>
      </ul>
      <h2>What we do not do by default</h2>
      <ul>
        <li>No telemetry is sent automatically.</li>
        <li>No analytics cookies are required for core functionality.</li>
        <li>No third-party accounts are required to use the core product.</li>
      </ul>
      <h2>Optional network features</h2>
      <p>
        If you enable AI proposals (server-side) via environment configuration, requests you initiate may be sent to an AI
        provider. AI remains <strong>proposal-only</strong>: it never silently changes your project.
      </p>
      <h2>Your control</h2>
      <ul>
        <li>You can export or backup your data from <code>/backup</code>.</li>
        <li>You can delete projects locally from the UI.</li>
      </ul>
      <p style={{ marginTop: 24 }}>
        This policy is intentionally concise. For details on storage and exports, see <a href="/docs/offline-first">Offline-first docs</a>.
      </p>
    
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Reality check</h2>
        <p className="text-sm opacity-90">
          Default stance: local-first storage. See <a className="underline" href="https://github.com">docs/data_model.md</a>.
          No server persistence or telemetry by default.
        </p>
      </section>

</main>
  );
}
