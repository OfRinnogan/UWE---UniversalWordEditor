// Converts the editor's HTML into plain Markdown/text for the NotebookLM export bar.
// Deliberately simple (regex/DOM-walk, no external lib) — good enough for pasting into
// NotebookLM's source box, not meant to be a full HTML→MD converter.

function walk(node: Node, out: string[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    out.push(node.textContent ?? "");
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === "br") {
    out.push("\n");
    return;
  }
  if (el.classList.contains("uwe-media")) {
    const kind = el.getAttribute("data-media-type") ?? "arquivo";
    out.push(`\n[mídia: ${kind}]\n`);
    return;
  }

  const prefix: Record<string, string> = {
    h1: "\n# ",
    h2: "\n## ",
    h3: "\n### ",
    li: "\n- ",
    blockquote: "\n> ",
  };
  const suffix: Record<string, string> = {
    h1: "\n",
    h2: "\n",
    h3: "\n",
    p: "\n",
    div: "",
  };

  if (tag === "b" || tag === "strong") out.push("**");
  if (tag === "i" || tag === "em") out.push("_");
  if (prefix[tag]) out.push(prefix[tag]);

  el.childNodes.forEach((child) => walk(child, out));

  if (tag === "b" || tag === "strong") out.push("**");
  if (tag === "i" || tag === "em") out.push("_");
  if (suffix[tag] !== undefined) out.push(suffix[tag]);
}

export function htmlToMarkdown(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  const out: string[] = [];
  container.childNodes.forEach((child) => walk(child, out));
  return out
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function downloadTextFile(filename: string, content: string) {
  const mime = filename.endsWith(".md") ? "text/markdown" : "text/plain";
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
