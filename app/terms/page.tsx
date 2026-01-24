import React from "react";

export default function TermsPage() {
  return (
    <main className="container" style={{ padding: "24px 0" }}>
      <h1>Terms</h1>
      <p>
        Kindred AI Builders is provided “as-is” for learning and product iteration. It helps you generate and manage
        deterministic artefacts (packs, hashes, evidence).
      </p>
      <h2>No guarantees</h2>
      <ul>
        <li>No warranty of fitness for a particular purpose.</li>
        <li>No guarantee that generated artefacts are error-free.</li>
      </ul>
      <h2>Safety boundaries</h2>
      <ul>
        <li>AI is proposal-only; you are responsible for adoption and shipping decisions.</li>
        <li>Do not submit secrets to debug logs or AI prompts.</li>
      </ul>
      <h2>Liability</h2>
      <p>
        To the maximum extent permitted by law, the authors are not liable for damages arising from the use of this
        software.
      </p>
      <p style={{ marginTop: 24 }}>
        See <a href="/docs/security">Security docs</a> for recommended operating practices.
      </p>
    
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Reality check</h2>
        <p className="text-sm opacity-90">
          This product is local-first by default. Exports are user-triggered. See <a className="underline" href="https://github.com">docs/data_model.md</a>.
        </p>
      </section>

</main>
  );
}
