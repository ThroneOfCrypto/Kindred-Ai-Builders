"use client";

import "./globals.css";

import React from "react";
import { PrimaryButton, SecondaryButton } from "@/components/Buttons";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const digest = (error as any)?.digest ? String((error as any).digest) : "";

  return (
    <html>
      <body>
        <main>
          <div className="container">
            <div className="hero">
              <h1>Application error</h1>
              <p className="small">
                The app encountered an error. This screen intentionally omits stack traces to avoid leaking sensitive
                details.
              </p>
              {digest ? (
                <p className="small mb0">Reference digest: {digest}</p>
              ) : null}

              <div className="row mt2">
                <PrimaryButton onClick={() => reset()}>Try again</PrimaryButton>
                <SecondaryButton href="/director/ship">Go to Ship</SecondaryButton>
                <SecondaryButton href="/director/evidence">Open Evidence</SecondaryButton>
                <PrimaryButton onClick={() => window.location.reload()}>Reload</PrimaryButton>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
