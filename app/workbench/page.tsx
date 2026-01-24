"use client";

import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";

import { Callout } from "../../components/Callout";

const WorkbenchClient = dynamic(() => import("./WorkbenchClient"), { ssr: false });

// Workbench is the hands-on surface (including SPEL editing). It must be close by,
// but never the default posture for a beginner Director.
//
// Mechanically: we gate entry behind a deliberate click and store a local acknowledgement.
// No env-var required, so a live Vercel deployment can still support "delve deeper".

const ACK_KEY = "kindred.workbench_ack.v1";

function readAck(): boolean {
  try {
    return localStorage.getItem(ACK_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAck(v: boolean) {
  try {
    if (v) localStorage.setItem(ACK_KEY, "1");
    else localStorage.removeItem(ACK_KEY);
  } catch {
    // ignore
  }
}

export default function WorkbenchPage() {
  const [ack, setAck] = useState<boolean>(false);

  useEffect(() => {
    setAck(readAck());
  }, []);

  if (!ack) {
    return (
      <div className="page">
        <h1>Workbench</h1>
        <Callout title="Hands-on tools (advanced)" tone="warn">
          <p style={{ marginTop: 0 }}>
            This is the hands-on surface. It includes patch previews, pack diffs, and an SPEL editor.
            It is here for bold Directors who want to tweak to perfection.
          </p>
          <ul className="small" style={{ marginTop: 0 }}>
            <li>Everything still stays proposal-first: you compile into a Proposal Pack, review, then adopt.</li>
            <li>If you came here by accident, go back to Guided mode.</li>
          </ul>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                writeAck(true);
                setAck(true);
              }}
            >
              Enter Workbench
            </button>
            <a className="btn" href="/director">
              Back to Director
            </a>
          </div>
        </Callout>
        <p className="small" style={{ opacity: 0.85 }}>
          Tip: You can revoke access by clearing site data for this domain.
        </p>
      </div>
    );
  }

  return <WorkbenchClient />;
}
