"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { joinJsonPointer, parseJsonPointer } from "../lib/json_pointer";

type ExpandedSet = Set<string>;

export type JsonTreeProps = {
  data: any;
  selectedPointer?: string | null;
  onSelectPointer?: (ptr: string) => void;
  maxAutoExpandDepth?: number;
};

function isObject(x: any): x is Record<string, any> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function previewValue(v: any): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") {
    const s = v.length > 120 ? v.slice(0, 117) + "..." : v;
    return JSON.stringify(s);
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (isObject(v)) return `{${Object.keys(v).length}}`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function pointerPrefixes(ptr: string | null | undefined): string[] {
  const tokens = parseJsonPointer(ptr);
  const prefixes: string[] = [""];
  const cur: (string | number)[] = [];
  for (const t of tokens) {
    cur.push(t);
    prefixes.push(joinJsonPointer(cur));
  }
  return prefixes;
}

export function JsonTree({ data, selectedPointer, onSelectPointer, maxAutoExpandDepth = 6 }: JsonTreeProps) {
  const nodeRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [expanded, setExpanded] = useState<ExpandedSet>(() => new Set([""]));

  const initialExpanded = useMemo(() => {
    const set = new Set<string>();
    set.add("");
    // Default expand a few levels for readability.
    const queue: Array<{ value: any; pointer: string; depth: number }> = [{ value: data, pointer: "", depth: 0 }];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.depth >= maxAutoExpandDepth) continue;
      if (Array.isArray(cur.value)) {
        set.add(cur.pointer);
        for (let i = 0; i < Math.min(cur.value.length, 3); i++) {
          queue.push({ value: cur.value[i], pointer: joinJsonPointer([...parseJsonPointer(cur.pointer), String(i)]), depth: cur.depth + 1 });
        }
      } else if (isObject(cur.value)) {
        set.add(cur.pointer);
        const keys = Object.keys(cur.value).slice(0, 8);
        for (const k of keys) {
          queue.push({ value: cur.value[k], pointer: joinJsonPointer([...parseJsonPointer(cur.pointer), k]), depth: cur.depth + 1 });
        }
      }
    }
    return set;
  }, [data, maxAutoExpandDepth]);

  // Reset expansion when data changes.
  useEffect(() => {
    setExpanded(new Set(initialExpanded));
  }, [initialExpanded]);

  // Auto-expand to selected pointer.
  useEffect(() => {
    if (!selectedPointer) return;
    const prefixes = pointerPrefixes(selectedPointer);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const p of prefixes) next.add(p);
      return next;
    });
  }, [selectedPointer]);

  // Scroll selected node into view.
  useEffect(() => {
    if (!selectedPointer) return;
    const el = nodeRefs.current.get(selectedPointer);
    if (!el) return;
    // Use a microtask so the expanded subtree is rendered before scroll.
    queueMicrotask(() => {
      try {
        el.scrollIntoView({ block: "center" });
      } catch {
        // ignore
      }
    });
  }, [selectedPointer]);

  function toggle(pointer: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pointer)) next.delete(pointer);
      else next.add(pointer);
      return next;
    });
  }

  function setRef(pointer: string) {
    return (el: HTMLDivElement | null) => {
      nodeRefs.current.set(pointer, el);
    };
  }

  function renderNode(value: any, pointer: string, keyLabel: string | null, depth: number): React.ReactNode {
    const isSelected = Boolean(selectedPointer && selectedPointer === pointer);
    const hasChildren = Array.isArray(value) ? value.length > 0 : isObject(value) ? Object.keys(value).length > 0 : false;
    const isExpanded = expanded.has(pointer);

    const indent = depth * 14;

    return (
      <div key={pointer} ref={setRef(pointer)} className={"json-node" + (isSelected ? " json-node-selected" : "")} style={{ marginLeft: indent }}>
        <div
          className="json-line"
          onClick={() => {
            if (onSelectPointer) onSelectPointer(pointer);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (onSelectPointer) onSelectPointer(pointer);
            }
          }}
        >
          {hasChildren ? (
            <button
              className="json-toggle"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle(pointer);
              }}
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="json-toggle-placeholder" />
          )}

          {keyLabel !== null ? <span className="json-key">{JSON.stringify(keyLabel)}</span> : <span className="json-key">(root)</span>}
          <span className="json-sep">: </span>
          <span className="json-value">{previewValue(value)}</span>
          <span className="json-pointer">{pointer || ""}</span>
        </div>

        {hasChildren && isExpanded ? (
          <div className="json-children">
            {Array.isArray(value)
              ? value.map((v, idx) => renderNode(v, joinJsonPointer([...parseJsonPointer(pointer), String(idx)]), String(idx), depth + 1))
              : Object.keys(value)
                  .sort((a, b) => a.localeCompare(b))
                  .map((k) => renderNode(value[k], joinJsonPointer([...parseJsonPointer(pointer), k]), k, depth + 1))}
          </div>
        ) : null}
      </div>
    );
  }

  return <div className="json-tree">{renderNode(data, "", null, 0)}</div>;
}
