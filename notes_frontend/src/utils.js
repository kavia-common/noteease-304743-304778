/**
 * Utility functions for the Notes app.
 */

// PUBLIC_INTERFACE
export function nowIso() {
  /** Returns an ISO timestamp string for current time. */
  return new Date().toISOString();
}

// PUBLIC_INTERFACE
export function formatRelative(iso) {
  /** Formats an ISO timestamp into a short, human-readable string. */
  const d = new Date(iso);
  const delta = Date.now() - d.getTime();
  const mins = Math.floor(delta / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString();
}

// PUBLIC_INTERFACE
export function makeId(prefix = "note") {
  /** Generates a reasonably unique id without external dependencies. */
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

// PUBLIC_INTERFACE
export function summarize(text, max = 90) {
  /** Produces a short snippet for list display. */
  const t = (text || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Very small markdown-to-HTML preview helper (safe subset).
 * We intentionally avoid heavy dependencies. This is NOT a full markdown parser.
 */
// PUBLIC_INTERFACE
export function markdownToSafeHtml(markdown) {
  /** Convert simple markdown to safe HTML (escapes HTML, supports headings, bold, italics, code, links, lists). */
  const escape = (s) =>
    (s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const lines = escape(markdown || "").split("\n");

  const out = [];
  let inList = false;

  const flushList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      const item = line.replace(/^\s*[-*]\s+/, "");
      out.push(`<li>${inlineMarkdown(item)}</li>`);
      continue;
    } else {
      flushList();
    }

    // headings
    if (/^###\s+/.test(line)) {
      out.push(`<h3>${inlineMarkdown(line.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      out.push(`<h2>${inlineMarkdown(line.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(line)) {
      out.push(`<h1>${inlineMarkdown(line.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }

    if (!line) {
      out.push("<div style=\"height:8px\"></div>");
      continue;
    }

    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  flushList();
  return out.join("\n");

  function inlineMarkdown(s) {
    // inline code
    let t = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    // bold
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // italics
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    // links [text](url)
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noopener noreferrer\">$1</a>");
    return t;
  }
}
