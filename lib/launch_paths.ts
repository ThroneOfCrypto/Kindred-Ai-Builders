"use client";

import type { LaunchPathInfo } from "./launch_path_types";
import { LAUNCH_PATHS } from "./launch_paths.generated";

export type { LaunchPathInfo };
export { LAUNCH_PATHS };

export function getLaunchPathById(id: string): LaunchPathInfo | undefined {
  return LAUNCH_PATHS.find((p) => p.id === id);
}
