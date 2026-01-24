"use client";

import React, { useState } from "react";

export function ImportPinButton({ href, filename }: { href: string; filename: string }) {
  const [status, setStatus] = useState<string>("");

  async function onClick() {
    setStatus("Fetching…");
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("Downloaded");
      setTimeout(() => setStatus(""), 1200);
    } catch {
      setStatus("Failed");
      setTimeout(() => setStatus(""), 1500);
    }
  }

  return (
    <div className="row row_center">
      <button type="button" className="btn" onClick={onClick}>
        Download import pin
      </button>
      {status ? <span className="muted">{status}</span> : null}
    </div>
  );
}
