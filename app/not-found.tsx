import React from "react";
import { SecondaryButton } from "@/components/Buttons";
import { Callout } from "@/components/Callout";

export default function NotFound() {
  return (
    <main>
      <div className="container">
        <div className="hero">
          <h1>Page not found</h1>
          <p className="small">
            The page you requested does not exist. If you followed a link from inside the app, it may be stale.
          </p>

          <Callout
            kind="info"
            title="Next steps"
            details={[
              "Return to Ship to generate a proof bundle and re-run gates.",
              "Open Evidence to view reports and artefacts.",
            ]}
            compact
          />

          <div className="row mt2">
            <SecondaryButton href="/director/ship">Go to Ship</SecondaryButton>
            <SecondaryButton href="/director/evidence">Open Evidence</SecondaryButton>
            <SecondaryButton href="/">Home</SecondaryButton>
          </div>
        </div>
      </div>
    </main>
  );
}
