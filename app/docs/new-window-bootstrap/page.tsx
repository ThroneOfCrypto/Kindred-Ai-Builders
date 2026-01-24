import Link from "next/link";

export default function DocsNewWindowBootstrapPage() {
  return (
    <div className="container">
      <div className="hero">
        <h1>New window bootstrap</h1>
        <p>This content is not published in this docs surface.</p>
      </div>

      <div className="row">
        <Link className="btn" href="/docs">Open Docs</Link>
      </div>
    </div>
  );
}
