import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type { Content, StyleDictionary } from "pdfmake/interfaces";
import { parseEditorHtml, type DocBlock, type TextRun } from "@/lib/exportRich";

// pdfmake ships one embedded font (Roboto) pre-registered by default in the browser
// build — this just points it at the actual font-file bytes (vfs_fonts.js). Our
// editor's curated web fonts (fonts.ts) aren't embedded here (no .ttf files shipped
// for them), so every exported PDF renders in Roboto regardless of on-screen font —
// headings/bold/italic/alignment/lists/colors still carry over faithfully.
(pdfMake as unknown as { addVirtualFileSystem: (vfs: unknown) => void }).addVirtualFileSystem(pdfFonts);

function runToPdf(run: TextRun): Content {
  return {
    text: run.text,
    bold: run.bold,
    italics: run.italic,
    decoration: run.underline ? "underline" : run.strike ? "lineThrough" : undefined,
    color: run.color ?? (run.link ? "#2563eb" : undefined),
    background: run.highlight,
    fontSize: run.fontSizePx ? Math.round(run.fontSizePx * 0.75) : undefined, // px → pt
    link: run.link,
  };
}

function blockToPdf(block: DocBlock): Content {
  if (block.type === "image") {
    return { image: block.dataUrl, width: block.widthPx, margin: [0, 6, 0, 6] };
  }

  if (block.type === "placeholder") {
    const content: Content = { text: block.label, italics: true, color: "#888888", margin: [0, 4, 0, 4] };
    return block.href ? { ...content, link: block.href } : content;
  }

  const text: Content = block.runs.length > 0 ? block.runs.map(runToPdf) : [{ text: "" }];
  const fontSize = block.heading === 1 ? 22 : block.heading === 2 ? 18 : block.heading === 3 ? 15 : 11;

  return {
    text,
    fontSize,
    bold: !!block.heading,
    alignment: block.align,
    margin: block.quote ? [16, 4, 0, 4] : block.heading ? [0, 10, 0, 6] : [0, 2, 0, 2],
  };
}

// Lists need pdfmake's dedicated `ul`/`ol` content nodes (a plain paragraph can't
// carry a bullet marker), so consecutive list-type blocks are grouped and re-emitted
// as one list node instead of one node per block.
function groupBlocks(blocks: DocBlock[]): Content[] {
  const out: Content[] = [];
  let listBuffer: { type: "bullet" | "number"; items: Content[] } | null = null;

  function flushList() {
    if (!listBuffer) return;
    out.push(listBuffer.type === "bullet" ? { ul: listBuffer.items } : { ol: listBuffer.items });
    listBuffer = null;
  }

  for (const block of blocks) {
    if (block.type === "paragraph" && block.listType) {
      const itemText: Content = block.runs.length > 0 ? block.runs.map(runToPdf) : [{ text: "" }];
      if (!listBuffer || listBuffer.type !== block.listType) {
        flushList();
        listBuffer = { type: block.listType, items: [] };
      }
      listBuffer.items.push(itemText);
      continue;
    }
    flushList();
    out.push(blockToPdf(block));
  }
  flushList();
  return out;
}

export async function buildPdfDocDefinition(title: string, editorHtml: string) {
  const blocks = await parseEditorHtml(editorHtml);
  const styles: StyleDictionary = {};

  return {
    pageSize: "A4" as const,
    pageMargins: [56, 56, 56, 56] as [number, number, number, number],
    defaultStyle: { fontSize: 11, lineHeight: 1.25 },
    styles,
    content: [
      { text: title || "Documento sem título", fontSize: 26, bold: true, margin: [0, 0, 0, 18] },
      ...groupBlocks(blocks),
    ] as Content[],
  };
}

export async function exportToPdf(title: string, editorHtml: string): Promise<void> {
  const docDefinition = await buildPdfDocDefinition(title, editorHtml);
  await pdfMake.createPdf(docDefinition).download(`${title || "documento"}.pdf`);
}
