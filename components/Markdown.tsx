import React from "react";

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "para"; lines: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "hr" };

function isBlank(line: string): boolean {
  return String(line || "").trim().length === 0;
}

function normText(s: string): string {
  return String(s || "").replace(/\r\n?/g, "\n");
}

function parseBlocks(md: string): Block[] {
  const lines = normText(md).split("\n");
  const blocks: Block[] = [];

  let i = 0;
  let inCode = false;
  let codeLang = "";
  let codeLines: string[] = [];

  const flushParagraph = (paraLines: string[]) => {
    const cleaned = paraLines.map((l) => l.trimEnd());
    const text = cleaned.join("\n").trim();
    if (!text) return;
    blocks.push({ kind: "para", lines: cleaned });
  };

  const flushCode = () => {
    blocks.push({ kind: "code", lang: codeLang, lines: codeLines });
    codeLang = "";
    codeLines = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // Code fences
    const fence = line.match(/^```\s*([a-zA-Z0-9_\-]+)?\s*$/);
    if (fence) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
        codeLang = String(fence[1] || "").trim();
        codeLines = [];
      }
      i += 1;
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      i += 1;
      continue;
    }

    // HR
    if (/^\s*---\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length, text: h[2].trim() });
      i += 1;
      continue;
    }

    // UL
    const ul = line.match(/^\s*[-*]\s+(.+)$/);
    if (ul) {
      const items: string[] = [];
      let j = i;
      while (j < lines.length) {
        const m = lines[j].match(/^\s*[-*]\s+(.+)$/);
        if (!m) break;
        items.push(m[1].trim());
        j += 1;
      }
      blocks.push({ kind: "ul", items });
      i = j;
      continue;
    }

    // OL
    const ol = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (ol) {
      const items: string[] = [];
      let j = i;
      while (j < lines.length) {
        const m = lines[j].match(/^\s*(\d+)\.\s+(.+)$/);
        if (!m) break;
        items.push(m[2].trim());
        j += 1;
      }
      blocks.push({ kind: "ol", items });
      i = j;
      continue;
    }

    // Paragraph
    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const paraLines: string[] = [];
    let j = i;
    while (j < lines.length && !isBlank(lines[j])) {
      // stop if next is a block marker
      if (/^```/.test(lines[j])) break;
      if (/^\s*---\s*$/.test(lines[j])) break;
      if (/^(#{1,6})\s+/.test(lines[j])) break;
      if (/^\s*[-*]\s+/.test(lines[j])) break;
      if (/^\s*\d+\.\s+/.test(lines[j])) break;
      paraLines.push(lines[j]);
      j += 1;
    }
    flushParagraph(paraLines);
    i = j;
  }

  if (inCode) {
    // Unterminated fence: still render what we saw.
    flushCode();
  }

  return blocks;
}

function isSafeHref(href: string): boolean {
  const h = String(href || "").trim();
  if (!h) return false;
  if (h.startsWith("/")) return true;
  if (h.startsWith("https://") || h.startsWith("http://")) return true;
  return false;
}

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const s = String(text || "");

  // Very small inline parser: links [t](u) + inline code `x`.
  // (Everything else stays as text; no fancy markdown gymnastics.)
  let i = 0;
  while (i < s.length) {
    // inline code
    if (s[i] === "`") {
      const j = s.indexOf("`", i + 1);
      if (j > i) {
        const code = s.slice(i + 1, j);
        out.push(
          <code key={`c_${i}`} className="md_inline_code">
            {code}
          </code>,
        );
        i = j + 1;
        continue;
      }
    }

    // link
    if (s[i] === "[") {
      const close = s.indexOf("]", i + 1);
      const openParen = close >= 0 ? s.indexOf("(", close + 1) : -1;
      const closeParen = openParen >= 0 ? s.indexOf(")", openParen + 1) : -1;
      if (close > i && openParen === close + 1 && closeParen > openParen) {
        const label = s.slice(i + 1, close);
        const href = s.slice(openParen + 1, closeParen);
        if (isSafeHref(href)) {
          const external = href.startsWith("http://") || href.startsWith("https://");
          out.push(
            <a
              key={`l_${i}`}
              href={href}
              className="md_link"
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
            >
              {label}
            </a>,
          );
          i = closeParen + 1;
          continue;
        }
      }
    }

    // plain text chunk
    let next = s.length;
    const nextCode = s.indexOf("`", i);
    if (nextCode >= 0) next = Math.min(next, nextCode);
    const nextLink = s.indexOf("[", i);
    if (nextLink >= 0) next = Math.min(next, nextLink);
    const chunk = s.slice(i, next);
    if (chunk) out.push(chunk);
    i = next;
  }
  return out;
}

export function Markdown({ markdown }: { markdown: string }) {
  const blocks = parseBlocks(markdown);

  return (
    <div className="markdown">
      {blocks.map((b, idx) => {
        if (b.kind === "heading") {
          const Tag = (`h${Math.min(6, Math.max(1, b.level))}` as unknown) as keyof JSX.IntrinsicElements;
          return (
            <Tag key={idx} className="md_h">
              {renderInline(b.text)}
            </Tag>
          );
        }

        if (b.kind === "hr") {
          return <div key={idx} className="md_hr" />;
        }

        if (b.kind === "code") {
          const lang = b.lang ? `language-${b.lang}` : "";
          return (
            <pre key={idx} className={`md_code ${lang}`.trim()}>
              <code>{b.lines.join("\n")}</code>
            </pre>
          );
        }

        if (b.kind === "ul") {
          return (
            <ul key={idx} className="md_ul">
              {b.items.map((it, i) => (
                <li key={i}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }

        if (b.kind === "ol") {
          return (
            <ol key={idx} className="md_ol">
              {b.items.map((it, i) => (
                <li key={i}>{renderInline(it)}</li>
              ))}
            </ol>
          );
        }

        // paragraph
        return (
          <p key={idx} className="md_p">
            {renderInline(b.lines.join(" "))}
          </p>
        );
      })}
    </div>
  );
}
