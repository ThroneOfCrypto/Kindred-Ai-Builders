"use client";

import React from "react";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer_row">
        <span className="footer_brand">Kindred AI Builders</span>
        <span className="footer_links">
          <a href="/docs">Docs</a>
          <a href="/support">Support</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/about">About</a>
        </span>
      </div>
      <div className="footer_row footer_small">
        <span>Offline-first by default. AI is proposal-only.</span>
      </div>
    </footer>
  );
}
