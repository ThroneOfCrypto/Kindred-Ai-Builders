"use client";

import React, { useMemo, useState } from "react";
import { Callout } from "./Callout";

type Props = {
  scope?: string;
  error: Error & { digest?: string };
  reset?: () => void;
};

function safeDetails(error: Error & { digest?: string }): string {
  const parts: string[] = [];
  const name = error?.name || "Error";
  const msg = error?.message || "(no message)";
  parts.push(`${name}: ${msg}`);
  if (error?.digest) parts.push(`digest: ${error.digest}`);
  return parts.join("\n");
}

export function ErrorScreen({ scope, error, reset }: Props) {
  const [copyMsg, setCopyMsg] = useState<string>("");

  const details = useMemo(() => safeDetails(error), [error]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(details);
      setCopyMsg("Copied.");
      setTimeout(() => setCopyMsg(""), 1200);
    } catch {
      setCopyMsg("Copy failed.");
      setTimeout(() => setCopyMsg(""), 1200);
    }
  }

  return (
    <div className="container" style={{ paddingTop: 28, paddingBottom: 28 }}>
      <div className="hero" style={{ paddingTop: 10 }}>
        <h1>{scope ? `${scope} error` : "Something went wrong"}</h1>
        <p>Recoverable error. Your browser data is unchanged unless you explicitly reset it.</p>
      </div>

      <Callout
        kind="error"
        title="What you can do next"
        actions={
          <div className="row">
            <a className="btn" href="/">Go Home</a>
            <button className="btn" onClick={() => window.location.reload()}>
              Reload
            </button>
            {reset && (
              <button className="btn primary" onClick={() => reset()}>
                Try again
              </button>
            )}
            <button className="btn" onClick={copy}>
              Copy error details
            </button>
            {copyMsg && <span className="small" style={{ alignSelf: "center" }}>{copyMsg}</span>}
          </div>
        }
      >
        <p className="small" style={{ marginTop: 0 }}>
          If this keeps happening, include the details below when reporting the issue.
        </p>
        <pre className="codeblock" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{details}</pre>
      </Callout>
    </div>
  );
}
