"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Panel } from "../../../components/Panel";
import { Callout } from "../../../components/Callout";
import { getCurrentProjectId, loadProjectStateById, saveProjectStateById } from "../../../lib/state";
import type { ProjectState } from "../../../lib/types";
import { SECTION_LIBRARY, labelForSection, type SectionId } from "../../../lib/section_library";
import { ensureUiBasket, addToUiBasket, removeFromUiBasket, planFromBasket } from "../../../lib/ui_basket";

export default function DirectorBrowsePage() {
  const [projectId, setProjectId] = useState<string>("");
  const [state, setState] = useState<ProjectState | null>(null);
  const [query, setQuery] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const pid = getCurrentProjectId();
    setProjectId(pid);
    const st = loadProjectStateById(pid);
    setState(st);
    const on = () => setState(loadProjectStateById(pid));
    window.addEventListener("kindred_state_changed", on as any);
    return () => window.removeEventListener("kindred_state_changed", on as any);
  }, []);

  const basket = useMemo(() => (state ? ensureUiBasket(state) : null), [state]);
  const basketSet = useMemo(() => new Set((basket?.section_ids || []) as string[]), [basket]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTION_LIBRARY;
    return SECTION_LIBRARY.filter((x) => x.label.toLowerCase().includes(q) || x.id.toLowerCase().includes(q));
  }, [query]);

  function persist(nextBasket: any, patchPlan?: boolean) {
    if (!state) return;
    const next: any = {
      ...state,
      director: {
        ...(state as any).director,
        schema: "kindred.director_state.v1",
        ui_basket_v1: nextBasket,
      },
    };
    if (patchPlan) {
      next.director.ui_basket_v1.last_plan = planFromBasket(nextBasket.section_ids || []);
    }
    saveProjectStateById(projectId, next);
    setState(next);
    try {
      window.dispatchEvent(new CustomEvent("kindred_state_changed"));
    } catch {
      // ignore
    }
  }

  if (!state || !basket) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold">Browse</h1>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Browse components</h1>
        <p className="text-sm text-muted-foreground">
          Bookmark components into a basket, then generate a deterministic storyboard-style placement plan. This is Bootstrap-level UX
          and intentionally avoids hidden magic.
        </p>
      </header>

      <Callout kind="note" title="What this is">
        This is a lightweight browsing surface inspired by component libraries and swipe/reference tools. The basket is a preference anchor
        that can be used by proposal engines later, without turning the Director journey into an infinite design rabbit hole.
      </Callout>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Library" subtitle="Search and add to basket">
          <div className="space-y-3">
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Search components…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
              {filtered.map((s) => {
                const inBasket = basketSet.has(s.id);
                return (
                  <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.id}</div>
                    </div>
                    <button
                      className={`text-sm px-3 py-1 rounded-lg border ${inBasket ? "opacity-60" : "hover:bg-muted"}`}
                      onClick={() => {
                        if (inBasket) return;
                        const nextBasket = addToUiBasket(basket, s.id as SectionId);
                        persist(nextBasket);
                        setStatus(`Added: ${s.label}`);
                      }}
                      disabled={inBasket}
                    >
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel title="Basket" subtitle="Your bookmarked components">
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{basket.section_ids.length} items</div>
            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {basket.section_ids.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nothing here yet.</div>
              ) : (
                basket.section_ids.map((id) => (
                  <div key={id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{labelForSection(id)}</div>
                      <div className="text-xs text-muted-foreground">{id}</div>
                    </div>
                    <button
                      className="text-sm px-3 py-1 rounded-lg border hover:bg-muted"
                      onClick={() => {
                        const nextBasket = removeFromUiBasket(basket, id as SectionId);
                        persist(nextBasket);
                        setStatus(`Removed: ${labelForSection(id)}`);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                className="text-sm px-3 py-2 rounded-xl border hover:bg-muted"
                onClick={() => {
                  const planned = planFromBasket(basket.section_ids || []);
                  const nextBasket: any = { ...basket, last_plan: planned };
                  persist(nextBasket, false);
                  setStatus(`Generated placement plan (${planned.screens.length} screens)`);
                }}
              >
                Generate placement plan
              </button>
              <button
                className="text-sm px-3 py-2 rounded-xl border hover:bg-muted"
                onClick={() => {
                  persist({ schema: "kindred.director_ui_basket.v1", section_ids: [] });
                  setStatus("Cleared basket");
                }}
              >
                Clear
              </button>
            </div>
            {status ? <div className="text-xs text-muted-foreground">{status}</div> : null}
          </div>
        </Panel>

        <Panel title="Placement plan" subtitle="Deterministic storyboard">
          {!basket.last_plan ? (
            <div className="text-sm text-muted-foreground">Generate a placement plan to see a storyboard sequence.</div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">Generated {new Date(basket.last_plan.generated_at_utc).toLocaleString()}</div>
              {basket.last_plan.screens.map((scr) => (
                <div key={scr.id} className="rounded-2xl border p-3 space-y-2">
                  <div className="font-medium">{scr.title}</div>
                  <ol className="list-decimal pl-5 text-sm">
                    {scr.section_ids.map((sid) => (
                      <li key={sid}>{labelForSection(sid)}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <footer className="text-sm">
        <Link href="/director" className="underline">
          Back to Director
        </Link>
      </footer>
    </main>
  );
}
