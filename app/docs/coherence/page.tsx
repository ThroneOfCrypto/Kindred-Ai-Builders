import React from "react";
import { readDocFile } from "../../../lib/read_doc_file";

export default function DocsCoherencePage() {
  const md = readDocFile("COHERENCE_CHECK.md");
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <h1>Coherence check</h1>
      <div className="md" dangerouslySetInnerHTML={{ __html: md.html }} />
    </main>
  );
}
