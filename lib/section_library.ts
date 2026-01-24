"use client";

export type SectionId =
  | "hero"
  | "value_props"
  | "social_proof"
  | "features"
  | "how_it_works"
  | "pricing"
  | "faq"
  | "cta"
  | "secondary_cta"
  | "footer"
  | "top_nav"
  | "sidebar_nav"
  | "summary_cards"
  | "main_panel"
  | "filters"
  | "results_list"
  | "gallery"
  | "details"
  | "steps"
  | "summary"
  | "payment"
  | "composer"
  | "feed_list"
  | "docs_content"
  | "content";

export const SECTION_LIBRARY: { id: SectionId; label: string }[] = [
  { id: "top_nav", label: "Top navigation" },
  { id: "sidebar_nav", label: "Sidebar navigation" },

  { id: "hero", label: "Hero" },
  { id: "value_props", label: "Value props" },
  { id: "social_proof", label: "Social proof" },
  { id: "features", label: "Features" },
  { id: "how_it_works", label: "How it works" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },

  { id: "filters", label: "Filters" },
  { id: "results_list", label: "Results list" },
  { id: "gallery", label: "Gallery" },
  { id: "details", label: "Details" },
  { id: "steps", label: "Steps" },
  { id: "summary", label: "Summary" },
  { id: "payment", label: "Payment" },

  { id: "summary_cards", label: "Summary cards" },
  { id: "main_panel", label: "Main panel" },

  { id: "composer", label: "Composer" },
  { id: "feed_list", label: "Feed list" },

  { id: "docs_content", label: "Docs content" },
  { id: "content", label: "Content" },

  { id: "cta", label: "CTA" },
  { id: "secondary_cta", label: "Secondary CTA" },
  { id: "footer", label: "Footer" },
];

export function labelForSection(id: string): string {
  const found = SECTION_LIBRARY.find((x) => x.id === id);
  return found ? found.label : id;
}
