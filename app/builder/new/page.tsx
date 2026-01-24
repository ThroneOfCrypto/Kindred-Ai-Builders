import { redirect } from "next/navigation";

export default function BuilderNewPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const mode = searchParams?.mode;
  const modeStr = Array.isArray(mode) ? mode[0] : mode;
  const qs = modeStr ? `?mode=${encodeURIComponent(String(modeStr))}` : "";
  redirect(`/repo-builder${qs}`);
}
