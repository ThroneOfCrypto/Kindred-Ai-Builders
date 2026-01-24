import React from "react";
import { readDocFile } from "../../../lib/read_doc_file";

export default function DocsPreviewPage() {
  const md = readDocFile("PREVIEW.md");
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <h1>Preview</h1>
      <div className="md" dangerouslySetInnerHTML={{ __html: md.html }} />
    </main>
  );
}
