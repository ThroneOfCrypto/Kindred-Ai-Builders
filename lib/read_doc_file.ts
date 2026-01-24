import fs from "fs";
import path from "path";

export type DocFile = {
  name: string;
  text: string;
  html: string;
};

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replaceAll("`", "&#96;");
}

function renderInline(md: string): string {
  // inline code
  let out = md.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  // links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, (_, text, url) => {
    const safeText = escapeHtml(String(text || ""));
    const safeUrl = escapeAttr(String(url || ""));
    return `<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeText}</a>`;
  });
  return out;
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");

  let html = "";
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];
  let inUl = false;
  let inOl = false;

  const flushLists = () => {
    if (inUl) {
      html += "</ul>\n";
      inUl = false;
    }
    if (inOl) {
      html += "</ol>\n";
      inOl = false;
    }
  };

  const flushCode = () => {
    if (!inCode) return;
    const code = escapeHtml(codeBuf.join("\n"));
    const cls = codeLang ? ` class="language-${escapeAttr(codeLang)}"` : "";
    html += `<pre><code${cls}>${code}</code></pre>\n`;
    inCode = false;
    codeLang = "";
    codeBuf = [];
  };

  for (const raw of lines) {
    const line = raw ?? "";

    const fence = line.match(/^```\s*([a-zA-Z0-9_\-]+)?\s*$/);
    if (fence) {
      if (inCode) {
        flushCode();
      } else {
        flushLists();
        inCode = true;
        codeLang = fence[1] ? String(fence[1]) : "";
        codeBuf = [];
      }
      continue;
    }

    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // headings
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushLists();
      const level = h[1].length;
      const content = renderInline(escapeHtml(h[2] || ""));
      html += `<h${level}>${content}</h${level}>\n`;
      continue;
    }

    // lists
    const ul = line.match(/^\s*[-\*]\s+(.*)$/);
    if (ul) {
      if (inOl) flushLists();
      if (!inUl) {
        html += "<ul>\n";
        inUl = true;
      }
      html += `<li>${renderInline(escapeHtml(ul[1] || ""))}</li>\n`;
      continue;
    }

    const ol = line.match(/^\s*(\d+)\.?\s+(.*)$/);
    if (ol) {
      if (inUl) flushLists();
      if (!inOl) {
        html += "<ol>\n";
        inOl = true;
      }
      html += `<li>${renderInline(escapeHtml(ol[2] || ""))}</li>\n`;
      continue;
    }

    // blank line
    if (!line.trim()) {
      flushLists();
      html += "\n";
      continue;
    }

    // paragraph
    flushLists();
    html += `<p>${renderInline(escapeHtml(line))}</p>\n`;
  }

  flushLists();
  flushCode();

  return html;
}

export function readDocFile(filename: string): DocFile {
  const safe = String(filename || "").trim();
  if (!/^[a-zA-Z0-9_\-\.]+$/.test(safe) || safe.includes("..")) {
    return { name: safe, text: "", html: "<p>Invalid doc name.</p>" };
  }

  const docsDir = path.join(process.cwd(), "docs");
  const filePath = path.join(docsDir, safe);

  try {
    const text = fs.readFileSync(filePath, "utf-8");
    const html = markdownToHtml(text);
    return { name: safe, text, html };
  } catch {
    return { name: safe, text: "", html: "<p>Doc not found.</p>" };
  }
}
