"use client";

import React from "react";
import type { BuildIntentId, PaletteId } from "../lib/types";
import { OPTIONS_V1 } from "../lib/options";
import { PALETTE_GROUPS_V1 } from "../lib/palette_groups";
import { SecondaryButton } from "./Buttons";

export type PaletteCardV1 = {
  id: PaletteId;
  label: string;
  why: string;
  tags?: string[];
};

export function OptionsPicker(props: {
  value?: BuildIntentId;
  onChange: (next: BuildIntentId) => void;
}) {
  const current = props.value ?? "website";
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {OPTIONS_V1.map((opt) => {
        const active = opt.id === current;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => props.onChange(opt.id)}
            className={[
              "rounded-2xl border p-3 text-left transition",
              active ? "border-black bg-white shadow-sm" : "border-neutral-200 bg-neutral-50 hover:bg-white",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold">{opt.label}</div>
              <div className={["text-xs px-2 py-1 rounded-full", active ? "bg-black text-white" : "bg-neutral-200 text-neutral-800"].join(" ")}>
                Option
              </div>
            </div>
            <div className="mt-1 text-sm text-neutral-700">{opt.why}</div>
          </button>
        );
      })}
    </div>
  );
}

export function PalettesPicker(props: {
  value: PaletteId[];
  onChange: (next: PaletteId[]) => void;
  catalog: PaletteCardV1[];
  recommended?: PaletteId[];
  why?: string[];
}) {
  const current = Array.isArray(props.value) ? props.value : [];
  const recommended = Array.isArray(props.recommended) ? props.recommended : [];
  const recSet = new Set(recommended);

  const byId = React.useMemo(() => {
    const m = new Map<PaletteId, PaletteCardV1>();
    for (const c of Array.isArray(props.catalog) ? props.catalog : []) {
      m.set(c.id, c);
    }
    return m;
  }, [props.catalog]);

  function toggle(id: PaletteId) {
    const exists = current.includes(id);
    const next = exists ? current.filter((x) => x !== id) : current.concat([id]);
    props.onChange(next);
  }

  function applyRecommended() {
    const merged = Array.from(new Set([...current, ...recommended]));
    props.onChange(merged);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-neutral-700">
          Pick Palettes to steer composition. Keep it compact; you can always add more later.
        </div>
        {recommended.length > 0 ? (
          <SecondaryButton onClick={applyRecommended}>Apply recommended</SecondaryButton>
        ) : null}
      </div>

      {props.why && props.why.length > 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
          <div className="font-semibold text-neutral-900">Why these recommendations</div>
          <ul className="mt-1 list-disc pl-5">
            {props.why.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {(
        Object.entries(PALETTE_GROUPS_V1) as Array<[string, { label: string; palette_ids: PaletteId[] }]>
      ).map(([gid, group]) => {
        const cards = group.palette_ids
          .map((id) => byId.get(id))
          .filter(Boolean) as PaletteCardV1[];

        return (
          <div key={gid} className="space-y-2">
            <div className="text-sm font-semibold text-neutral-900">{group.label}</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {cards.map((p) => {
                const active = current.includes(p.id);
                const rec = recSet.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={[
                      "rounded-2xl border p-3 text-left transition",
                      active ? "border-black bg-white shadow-sm" : "border-neutral-200 bg-neutral-50 hover:bg-white",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-base font-semibold">{p.label}</div>
                      <div className="flex items-center gap-2">
                        {rec ? <span className="rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-900">Recommended</span> : null}
                        <span
                          className={[
                            "rounded-full px-2 py-1 text-xs",
                            active ? "bg-black text-white" : "bg-neutral-200 text-neutral-800",
                          ].join(" ")}
                        >
                          Palette
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-neutral-700">{p.why}</div>
                    {Array.isArray(p.tags) && p.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {p.tags.slice(0, 6).map((t) => (
                          <span key={t} className="rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-900">
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
