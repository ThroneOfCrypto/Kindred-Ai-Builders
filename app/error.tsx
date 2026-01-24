"use client";

import React from "react";
import { PrimaryButton, SecondaryButton } from "@/components/Buttons";
import { Callout } from "@/components/Callout";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Do not render stack traces; keep user-safe.
  const digest = (error as any)?.digest ? String((error as any).digest) : "";

  return (
    <main>
      <div className="container">
        <div className="hero">
          <h1>Something went wrong</h1>
          <p className="small">
            An unexpected error occurred. Please retry. If this keeps happening, capture the steps you took and share
            them with Support.
          </p>

          {digest ? (
            <Callout title="Reference" tone="info" compact>
              <div className="small">Error digest: {digest}</div>
            </Callout>
          ) : null}

          <div className="row mt2">
            <PrimaryButton onClick={() => reset()}>Try again</PrimaryButton>
            <PrimaryButton onClick={() => window.location.reload()}>Reload</PrimaryButton>
            <SecondaryButton href="/director/ship">Go to Ship</SecondaryButton>
            <SecondaryButton href="/director/evidence">Open Evidence</SecondaryButton>
          </div>
        </div>
      </div>
    </main>
  );
}
