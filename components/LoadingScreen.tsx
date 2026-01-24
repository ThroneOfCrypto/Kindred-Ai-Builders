import React from "react";

export function LoadingScreen({ title, hint }: { title?: string; hint?: string }) {
  return (
    <div className="container" style={{ paddingTop: 28, paddingBottom: 28 }}>
      <div className="panel" style={{ textAlign: "center" }}>
        <div className="loadingSpinner" aria-hidden="true" />
        <h2 style={{ margin: "12px 0 6px 0" }}>{title || "Loading"}</h2>
        <p className="small" style={{ margin: 0 }}>{hint || "Preparing your workspace..."}</p>
      </div>
    </div>
  );
}
