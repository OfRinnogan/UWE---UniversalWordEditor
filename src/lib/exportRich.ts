// Walks the editor's contentEditable HTML (produced by execCommand + our own
// media/list/heading markup — see EditorToolbar.tsx and media.ts) into a small,
// renderer-agnostic document model that both the .docx and .pdf exporters consume.
//
// This is intentionally not a general-purpose HTML→document converter: it only
// needs to understand the specific tags/styles our own editor ever produces
// (bold/italic/underline/strike, execCommand foreColor/hiliteColor spans,
// fontName <font face>, our manual font-size spans, justify* alignment,
// headings/blockquote via formatBlock, ordered/unordered lists, links, and our
// .uwe-media image/video/audio/file blocks).

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  color?: string; // "#rrggbb"
  highlight?: string; // "#rrggbb"
  fontSizePx?: number;
  fontFamily?: string; // one of FONT_OPTIONS' CSS values
  link?: string;
}

export interface ParagraphBlock {
  type: "paragraph";
  heading?: 1 | 2 | 3;
  quote?: boolean;
  align?: "left" | "center" | "right" | "justify";
  listType?: "bullet" | "number";
  runs: TextRun[];
}

export interface ImageBlock {
  type: "image";
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

export interface PlaceholderBlock {
  type: "placeholder";
  label: string;
  href?: string;
}

export type DocBlock = ParagraphBlock | ImageBlock | PlaceholderBlock;

interface InlineStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color?: string;
  highlight?: string;
  fontSizePx?: number;
  fontFamily?: string;
  link?: string;
}

const EMPTY_STYLE: InlineStyle = { bold: false, italic: false, underline: false, strike: false };

// execCommand with styleWithCSS produces "rgb(r, g, b)"; the color <input> gives
// "#rrggbb" directly. Word/PDF both want a plain "#rrggbb" hex string.
function toHex(color: string): string | undefined {
  const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return (
      "#" +
      [r, g, b]
        .map((c) => Number(c).toString(16).padStart(2, "0"))
        .join("")
    );
  }
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return "#" + color.slice(1).split("").map((c) => c + c).join("");
  }
  return undefined;
}

function normalizeAlign(value: string): ParagraphBlock["align"] | undefined {
  if (value === "center" || value === "right" || value === "justify") return value;
  if (value === "left" || value === "start") return "left";
  return undefined;
}

// Renders an <img> (same-origin, served by our own backend) to a base64 PNG data URL
// so it can be embedded directly in the .docx/.pdf byte stream. Always rasterizes to
// PNG via canvas — both docx's ImageRun (jpg/png/gif/bmp only) and pdfmake's image
// support are narrower than what UWE lets people upload (svg, webp, avif...), and a
// canvas round-trip gives every exporter one guaranteed-safe format for free.
async function imageToDataUrl(img: HTMLImageElement): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const res = await fetch(img.src);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);

    const loaded = await new Promise<{ el: HTMLImageElement; width: number; height: number }>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve({ el, width: el.naturalWidth || 360, height: el.naturalHeight || 240 });
      el.onerror = reject;
      el.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = loaded.width;
    canvas.height = loaded.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    // Flatten transparency onto white — Word/PDF don't composite transparent PNGs
    // consistently, and this matches how the image already looks in the editor
    // (which renders it over a white page background).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(loaded.el, 0, 0);

    URL.revokeObjectURL(objectUrl);

    return { dataUrl: canvas.toDataURL("image/png"), width: loaded.width, height: loaded.height };
  } catch {
    return null;
  }
}

export async function parseEditorHtml(html: string): Promise<DocBlock[]> {
  const container = document.createElement("div");
  container.innerHTML = html;

  const blocks: DocBlock[] = [];
  let current: ParagraphBlock | null = null;
  let template: Omit<ParagraphBlock, "type" | "runs"> = {};

  function beginParagraph() {
    current = { type: "paragraph", runs: [], ...template };
  }

  function flushParagraph(forceKeepBlank = false) {
    if (!current) return;
    const hasText = current.runs.some((r) => r.text.trim().length > 0);
    if (hasText || forceKeepBlank) blocks.push(current);
    current = null;
  }

  function pushRun(text: string, style: InlineStyle) {
    if (!current) beginParagraph();
    current!.runs.push({
      text,
      bold: style.bold || undefined,
      italic: style.italic || undefined,
      underline: style.underline || undefined,
      strike: style.strike || undefined,
      color: style.color,
      highlight: style.highlight,
      fontSizePx: style.fontSizePx,
      fontFamily: style.fontFamily,
      link: style.link,
    });
  }

  const mediaPromises: Array<Promise<void>> = [];

  function pushMediaBlock(el: HTMLElement) {
    const kind = el.getAttribute("data-media-type") ?? "file";
    if (kind === "image") {
      const img = el.querySelector("img");
      if (!img) return;
      const placeholderIndex = blocks.length;
      blocks.push({ type: "placeholder", label: "" }); // reserved slot, replaced below
      mediaPromises.push(
        imageToDataUrl(img).then((result) => {
          if (result) {
            // Cap displayed size at the same width the editor was showing it at.
            const displayWidth = Math.min(el.offsetWidth || result.width, 700);
            const scale = displayWidth / result.width;
            blocks[placeholderIndex] = {
              type: "image",
              dataUrl: result.dataUrl,
              widthPx: displayWidth,
              heightPx: Math.round(result.height * scale),
            };
          } else {
            blocks[placeholderIndex] = { type: "placeholder", label: `[imagem: ${img.alt || "sem título"}]` };
          }
        })
      );
      return;
    }

    const link = el.querySelector("a");
    const label =
      kind === "video"
        ? "[vídeo anexado — abra o link para assistir]"
        : kind === "audio"
          ? "[áudio anexado — abra o link para ouvir]"
          : `[arquivo anexado: ${link?.textContent?.trim() || "abrir"}]`;
    blocks.push({ type: "placeholder", label, href: link?.getAttribute("href") ?? undefined });
  }

  function extendStyle(el: HTMLElement, style: InlineStyle): InlineStyle {
    const tag = el.tagName.toLowerCase();
    const next: InlineStyle = { ...style };

    if (tag === "b" || tag === "strong") next.bold = true;
    if (tag === "i" || tag === "em") next.italic = true;
    if (tag === "u") next.underline = true;
    if (tag === "strike" || tag === "s" || tag === "del") next.strike = true;
    if (tag === "a") next.link = el.getAttribute("href") ?? undefined;
    if (tag === "font") {
      const face = el.getAttribute("face");
      const color = el.getAttribute("color");
      if (face) next.fontFamily = face;
      if (color) next.color = toHex(color) ?? next.color;
    }

    const inlineStyle = el.style;
    if (inlineStyle.fontWeight === "bold" || Number(inlineStyle.fontWeight) >= 600) next.bold = true;
    if (inlineStyle.fontStyle === "italic") next.italic = true;
    if (inlineStyle.textDecorationLine.includes("underline") || inlineStyle.textDecoration.includes("underline")) {
      next.underline = true;
    }
    if (inlineStyle.textDecorationLine.includes("line-through") || inlineStyle.textDecoration.includes("line-through")) {
      next.strike = true;
    }
    if (inlineStyle.color) next.color = toHex(inlineStyle.color) ?? next.color;
    if (inlineStyle.backgroundColor) next.highlight = toHex(inlineStyle.backgroundColor) ?? next.highlight;
    if (inlineStyle.fontSize) {
      const px = parseFloat(inlineStyle.fontSize);
      if (!Number.isNaN(px)) next.fontSizePx = px;
    }
    if (inlineStyle.fontFamily) next.fontFamily = inlineStyle.fontFamily;

    return next;
  }

  function walkInline(node: Node, style: InlineStyle) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text) pushRun(text, style);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    if (el.classList.contains("uwe-media")) {
      flushParagraph();
      pushMediaBlock(el);
      return;
    }
    if (el.tagName.toLowerCase() === "br") {
      pushRun("\n", style);
      return;
    }

    const nextStyle = extendStyle(el, style);
    el.childNodes.forEach((child) => walkInline(child, nextStyle));
  }

  function walkBlock(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.trim()) {
        template = {};
        beginParagraph();
        walkInline(node, EMPTY_STYLE);
        flushParagraph();
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (el.classList.contains("uwe-media")) {
      flushParagraph();
      pushMediaBlock(el);
      return;
    }

    if (tag === "ul" || tag === "ol") {
      const listType = tag === "ol" ? "number" : "bullet";
      Array.from(el.children).forEach((child) => {
        if (child.tagName.toLowerCase() !== "li") return;
        template = { listType };
        beginParagraph();
        walkInline(child, EMPTY_STYLE);
        flushParagraph(true);
      });
      return;
    }

    if (tag === "p" || tag === "div" || tag === "h1" || tag === "h2" || tag === "h3" || tag === "blockquote") {
      const heading = tag === "h1" ? 1 : tag === "h2" ? 2 : tag === "h3" ? 3 : undefined;
      const quote = tag === "blockquote" || undefined;
      const align = normalizeAlign(el.style.textAlign);
      template = { heading, quote, align };
      beginParagraph();
      walkInline(el, EMPTY_STYLE);
      // A completely empty <div><br></div> is contentEditable's way of representing
      // a deliberate blank line — keep it so paragraph spacing survives the export.
      const wasEmptyLine = el.childNodes.length <= 1 && (el.textContent ?? "").trim() === "";
      flushParagraph(wasEmptyLine);
      return;
    }

    // Any other/unexpected top-level tag: treat its whole subtree as one paragraph.
    template = {};
    beginParagraph();
    walkInline(el, EMPTY_STYLE);
    flushParagraph();
  }

  container.childNodes.forEach((child) => walkBlock(child));
  flushParagraph();

  await Promise.all(mediaPromises);

  // Drop reserved placeholder slots that never resolved (shouldn't normally happen).
  return blocks.filter((b) => !(b.type === "placeholder" && b.label === ""));
}

// Our editor's curated web-font families (see fonts.ts) aren't installed in Word or
// embedded in the PDF — map each to a close, universally available equivalent so
// exported documents still look right without shipping font binaries.
export function mapExportFont(cssFontFamily: string | undefined): string {
  if (!cssFontFamily) return "Calibri";
  const f = cssFontFamily.toLowerCase();
  if (f.includes("mono")) return "Courier New";
  if (f.includes("playfair") || f.includes("lora")) return "Georgia";
  if (f.includes("poppins") || f.includes("outfit") || f.includes("sora") || f.includes("space grotesk")) {
    return "Calibri";
  }
  return "Calibri";
}
