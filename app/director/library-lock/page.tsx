"use client";

import React, { useEffect, useMemo, useState } from "react";

import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { PrimaryButton, SecondaryButton } from "../../../components/Buttons";

import { clearSelection, loadSelection, removeFromSelection, selectionEventName, type LibrarySelectionItem } from "../../../lib/library_selection";

function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
  const blob = new Blob([bytes], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 800);
}

async function buildLockfile(items: LibrarySelectionItem[]): Promise<{ ok: boolean; lockText?: string; error?: string }>
{
  try {
    const resp = await fetch("/api/library/lockfile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const j = await resp.json();
    if (!j?.ok || !j?.lock) return { ok: false, error: "Lockfile generation failed" };
    return { ok: true, lockText: JSON.stringify(j.lock, null, 2) + "\n" };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e || "unknown error") };
  }
}

export default function DirectorLibraryLockPage() {
  const [items, setItems] = useState<LibrarySelectionItem[]>(() => loadSelection());
  const [notice, setNotice] = useState<{ tone: "info" | "warn" | "danger"; title: string; details?: string[] } | null>(null);

  useEffect(() => {
    const refresh = () => setItems(loadSelection());
    refresh();
    const ev = selectionEventName();
    window.addEventListener(ev, refresh);
    return () => window.removeEventListener(ev, refresh);
  }, []);

  const count = items.length;

  const preview = useMemo(() => items.map((x) => `${x.type}/${x.slug}`), [items]);

  async function onDownloadLockfile() {
    setNotice({ tone: "info", title: "Generating lockfile…" });
    const r = await buildLockfile(items);
    if (!r.ok || !r.lockText) {
      setNotice({ tone: "danger", title: r.error || "Failed", details: ["Could not generate lockfile."] });
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    downloadBytes(`library.lock__${date}.json`, new TextEncoder().encode(r.lockText), "application/json");
    setNotice({ tone: "info", title: "Lockfile downloaded", details: [`entries: ${count}`] });
  }

  function onRemove(it: LibrarySelectionItem) {
    removeFromSelection(it);
  }

  function onClear() {
    clearSelection();
    setNotice({ tone: "warn", title: "Selection cleared" });
  }

  return (
    <div className="container">
      <div className="hero">
        <h1>Library Lock</h1>
        <p>
          Your Marketplace selection becomes a deterministic <code>library.lock.json</code> that Proof Lane can apply before running builds.
        </p>
      </div>

      {notice ? (
        <Callout title={notice.title} tone={notice.tone}>
          {notice.details?.length ? <pre className="prewrap">{notice.details.join("\n")}</pre> : null}
        </Callout>
      ) : null}

      <Panel title="Current selection" subtitle={`${count} item(s)`} actions={<a href="/marketplace">Open Marketplace</a>}>
        {count === 0 ? (
          <p className="small">No items selected yet.</p>
        ) : (
          <ul className="list">
            {items.map((it) => (
              <li key={`${it.type}/${it.slug}`} className="list_item">
                <span>
                  <code>{it.type}/{it.slug}</code>
                </span>
                <button type="button" className="btn secondary" onClick={() => onRemove(it)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {count > 0 ? (
          <>
            <div className="hr" />
            <div className="row">
              <PrimaryButton onClick={onDownloadLockfile}>Download lockfile</PrimaryButton>
              <SecondaryButton onClick={onClear}>Clear selection</SecondaryButton>
              <SecondaryButton href="/director/proof-request">Go to Proof Request</SecondaryButton>
            </div>
            <div className="hr" />
            <p className="small">Preview:</p>
            <pre className="codeblock">{preview.join("\n")}</pre>
          </>
        ) : (
          <div className="row">
            <SecondaryButton href="/director">Back to Director</SecondaryButton>
          </div>
        )}
      </Panel>
    </div>
  );
}
