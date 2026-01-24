"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

import { Panel } from "./Panel";
import { Callout } from "./Callout";

const AI_CONN_KEY_V2 = "kindred.ai.connection.v2";
const AI_CONN_KEY_V1 = "kindred.ai.connection.v1";
const JOURNEY_KEY = "kindred.director_journey.v1";
const BF_KEY = "kindred.brownfield.v1";

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function isAiConnected(): boolean {
  try {
    const v2 = safeJsonParse<any>(localStorage.getItem(AI_CONN_KEY_V2));
    if (v2 && v2.connected) return true;
    const v1 = safeJsonParse<any>(localStorage.getItem(AI_CONN_KEY_V1));
    if (v1 && v1.connected) return true;
    return false;
  } catch {
    return false;
  }
}

function readStartHref(): string {
  // "Start" means: begin the guided journey from the correct entrypoint.
  return isAiConnected() ? "/director/start" : "/director/connect-ai";
}

function readContinueHref(): string {
  try {
    // 1) If there's a Journey state, go straight back to it.
    const journey = safeJsonParse<any>(localStorage.getItem(JOURNEY_KEY));
    if (journey && typeof journey === "object" && typeof journey.step === "number") {
      return "/director/journey";
    }

    // 2) If there is a brownfield import, go to import.
    const bf = safeJsonParse<any>(localStorage.getItem(BF_KEY));
    if (bf && typeof bf === "object" && bf.git_url) {
      return "/director/import";
    }

    // 3) If AI is connected, next best step is Start/Import.
    return isAiConnected() ? "/director/start" : "/director/connect-ai";
  } catch {
    return "/director/connect-ai";
  }
}

export function DirectorHome() {
  const [startHref, setStartHref] = useState<string>("/director/connect-ai");
  const [continueHref, setContinueHref] = useState<string>("/director/connect-ai");

  useEffect(() => {
    const refresh = () => {
      setStartHref(readStartHref());
      setContinueHref(readContinueHref());
    };
    refresh();
    window.addEventListener("kindred_ai_connection_changed", refresh as any);
    window.addEventListener("storage", refresh as any);
    return () => {
      window.removeEventListener("kindred_ai_connection_changed", refresh as any);
      window.removeEventListener("storage", refresh as any);
    };
  }, []);

  return (
    <div className="container">
      <div className="hero">
        <h1>Your project</h1>
        <p>Answer a few plain questions. We’ll propose options you can preview and compare. Then you choose what to ship.</p>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <Link className="btn" href={startHref}>
            Start
          </Link>
          <Link className="btn secondary" href={continueHref}>
            Continue
          </Link>
        </div>
      </div>

      <div className="grid">
        <Callout title="One simple journey" tone="info">
          <p className="small" style={{ margin: 0 }}>
            You’ll never be asked to “pick a database” or “design a workflow engine.” You choose what you want the business to do.
            The system fills in the boring-but-important safety details.
          </p>
        </Callout>

        <Panel title="What happens next">
          <div className="cards">
            <Link className="card active" href="/director/connect-ai">
              <h3>1) Connect AI</h3>
              <p>Subscription sign-in is the default. API keys are hidden behind Advanced.</p>
            </Link>
            <Link className="card" href="/director/start">
              <h3>2) Welcome</h3>
              <p>Pick how you want to begin: start fresh or import an existing repo.</p>
            </Link>
            <Link className="card" href="/director/journey">
              <h3>3) Journey & ship</h3>
              <p>Generate proposals, refine the plan, then ship and export to GitHub through the local connector.</p>
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
