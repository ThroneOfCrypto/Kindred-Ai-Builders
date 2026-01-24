"use client";

import React, { useEffect, useState } from "react";

import { ADVANCED_MODE_EVENT, readAdvancedMode } from "../lib/advanced_mode";

export function useAdvancedMode(): boolean {
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    try {
      setEnabled(readAdvancedMode());
    } catch {
      setEnabled(false);
    }
  }, []);

  useEffect(() => {
    const on = () => {
      try {
        setEnabled(readAdvancedMode());
      } catch {
        // ignore
      }
    };
    window.addEventListener(ADVANCED_MODE_EVENT, on as any);
    return () => window.removeEventListener(ADVANCED_MODE_EVENT, on as any);
  }, []);

  return enabled;
}

export function AdvancedOnly(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const enabled = useAdvancedMode();
  if (!enabled) return <>{props.fallback || null}</>;
  return <>{props.children}</>;
}
