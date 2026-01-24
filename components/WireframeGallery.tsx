"use client";

import React from "react";
import { WireframePreview } from "./WireframePreview";

export function WireframeGallery(props: {
  title: string;
  pages: { id: string; title: string; sections: string[] }[];
  onSelectPage?: (pageId: string) => void;
  selectedPageId?: string;
}) {
  const { title, pages, onSelectPage, selectedPageId } = props;

  return (
    <div style={{ width: "100%" }}>
      <div className="badge">
        <strong>Gallery</strong> <span>{title}</span>
      </div>

      <div className="hr" />

      {pages.length === 0 ? (
        <p className="small">(no pages)</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {pages.map((p) => (
            <div
              key={p.id}
              className={["card", selectedPageId === p.id ? "active" : ""].join(" ")}
              style={{ cursor: onSelectPage ? "pointer" : "default" }}
              onClick={() => onSelectPage && onSelectPage(p.id)}
            >
              <WireframePreview title={p.title || p.id} sections={p.sections} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
