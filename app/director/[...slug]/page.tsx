import { Panel } from "../../../components/Panel";
import { ProofReceiptStatus } from "../../../components/ProofReceiptStatus";

type Params = { slug: string[] };

type Action = { label: string; href: string };

type PageModel = {
  key: string;
  hero: string;
  blurb: string;
  primary: Action[];
  tips: string[];
};

function titleFor(slug: string[]): string {
  const key = (slug || []).join("/");
  if (!key || key === "start") return "Quickstart";
  if (key === "golden-path") return "Golden Path";
  if (key === "capabilities") return "Capability Plan";
  if (key === "proposals") return "Proposals";
  if (key === "ship") return "Ship";
  if (key === "evidence") return "Evidence";
  if (key === "editor") return "Editor";
  if (key === "blueprints") return "Blueprints";
  if (key === "browse") return "Browse";
  if (key === "libraries") return "Libraries";
  if (key === "patterns") return "Patterns";
  if (key === "kits") return "Integrations";
  if (key === "library-lock") return "Library Lock";
  if (key === "failures") return "Failures";
  if (key === "coherence") return "Coherence";
  if (key === "interrogator") return "Interrogator";
  if (key === "preview") return "Preview";
  if (key === "proof-request") return "Proof Request";
  if (key === "build") return "Build";
  return key.replace(/\b\w/g, (m) => m.toUpperCase()).replaceAll("-", " ");
}

function pageModel(slug: string[]): PageModel {
  const key = (slug || []).join("/") || "start";

  const common = {
    director: "/director",
    docs: "/docs/director",
    workbench: "/workbench",
    repoBuilder: "/repo-builder",
    repoHub: "/repo",
    ship: "/ship",
    verify: "/verify",
    marketplace: "/marketplace",
  };

  switch (key) {
    case "start":
      return {
        key,
        hero: "Quickstart",
        blurb: "A sane path from intent to a locked Repo Pack, without pretending Deploy Lane is proof.",
        primary: [
          { label: "Create repo pack", href: common.repoBuilder },
          { label: "Import existing repo", href: common.repoHub },
          { label: "Workbench", href: common.workbench },
        ],
        tips: [
          "Director UX stays clean; Proof Lane does the heavy lifting.",
          "Export receipts into Deploy Lane only after Proof Lane produces them.",
        ],
      };

    case "golden-path":
      return {
        key,
        hero: "Golden Path",
        blurb: "One guided sequence. One next action. No mystery meat.",
        primary: [
          { label: "1) Workbench (Spec Pack)", href: common.workbench },
          { label: "2) Repo hub (Repo Pack)", href: common.repoHub },
          { label: "3) Ship", href: common.ship },
          { label: "4) Verify", href: common.verify },
        ],
        tips: [
          "If you feel lost, start at Workbench and lock the Spec Pack first.",
          "Repo Pack is downstream. Proof is downstream of that.",
        ],
      };

    case "capabilities":
      return {
        key,
        hero: "Capability Plan",
        blurb: "Map what you actually need (data, delivery, security, observability, governance) without changing the core primitives.",
        primary: [
          { label: "Open Workbench", href: common.workbench },
          { label: "Docs", href: "/docs/director" },
          { label: "Security docs", href: "/docs/security" },
        ],
        tips: [
          "This surface is intentionally boring in Bootstrap. SDDE proper will generate a plan UI from the schema.",
          "Integrations are opt-in. Core stays stdlib-only + repo-native. No custodial defaults.",
        ],
      };

    case "proposals":
    case "browse":
      return {
        key,
        hero: "Browse",
        blurb: "Bookmark UI components into a basket, then generate a deterministic placement plan.",
        primary: [
          { label: "Open browse", href: "/director/browse" },
          { label: "Editor", href: common.director + "/editor" },
          { label: "Workbench", href: common.workbench },
        ],
        tips: [
          "This is preference anchoring, not design free-for-all.",
          "Proposals can use the basket later without exposing internal physics.",
        ],
      };
      return {
        key,
        hero: "Proposals",
        blurb: "AI can propose. You approve. Nothing ships without deterministic receipts.",
        primary: [
          { label: "Workbench", href: common.workbench },
          { label: "Marketplace", href: common.marketplace },
          { label: "Ship", href: common.ship },
        ],
        tips: [
          "In Bootstrap, proposals are prototype-level UX. The governance and locks are the real product.",
          "If proposals feel vague: tighten the brief, rerun coherence, rerun interrogator.",
        ],
      };

    case "ship":
      return {
        key,
        hero: "Ship",
        blurb: "Turn locked packs into deliverables, then request Proof Lane verification.",
        primary: [
          { label: "Open Ship", href: common.ship },
          { label: "Verify", href: common.verify },
          { label: "Release checklist", href: "/release-checklist" },
        ],
        tips: [
          "Deploy Lane is distribution. Proof Lane is truth.",
          "Export only safe receipts into public/dist.",
        ],
      };

    case "evidence":
      return {
        key,
        hero: "Evidence",
        blurb: "Receipts, not vibes.",
        primary: [
          { label: "Verify", href: common.verify },
          { label: "Docs", href: "/docs/verify" },
          { label: "Ship", href: common.ship },
        ],
        tips: [
          "This page reads only deploy-safe receipts from public/dist.",
          "Evidence API is disabled in prod by default.",
        ],
      };

    default:
      return {
        key,
        hero: titleFor(slug),
        blurb: "This surface exists so the UI never dead-ends. Some features are still scaffolding in Bootstrap.",
        primary: [
          { label: "Director home", href: common.director },
          { label: "Workbench", href: common.workbench },
          { label: "Docs", href: "/docs" },
        ],
        tips: [
          "If you landed here from a link, we haven't built the full experience yet.",
          "The goal is still: deterministic packs + exported receipts + clean separation of lanes.",
        ],
      };
  }
}

export default function DirectorSlugPage({ params }: { params: Params }) {
  const slug = params.slug || [];
  const model = pageModel(slug);

  return (
    <div className="container">
      <div className="hero">
        <h1>{model.hero}</h1>
        <p>{model.blurb}</p>
        <div className="row">
          <a className="btn" href="/director">
            Director Home
          </a>
        </div>
      </div>

      <div className="grid">
        {(model.key === "evidence" || model.key === "ship" || model.key === "start" || model.key === "golden-path") ? <ProofReceiptStatus /> : null}

        <Panel title="Next actions">
          <div className="row">
            {model.primary.map((a) => (
              <a key={a.href} className="btn primary" href={a.href}>
                {a.label}
              </a>
            ))}
          </div>

          <div className="hr" />
          <p className="small mb0">Notes:</p>
          <ul className="list">
            {model.tips.map((t: string, i: number) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
