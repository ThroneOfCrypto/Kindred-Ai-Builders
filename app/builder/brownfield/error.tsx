"use client";

import React from "react";
import { ErrorScreen } from "../../../components/ErrorScreen";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen scope="Brownfield" error={error} reset={reset} />;
}
