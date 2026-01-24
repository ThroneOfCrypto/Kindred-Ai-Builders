export type DataSourceChip = {
  id: string;
  label: string;
  description: string;
  tags: string[];
};

export type DataSinkChip = {
  id: string;
  label: string;
  description: string;
  tags: string[];
};

export type DataTriggerChip = {
  id: string;
  label: string;
  description: string;
  tags: string[];
};

/**
 * Data wiring catalog (v1)
 *
 * This stays generic and intentionally boring:
 * - Sources describe how data enters patterns.
 * - Sinks describe where data is pushed out.
 * - Triggers describe when propagation happens.
 *
 * Provider/product specifics belong in Kits, not here.
 */

export const DATA_CATALOG_VERSION = "v1" as const;

export const DATA_SOURCES_V1: DataSourceChip[] = [
  {
    id: "source_repo_markdown",
    label: "Repo files (Markdown)",
    description: "Content lives in your repo as markdown files. Great for docs/knowledge bases.",
    tags: ["git", "markdown", "static"],
  },
  {
    id: "source_headless_api",
    label: "Headless content API",
    description: "Content lives in an external system and is fetched via API (REST/GraphQL).",
    tags: ["api", "cms", "headless"],
  },
  {
    id: "source_db_api",
    label: "Database-backed API",
    description: "Structured data lives in a database and is accessed via a stable API layer.",
    tags: ["db", "api", "structured"],
  },
  {
    id: "source_manual_forms",
    label: "Manual forms",
    description: "Bounded schema forms feed data into patterns (no free-text chaos by default).",
    tags: ["forms", "bounded", "intake"],
  },
];

export const DATA_SINKS_V1: DataSinkChip[] = [
  {
    id: "sink_pages",
    label: "Pages (site)",
    description: "Render pages/routes from your pattern placements.",
    tags: ["web", "pages"],
  },
  {
    id: "sink_feed_rss",
    label: "Feed (RSS/Atom)",
    description: "Publish updates as a feed for syndication.",
    tags: ["rss", "syndication"],
  },
  {
    id: "sink_public_api",
    label: "Public API",
    description: "Expose read endpoints so other systems can reuse your content/data.",
    tags: ["api", "read"],
  },
  {
    id: "sink_webhooks",
    label: "Webhooks",
    description: "Push events to external systems when data changes.",
    tags: ["webhook", "events"],
  },
];

export const DATA_TRIGGERS_V1: DataTriggerChip[] = [
  {
    id: "trigger_build_time",
    label: "Build-time pull",
    description: "Fetch data during build and ship a static snapshot.",
    tags: ["build", "static"],
  },
  {
    id: "trigger_on_request",
    label: "On-request pull",
    description: "Fetch data when a page/API is requested (dynamic).",
    tags: ["runtime", "dynamic"],
  },
  {
    id: "trigger_webhook_push",
    label: "Webhook push",
    description: "External system pushes updates in, and we propagate out.",
    tags: ["webhook", "push"],
  },
  {
    id: "trigger_scheduled_refresh",
    label: "Scheduled refresh",
    description: "Refresh data on a schedule and rebuild or re-index.",
    tags: ["schedule", "refresh"],
  },
];
