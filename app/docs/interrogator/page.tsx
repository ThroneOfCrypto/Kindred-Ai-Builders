import React from "react";
import { readDocFile } from "../../../lib/read_doc_file";

export default function DocsInterrogatorPage() {
  const md = readDocFile("INTERROGATOR.md");
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <h1>Interrogator</h1>
      <div className="md" dangerouslySetInnerHTML={{ __html: md.html }} />
    </main>
  );
}
