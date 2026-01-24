"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

import { ProjectSwitcher } from "./ProjectSwitcher";
import { readUIMode, writeUIMode, UI_MODE_EVENT, type UIMode } from "../lib/ui_mode";
import { readGuidedMode, toggleGuidedMode, GUIDED_MODE_EVENT } from "../lib/guided_mode";
import { readAdvancedMode, toggleAdvancedMode, ADVANCED_MODE_EVENT } from "../lib/advanced_mode";

// Workbench is intentionally not part of the default Director navigation.
const WORKBENCH_PATH = "/workbench";

function modeLabel(mode: UIMode): string {
  return mode === "director" ? "Director Mode" : "Operator Mode";
}

function toggleText(mode: UIMode): string {
  return mode === "director" ? "Operator tools" : "Director";
}

export function TopNav() {
  const [mode, setMode] = useState<UIMode>("director");
  const [guided, setGuided] = useState<boolean>(true);
  const [advanced, setAdvanced] = useState<boolean>(false);

  useEffect(() => {
    try {
      setMode(readUIMode());
    } catch {
      setMode("director");
    }

    try {
      setGuided(readGuidedMode());
    } catch {
      setGuided(true);
    }

    try {
      setAdvanced(readAdvancedMode());
    } catch {
      setAdvanced(false);
    }
  }, []);

  useEffect(() => {
    const on = () => {
      try {
        setMode(readUIMode());
      } catch {
        // ignore
      }
    };
    window.addEventListener(UI_MODE_EVENT, on as any);
    return () => window.removeEventListener(UI_MODE_EVENT, on as any);
  }, []);

  useEffect(() => {
    const on = () => {
      try {
        setGuided(readGuidedMode());
      } catch {
        // ignore
      }
    };
    window.addEventListener(GUIDED_MODE_EVENT, on as any);
    return () => window.removeEventListener(GUIDED_MODE_EVENT, on as any);
  }, []);

  useEffect(() => {
    const on = () => {
      try {
        setAdvanced(readAdvancedMode());
      } catch {
        // ignore
      }
    };
    window.addEventListener(ADVANCED_MODE_EVENT, on as any);
    return () => window.removeEventListener(ADVANCED_MODE_EVENT, on as any);
  }, []);

  function toggleMode(e: React.MouseEvent) {
    e.preventDefault();
    const next: UIMode = mode === "director" ? "operator" : "director";
    writeUIMode(next);
    setMode(next);
  }

  function toggleGuided(e: React.MouseEvent) {
    e.preventDefault();
    // Guard: Guided OFF only makes sense when advanced tools are unlocked.
    if (!advanced) {
      const next = toggleAdvancedMode();
      setAdvanced(next);
      return;
    }
    const next = toggleGuidedMode();
    setGuided(next);
  }

  function unlockAdvanced(e: React.MouseEvent) {
    e.preventDefault();
    const next = toggleAdvancedMode();
    setAdvanced(next);
  }

  return (
    <div className="nav">
      <Link href="/director">
        <strong>Kindred AI Builders</strong>
      </Link>

      <div className="row">
        {mode === "director" ? (
          <>
            {/* Director-safe links only */}
            <Link href="/director/connect-ai">Connect AI</Link>
            <Link href="/director/start">Start</Link>
            <Link href="/director/journey">Journey</Link>
            <Link href="/director/ship">Ship</Link>

            {!advanced ? (
              <button
                type="button"
                className="linklike"
                onClick={unlockAdvanced}
                title="Unlock advanced tools (hidden by default)"
              >
                Advanced
              </button>
            ) : (
              <details className="nav_more">
                <summary>More</summary>
                <div className="nav_menu">
                  <button type="button" className="linklike" onClick={toggleGuided}>
                    {guided ? "Disable Guided mode" : "Enable Guided mode"}
                  </button>
                  <div className="nav_divider" />

                  <Link href="/marketplace">Marketplace</Link>
                  <Link href="/builder/new?mode=director">Guided Build</Link>
                  <Link href="/director/preview">Preview</Link>
                  <Link href="/director/proposals">Proposals</Link>
                  <Link href="/director/library-lock">Library Lock</Link>

                  <div className="nav_divider" />
                  <Link href="/director/editor">Editor</Link>
                  <Link href="/director/blueprints">Blueprints</Link>
                  <Link href="/director/libraries">Building Blocks (Libraries)</Link>
                  <Link href="/director/patterns">Reusable Features (Patterns)</Link>
                  <Link href="/director/kits">Bindings (Kits)</Link>
                  <Link href={WORKBENCH_PATH}>Workbench (hands-on)</Link>

                  <div className="nav_divider" />
                  <Link href="/verify">Verify</Link>
                  <Link href="/feedback">Feedback</Link>
                  <Link href="/director/failures">Failures</Link>
                  <Link href="/backup">Backup</Link>
                  <Link href="/release-checklist">Release checklist</Link>
                  <Link href="/docs/director">Docs</Link>
                  <Link href="/support">Support</Link>
                  <Link href="/privacy">Privacy</Link>
                  <Link href="/terms">Terms</Link>
                </div>
              </details>
            )}

            <button
              type="button"
              className="linklike"
              onClick={toggleMode}
              aria-pressed={mode !== "director"}
              title={`Switch to ${mode === "director" ? "Operator" : "Director"} mode`}
            >
              {toggleText(mode)}
            </button>
            <span className="badge badge--static">
              <strong>{modeLabel(mode)}</strong>
            </span>
          </>
        ) : (
          <>
            <Link href="/operator">Home</Link>
            <Link href="/builder/new">Builder</Link>
            <Link href={WORKBENCH_PATH}>Workbench</Link>
            <Link href="/backup">Backup</Link>
            <Link href="/repo">Repos</Link>
            <Link href="/release-checklist">Release</Link>
            <Link href="/verify">Verify</Link>
            <Link href="/feedback">Feedback</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/advanced">Advanced</Link>
            <Link href="/ai">AI Status</Link>
            <Link href="/support">Support</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/about">About</Link>

            <button
              type="button"
              className="linklike"
              onClick={toggleMode}
              aria-pressed={mode !== "director"}
              title={`Switch to ${mode === "director" ? "Operator" : "Director"} mode`}
            >
              {toggleText(mode)}
            </button>
            <span className="badge badge--static">
              <strong>{modeLabel(mode)}</strong>
            </span>
          </>
        )}

        <ProjectSwitcher />
      </div>
    </div>
  );
}
