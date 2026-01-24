// AUTO-GENERATED. DO NOT EDIT.
// Source: blueprint/launch_paths/*.json
// Run: node tools/sync_launch_paths.mjs

import type { LaunchPathInfo } from "./launch_path_types";

export const LAUNCH_PATHS: LaunchPathInfo[] = [
  {
    "id": "api_service_basic",
    "title": "API Service (Basic)",
    "desc": "Launch a simple API service surface with docs and integration scaffolding.",
    "default_template_slug": "template__docs_microsite_basic",
    "intent": {
      "build_intent": "data_api",
      "primary_surface": "api_service",
      "palettes": [
        "connection_integration",
        "infrastructure_data_files",
        "knowledge_learning"
      ]
    }
  },
  {
    "id": "automation_ops",
    "title": "Automation / Ops",
    "desc": "Launch an ops dashboard that generates deterministic artifacts, evidence reports, and automation scaffolding.",
    "default_template_slug": "template__docs_microsite_basic",
    "intent": {
      "build_intent": "automation",
      "primary_surface": "web_app",
      "palettes": [
        "automation_workflows",
        "collaboration_work",
        "infrastructure_data_files",
        "connection_integration"
      ]
    }
  },
  {
    "id": "community_hub",
    "title": "Community Hub",
    "desc": "Launch a community portal with content, communications surfaces, and reputation/safety scaffolding.",
    "default_template_slug": "template__docs_microsite_basic",
    "intent": {
      "build_intent": "community",
      "primary_surface": "web_app",
      "palettes": [
        "content_media",
        "communication_social",
        "reputation_safety",
        "search_navigation",
        "infrastructure_data_files"
      ]
    }
  },
  {
    "id": "content_site_basic",
    "title": "Content Site (Basic)",
    "desc": "Launch a microsite with pages, basic navigation, and publish-ready evidence.",
    "default_template_slug": "template__docs_microsite_minimal",
    "intent": {
      "build_intent": "website",
      "primary_surface": "content_site",
      "palettes": [
        "content_media",
        "search_navigation",
        "knowledge_learning",
        "infrastructure_data_files"
      ]
    }
  },
  {
    "id": "crm_basic",
    "title": "CRM (Basic)",
    "desc": "Launch a simple CRM with contacts, pipelines, tasks, and audit-friendly access control scaffolding.",
    "default_template_slug": "template__docs_microsite_basic",
    "intent": {
      "build_intent": "product_app",
      "primary_surface": "web_app",
      "palettes": [
        "identity_access",
        "collaboration_work",
        "automation_workflows",
        "governance_policy",
        "connection_integration",
        "infrastructure_data_files"
      ]
    }
  },
  {
    "id": "governed_system_basic",
    "title": "Governed System (Governance Platform)",
    "desc": "Launch a governance portal that can export Cardano/Midnight packs for payments, gating, identity, and privacy.",
    "default_template_slug": "template__docs_microsite_basic",
    "intent": {
      "build_intent": "governed_system",
      "primary_surface": "web_app",
      "palettes": [
        "governance_policy",
        "identity_access",
        "communication_social",
        "content_media",
        "infrastructure_data_files"
      ]
    }
  },
  {
    "id": "marketplace_basic",
    "title": "Marketplace (Basic)",
    "desc": "Launch a listing marketplace surface with search and value exchange scaffolding (Cardano-default via export).",
    "default_template_slug": "template__docs_microsite_basic",
    "intent": {
      "build_intent": "marketplace",
      "primary_surface": "web_app",
      "palettes": [
        "search_navigation",
        "matching_recommendation",
        "commerce_value",
        "identity_access",
        "infrastructure_data_files"
      ]
    }
  },
  {
    "id": "product_app_basic",
    "title": "Product App (Basic)",
    "desc": "Launch a simple product web app with core screens and an upgrade path to payments and identity.",
    "default_template_slug": "template__docs_microsite_basic",
    "intent": {
      "build_intent": "product_app",
      "primary_surface": "web_app",
      "palettes": [
        "content_media",
        "identity_access",
        "collaboration_work",
        "infrastructure_data_files"
      ]
    }
  },
  {
    "id": "real_estate_listings_basic",
    "title": "Real Estate Listings (Basic)",
    "desc": "Launch a property listings site with search/filter, media, enquiries, and an admin publishing flow.",
    "default_template_slug": "template__docs_microsite_basic",
    "intent": {
      "build_intent": "marketplace",
      "primary_surface": "web_app",
      "palettes": [
        "search_navigation",
        "content_media",
        "communication_social",
        "identity_access",
        "reputation_safety",
        "infrastructure_data_files"
      ]
    }
  },
  {
    "id": "wiki_basic",
    "title": "Wiki / Knowledge Base (Basic)",
    "desc": "Launch a simple, searchable knowledge base with editing scaffolding and an audit-friendly upgrade path.",
    "default_template_slug": "template__docs_microsite_basic",
    "intent": {
      "build_intent": "website",
      "primary_surface": "web_app",
      "palettes": [
        "content_media",
        "search_navigation",
        "knowledge_learning",
        "collaboration_work",
        "governance_policy",
        "infrastructure_data_files"
      ]
    }
  }
] as any;
