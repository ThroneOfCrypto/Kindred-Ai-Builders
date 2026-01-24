"use client";

import React from "react";

import { domainsForPalettes, normalizeDomainIds, type DomainCardV1 } from "../lib/domains";
import type { DomainId, PaletteId } from "../lib/types";

export function DomainsPicker(props: {
  selected_palette_ids: PaletteId[];
  domain_ids: DomainId[];
  onChange: (ids: DomainId[]) => void;
}) {
  const available: DomainCardV1[] = props.selected_palette_ids.length > 0 ? domainsForPalettes(props.selected_palette_ids) : [];
  const availableIds = new Set(available.map((d) => d.id));

  const selected = normalizeDomainIds(props.domain_ids);
  const selectedVisible = selected.filter((id) => availableIds.has(id));

  function toggle(id: DomainId) {
    const set = new Set(selected);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    props.onChange(Array.from(set).sort((a, b) => a.localeCompare(b)));
  }

  function selectAllVisible() {
    const set = new Set(selected);
    for (const d of available) set.add(d.id);
    props.onChange(Array.from(set).sort((a, b) => a.localeCompare(b)));
  }

  function clearVisible() {
    const next = selected.filter((id) => !availableIds.has(id));
    props.onChange(normalizeDomainIds(next));
  }

  if (props.selected_palette_ids.length === 0) {
    return (
      <div className="text-sm text-zinc-400">
        Select at least one Palette first. Domains are a drill-down layer, not a replacement.
      </div>
    );
  }

  if (available.length === 0) {
    return (
      <div className="text-sm text-zinc-400">
        No Domains match your selected Palettes (yet). That is either discipline or a backlog.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-zinc-400">
          Showing <span className="text-zinc-200">{available.length}</span> domains for the current Palette set.
          {selectedVisible.length > 0 ? (
            <>
              {" "}
              Selected (visible): <span className="text-zinc-200">{selectedVisible.length}</span>
            </>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button className="btn btn-xs" onClick={selectAllVisible} type="button">
            Select all visible
          </button>
          <button className="btn btn-xs" onClick={clearVisible} type="button">
            Clear visible
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {available.map((d) => {
          const on = selected.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => toggle(d.id)}
              className={
                "text-left rounded border p-3 transition " +
                (on ? "border-emerald-500/50 bg-emerald-500/10" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-zinc-100">{d.label}</div>
                  <div className="mt-1 text-xs text-zinc-400">{d.id}</div>
                </div>
                <div className={"text-xs px-2 py-1 rounded " + (on ? "bg-emerald-500/15 text-emerald-200" : "bg-zinc-800 text-zinc-300")}>{on ? "Selected" : "Pick"}</div>
              </div>

              {d.intent ? <div className="mt-2 text-sm text-zinc-300">{d.intent}</div> : null}

              {d.outputs && d.outputs.length > 0 ? (
                <div className="mt-2 text-xs text-zinc-400">
                  Outputs: <span className="text-zinc-200">{d.outputs.join(", ")}</span>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="text-xs text-zinc-500">
        Note: This is a deterministic drill-down. It compiles into <span className="text-zinc-300">intent/domains.json</span> + <span className="text-zinc-300">spel/domains.spel</span>
        when you generate a proposal.
      </div>
    </div>
  );
}
