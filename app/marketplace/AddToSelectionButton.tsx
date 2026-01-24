"use client";

import React, { useEffect, useState } from "react";
import { addToSelection, removeFromSelection, selectionEventName, selectionIncludes } from "../../lib/library_selection";

export function AddToSelectionButton({ type, slug }: { type: string; slug: string }) {
  const item = { type, slug };
  const [selected, setSelected] = useState<boolean>(false);

  useEffect(() => {
    const refresh = () => setSelected(selectionIncludes(item));
    refresh();
    const ev = selectionEventName();
    window.addEventListener(ev, refresh);
    return () => window.removeEventListener(ev, refresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, slug]);

  function onToggle() {
    if (selectionIncludes(item)) removeFromSelection(item);
    else addToSelection(item);
    setSelected(selectionIncludes(item));
  }

  return (
    <button type="button" className={`btn ${selected ? "secondary" : ""}`} onClick={onToggle}>
      {selected ? "Selected" : "Add to selection"}
    </button>
  );
}
