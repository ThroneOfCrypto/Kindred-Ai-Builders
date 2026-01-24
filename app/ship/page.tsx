import { redirect } from "next/navigation";

/**
 * Legacy route.
 *
 * Director Mode is the primary workflow. Keep /ship as a stable entry point,
 * but send users to the guided Director checklist.
 */
export default function ShipPage() {
  redirect("/director/ship");
}
