import {
  Document,
  Packer,
  Paragraph,
  TextRun as DocxTextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  ExternalHyperlink,
} from "docx";
import { parseEditorHtml, mapExportFont, type DocBlock, type TextRun } from "@/lib/exportRich";

const ALIGN_MAP: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

const HEADING_MAP = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
} as const;

function runToDocx(run: TextRun) {
  const props = {
    text: run.text,
    bold: run.bold,
    italics: run.italic,
    underline: run.underline ? {} : undefined,
    strike: run.strike,
    color: run.color?.replace("#", ""),
    // docx's `highlight` prop only accepts Word's fixed named-color palette; an
    // arbitrary hex (from execCommand's color picker) needs `shading` instead.
    shading: run.highlight ? { fill: run.highlight.replace("#", "") } : undefined,
    font: run.fontFamily ? mapExportFont(run.fontFamily) : undefined,
    size: run.fontSizePx ? Math.round(run.fontSizePx * 1.5) : undefined, // px → half-points
  };
  const textRun = new DocxTextRun(props);
  if (run.link) {
    return new ExternalHyperlink({ link: run.link, children: [textRun] });
  }
  return textRun;
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function blockToDocx(block: DocBlock) {
  if (block.type === "image") {
    return new Paragraph({
      children: [
        new ImageRun({
          data: dataUrlToUint8Array(block.dataUrl),
          transformation: { width: block.widthPx, height: block.heightPx },
          type: "png",
        }),
      ],
    });
  }

  if (block.type === "placeholder") {
    return new Paragraph({
      children: [new DocxTextRun({ text: block.label, italics: true, color: "888888" })],
    });
  }

  return new Paragraph({
    heading: block.heading ? HEADING_MAP[block.heading] : undefined,
    alignment: block.align ? ALIGN_MAP[block.align] : undefined,
    bullet: block.listType === "bullet" ? { level: 0 } : undefined,
    numbering: block.listType === "number" ? { reference: "uwe-numbered-list", level: 0 } : undefined,
    indent: block.quote ? { left: 480 } : undefined,
    border: block.quote
      ? { left: { style: "single", size: 12, color: "CBD5E1", space: 8 } }
      : undefined,
    children: block.runs.length > 0 ? block.runs.map(runToDocx) : [new DocxTextRun({ text: "" })],
  });
}

export async function buildDocxBlob(title: string, editorHtml: string): Promise<Blob> {
  const blocks = await parseEditorHtml(editorHtml);

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "uwe-numbered-list",
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }],
        },
      ],
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new DocxTextRun({ text: title || "Documento sem título" })] }),
          ...blocks.map(blockToDocx),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function exportToDocx(title: string, editorHtml: string): Promise<void> {
  const blob = await buildDocxBlob(title, editorHtml);
  downloadBlob(blob, `${title || "documento"}.docx`);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
