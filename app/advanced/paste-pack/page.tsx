import fs from "node:fs";
import path from "node:path";

import { Panel } from "../../../components/Panel";

function readDistFile(rel: string): string | null {
  try {
    const abs = path.join(process.cwd(), "dist", rel);
    if (!fs.existsSync(abs)) return null;
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

export default function AdvancedPastePackPage() {
  const md = readDistFile("paste_pack.md");
  const diff = readDistFile("patch.diff");
  const changeset = readDistFile("changeset.json");

  return (
    <div className="container">
      <div className="hero">
        <h1>Paste Pack (advanced)</h1>
        <p>
          This viewer shows the most recent Paste Pack outputs in <code>dist/</code>. Generate it via{" "}
          <code>npm run publish_ready</code>.
        </p>
      </div>

      <div className="grid2">
        <Panel title="paste_pack.md">
          <pre style={{ whiteSpace: "pre-wrap" }}>{md || "(missing) Run: npm run publish_ready"}</pre>
        </Panel>

        <Panel title="patch.diff">
          <pre style={{ whiteSpace: "pre-wrap" }}>{diff || "(missing) Run: npm run publish_ready"}</pre>
        </Panel>

        <Panel title="changeset.json">
          <pre style={{ whiteSpace: "pre-wrap" }}>{changeset || "(missing) Run: npm run publish_ready"}</pre>
        </Panel>
      </div>
    </div>
  );
}
