import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";

type InlineToken = { text: string; bold?: boolean; italics?: boolean; code?: boolean };
type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "spacer" };

const ACCENT = "174B76";
const LIGHT_ACCENT = "EAF2F8";
const BODY = "252A2E";

function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  const addSpacer = () => {
    if (blocks.at(-1)?.kind !== "spacer") blocks.push({ kind: "spacer" });
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      addSpacer();
      index += 1;
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index]?.trim().startsWith(">")) {
        quoteLines.push((lines[index] ?? "").replace(/^\s*>\s?/, "").trim());
        index += 1;
      }
      blocks.push({ kind: "quote", text: quoteLines.join(" ") });
      continue;
    }

    if (line.trim().startsWith("|") && index + 1 < lines.length && isTableDivider(lines[index + 1] ?? "")) {
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        rows.push(splitTableRow(lines[index] ?? ""));
        index += 1;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*[-*+]\s+/, "").trim());
        index += 1;
      }
      blocks.push({ kind: "list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (!current.trim() || /^\s*(#{1,6})\s+/.test(current) || current.trim().startsWith(">") || /^\s*[-*+]\s+/.test(current)) break;
      if (current.trim().startsWith("|") && index + 1 < lines.length && isTableDivider(lines[index + 1] ?? "")) break;
      paragraphLines.push(current.trim());
      index += 1;
    }
    if (paragraphLines.length) blocks.push({ kind: "paragraph", text: paragraphLines.join(" ") });
    else index += 1;
  }

  return blocks;
}

function inlineTokens(value: string): InlineToken[] {
  const normalized = value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1");
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  const tokens: InlineToken[] = [];
  let cursor = 0;
  const matcher = new RegExp(pattern.source, pattern.flags);
  let match = matcher.exec(normalized);
  while (match) {
    const start = match.index;
    if (start > cursor) tokens.push({ text: normalized.slice(cursor, start) });
    const raw = match[0];
    if (raw.startsWith("**") || raw.startsWith("__")) tokens.push({ text: raw.slice(2, -2), bold: true });
    else if (raw.startsWith("`")) tokens.push({ text: raw.slice(1, -1), code: true });
    else tokens.push({ text: raw.slice(1, -1), italics: true });
    cursor = start + raw.length;
    match = matcher.exec(normalized);
  }
  if (cursor < normalized.length) tokens.push({ text: normalized.slice(cursor) });
  return tokens.length ? tokens : [{ text: normalized }];
}

function plainText(value: string): string {
  return inlineTokens(value).map((token) => token.text).join("");
}

type DocxHeading = (typeof HeadingLevel)[keyof typeof HeadingLevel];

function headingLevel(level: number): DocxHeading {
  if (level <= 1) return HeadingLevel.HEADING_1;
  if (level === 2) return HeadingLevel.HEADING_2;
  return HeadingLevel.HEADING_3;
}

function docxRuns(text: string, baseSize = 22, color = BODY): TextRun[] {
  return inlineTokens(text).map((token) => new TextRun({
    text: token.text,
    bold: token.bold,
    italics: token.italics,
    color,
    size: token.code ? baseSize - 1 : baseSize,
    font: token.code ? "Courier New" : "Aptos",
  }));
}

function docxParagraph(text: string, options?: { heading?: DocxHeading; bullet?: boolean; quote?: boolean }): Paragraph {
  return new Paragraph({
    heading: options?.heading,
    children: docxRuns(text, options?.heading ? 24 : 22, options?.quote ? ACCENT : BODY),
    bullet: options?.bullet ? { level: 0 } : undefined,
    border: options?.quote ? { left: { color: ACCENT, style: BorderStyle.SINGLE, size: 18, space: 8 } } : undefined,
    shading: options?.quote ? { type: ShadingType.CLEAR, fill: LIGHT_ACCENT } : undefined,
    spacing: { before: options?.heading ? 240 : options?.quote ? 120 : 80, after: options?.heading ? 100 : 120, line: 276 },
    indent: options?.quote ? { left: 180, right: 120 } : undefined,
  });
}

function tableCell(text: string, header = false): TableCell {
  return new TableCell({
    width: { size: 100, type: WidthType.AUTO },
    shading: header ? { type: ShadingType.CLEAR, fill: ACCENT } : undefined,
    margins: { top: 90, bottom: 90, left: 110, right: 110 },
    children: [new Paragraph({ children: docxRuns(text, 19, header ? "FFFFFF" : BODY), spacing: { after: 0, line: 240 } })],
  });
}

function markdownToDocx(markdown: string, title: string): Document {
  const children: (Paragraph | Table)[] = [];
  for (const block of parseMarkdown(markdown)) {
    if (block.kind === "spacer") {
      children.push(new Paragraph({ spacing: { after: 80 } }));
    } else if (block.kind === "heading") {
      children.push(docxParagraph(block.text, { heading: headingLevel(block.level) }));
    } else if (block.kind === "paragraph") {
      children.push(docxParagraph(block.text));
    } else if (block.kind === "quote") {
      children.push(docxParagraph(block.text, { quote: true }));
    } else if (block.kind === "list") {
      children.push(...block.items.map((item) => docxParagraph(item, { bullet: true })));
    } else {
      const rows = [
        new TableRow({ children: block.headers.map((header) => tableCell(header, true)), cantSplit: true }),
        ...block.rows.map((row) => new TableRow({ children: block.headers.map((_, cellIndex) => tableCell(row[cellIndex] ?? "")), cantSplit: true })),
      ];
      children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: block.headers.map(() => 1) }));
      children.push(new Paragraph({ spacing: { after: 100 } }));
    }
  }

  return new Document({
    creator: "HireMe",
    title,
    description: "Evidence-first career workspace export",
    sections: [{
      properties: { page: { margin: { top: 900, right: 1000, bottom: 900, left: 1000 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "HIREME / EVIDENCE-FIRST CAREER WORKSPACE", bold: true, color: ACCENT, size: 16 })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "HireMe  •  ", color: "64748B", size: 16 }), new TextRun({ children: [PageNumber.CURRENT], color: "64748B", size: 16 })] })] }) },
      children,
    }],
  });
}

export async function exportDocx(name: string, markdown: string) {
  const title = plainText(parseMarkdown(markdown).find((block) => block.kind === "heading")?.text ?? "HireMe export");
  const buffer = await Packer.toBlob(markdownToDocx(markdown, title));
  saveBlob(name, buffer);
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 54;
const TOP_Y = 738;
const BOTTOM_Y = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    while (font.widthOfTextAtSize(current, size) > maxWidth && current.length > 1) {
      let split = current.length - 1;
      while (split > 1 && font.widthOfTextAtSize(current.slice(0, split), size) > maxWidth) split -= 1;
      lines.push(current.slice(0, split));
      current = current.slice(split);
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawHeaderFooter(page: PDFPage, pageNumber: number, regular: PDFFont, bold: PDFFont) {
  page.drawText("HIREME / EVIDENCE-FIRST CAREER WORKSPACE", { x: MARGIN_X, y: 766, size: 7.5, font: bold, color: rgb(0.09, 0.29, 0.46) });
  page.drawLine({ start: { x: MARGIN_X, y: 756 }, end: { x: PAGE_WIDTH - MARGIN_X, y: 756 }, thickness: 0.6, color: rgb(0.78, 0.82, 0.86) });
  const footer = `HireMe  •  ${pageNumber}`;
  page.drawText(footer, { x: (PAGE_WIDTH - regular.widthOfTextAtSize(footer, 7.5)) / 2, y: 28, size: 7.5, font: regular, color: rgb(0.39, 0.45, 0.52) });
}

export async function exportPdf(name: string, markdown: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(plainText(parseMarkdown(markdown).find((block) => block.kind === "heading")?.text ?? "HireMe export"));
  pdf.setAuthor("HireMe");
  pdf.setSubject("Evidence-first career workspace export");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  let pageNumber = 0;
  let page!: PDFPage;
  let y = 0;

  const newPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pageNumber += 1;
    drawHeaderFooter(page, pageNumber, regular, bold);
    y = TOP_Y;
  };
  const ensureSpace = (height: number) => {
    if (y - height < BOTTOM_Y) newPage();
  };
  const drawTextLines = (lines: string[], size: number, font: PDFFont, color = rgb(0.15, 0.16, 0.18), x = MARGIN_X, gap = 14) => {
    for (const line of lines) {
      ensureSpace(gap);
      page.drawText(line, { x, y, size, font, color });
      y -= gap;
    }
  };

  newPage();
  for (const block of parseMarkdown(markdown)) {
    if (block.kind === "spacer") {
      y -= 8;
      continue;
    }
    if (block.kind === "heading") {
      const size = block.level === 1 ? 18 : block.level === 2 ? 13 : 11;
      const gap = block.level === 1 ? 23 : block.level === 2 ? 18 : 15;
      const lines = wrapText(plainText(block.text), bold, size, CONTENT_WIDTH);
      ensureSpace(lines.length * gap + 12);
      y -= block.level === 1 ? 8 : 5;
      drawTextLines(lines, size, bold, rgb(0.09, 0.29, 0.46), MARGIN_X, gap);
      y -= 3;
      continue;
    }
    if (block.kind === "paragraph") {
      drawTextLines(wrapText(plainText(block.text), regular, 9.5, CONTENT_WIDTH), 9.5, regular, rgb(0.15, 0.16, 0.18), MARGIN_X, 14);
      y -= 4;
      continue;
    }
    if (block.kind === "list") {
      for (const item of block.items) {
        const lines = wrapText(`- ${plainText(item)}`, regular, 9.5, CONTENT_WIDTH - 12);
        drawTextLines(lines, 9.5, regular, rgb(0.15, 0.16, 0.18), MARGIN_X + 10, 14);
      }
      y -= 4;
      continue;
    }
    if (block.kind === "quote") {
      const lines = wrapText(plainText(block.text), italic, 9.5, CONTENT_WIDTH - 28);
      const height = lines.length * 14 + 14;
      ensureSpace(height);
      page.drawRectangle({ x: MARGIN_X, y: y - height + 4, width: CONTENT_WIDTH, height, color: rgb(0.92, 0.95, 0.97) });
      page.drawRectangle({ x: MARGIN_X, y: y - height + 4, width: 3, height, color: rgb(0.09, 0.29, 0.46) });
      drawTextLines(lines, 9.5, italic, rgb(0.09, 0.29, 0.46), MARGIN_X + 16, 14);
      y -= 8;
      continue;
    }

    const columnCount = Math.max(block.headers.length, 1);
    const columnWidth = CONTENT_WIDTH / columnCount;
    const rows = [block.headers, ...block.rows];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const cellLines = row.map((cell) => wrapText(plainText(cell), rowIndex === 0 ? bold : regular, 7.5, columnWidth - 12));
      const rowHeight = Math.max(...cellLines.map((lines) => lines.length), 1) * 10 + 10;
      ensureSpace(rowHeight + 2);
      if (rowIndex === 0) page.drawRectangle({ x: MARGIN_X, y: y - rowHeight + 3, width: CONTENT_WIDTH, height: rowHeight, color: rgb(0.09, 0.29, 0.46) });
      else if (rowIndex % 2 === 0) page.drawRectangle({ x: MARGIN_X, y: y - rowHeight + 3, width: CONTENT_WIDTH, height: rowHeight, color: rgb(0.96, 0.97, 0.98) });
      for (let column = 0; column < columnCount; column += 1) {
        const lines = cellLines[column] ?? [""];
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
          page.drawText(lines[lineIndex] ?? "", { x: MARGIN_X + column * columnWidth + 6, y: y - 10 - lineIndex * 10, size: 7.5, font: rowIndex === 0 ? bold : regular, color: rowIndex === 0 ? rgb(1, 1, 1) : rgb(0.15, 0.16, 0.18) });
        }
      }
      page.drawRectangle({ x: MARGIN_X, y: y - rowHeight + 3, width: CONTENT_WIDTH, height: rowHeight, borderColor: rgb(0.65, 0.69, 0.73), borderWidth: 0.35 });
      y -= rowHeight;
    }
    y -= 8;
  }

  const bytes = await pdf.save();
  const pdfBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(pdfBuffer).set(bytes);
  saveBlob(name, new Blob([pdfBuffer], { type: "application/pdf" }));
}

/**
 * Renders both the assessment and study guide as PDFs, bundles them into a
 * single ZIP archive, and returns the Blob so the caller can prompt the user.
 */
export async function buildZipBundle(
  assessmentName: string,
  assessmentMarkdown: string,
  guideName: string,
  guideMarkdown: string
): Promise<Blob> {
  const [assessPdf, guidePdf] = await Promise.all([
    (async () => {
      const pdf = await PDFDocument.create();
      pdf.setTitle(plainText(parseMarkdown(assessmentMarkdown).find((b) => b.kind === "heading")?.text ?? "Assessment"));
      pdf.setAuthor("HireMe");
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
      let pageNumber = 0; let page!: PDFPage; let y = 0;
      const newPage = () => { page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]); pageNumber++; drawHeaderFooter(page, pageNumber, regular, bold); y = TOP_Y; };
      const ensureSpace = (h: number) => { if (y - h < BOTTOM_Y) newPage(); };
      const drawLines = (lines: string[], size: number, font: PDFFont, color = rgb(0.15, 0.16, 0.18), x = MARGIN_X, gap = 14) => { for (const line of lines) { ensureSpace(gap); page.drawText(line, { x, y, size, font, color }); y -= gap; } };
      newPage();
      for (const block of parseMarkdown(assessmentMarkdown)) {
        if (block.kind === "spacer") { y -= 8; continue; }
        if (block.kind === "heading") { const size = block.level === 1 ? 18 : block.level === 2 ? 13 : 11; const gap = block.level === 1 ? 23 : block.level === 2 ? 18 : 15; const lines = wrapText(plainText(block.text), bold, size, CONTENT_WIDTH); ensureSpace(lines.length * gap + 12); y -= block.level === 1 ? 8 : 5; drawLines(lines, size, bold, rgb(0.09, 0.29, 0.46), MARGIN_X, gap); y -= 3; continue; }
        if (block.kind === "paragraph") { drawLines(wrapText(plainText(block.text), regular, 9.5, CONTENT_WIDTH), 9.5, regular); y -= 4; continue; }
        if (block.kind === "list") { for (const item of block.items) { drawLines(wrapText(`- ${plainText(item)}`, regular, 9.5, CONTENT_WIDTH - 12), 9.5, regular, rgb(0.15, 0.16, 0.18), MARGIN_X + 10); } y -= 4; continue; }
        if (block.kind === "quote") { const lines = wrapText(plainText(block.text), italic, 9.5, CONTENT_WIDTH - 28); const height = lines.length * 14 + 14; ensureSpace(height); page.drawRectangle({ x: MARGIN_X, y: y - height + 4, width: CONTENT_WIDTH, height, color: rgb(0.92, 0.95, 0.97) }); page.drawRectangle({ x: MARGIN_X, y: y - height + 4, width: 3, height, color: rgb(0.09, 0.29, 0.46) }); drawLines(lines, 9.5, italic, rgb(0.09, 0.29, 0.46), MARGIN_X + 16); y -= 8; continue; }
        const columnCount = Math.max(block.headers.length, 1); const columnWidth = CONTENT_WIDTH / columnCount; const rows = [block.headers, ...block.rows];
        for (let ri = 0; ri < rows.length; ri++) { const row = rows[ri] ?? []; const cellLines = row.map((cell) => wrapText(plainText(cell), ri === 0 ? bold : regular, 7.5, columnWidth - 12)); const rowHeight = Math.max(...cellLines.map((l) => l.length), 1) * 10 + 10; ensureSpace(rowHeight + 2); if (ri === 0) page.drawRectangle({ x: MARGIN_X, y: y - rowHeight + 3, width: CONTENT_WIDTH, height: rowHeight, color: rgb(0.09, 0.29, 0.46) }); else if (ri % 2 === 0) page.drawRectangle({ x: MARGIN_X, y: y - rowHeight + 3, width: CONTENT_WIDTH, height: rowHeight, color: rgb(0.96, 0.97, 0.98) }); for (let col = 0; col < columnCount; col++) { const lines = cellLines[col] ?? [""]; for (let li = 0; li < lines.length; li++) { page.drawText(lines[li] ?? "", { x: MARGIN_X + col * columnWidth + 6, y: y - 10 - li * 10, size: 7.5, font: ri === 0 ? bold : regular, color: ri === 0 ? rgb(1, 1, 1) : rgb(0.15, 0.16, 0.18) }); } } page.drawRectangle({ x: MARGIN_X, y: y - rowHeight + 3, width: CONTENT_WIDTH, height: rowHeight, borderColor: rgb(0.65, 0.69, 0.73), borderWidth: 0.35 }); y -= rowHeight; }
        y -= 8;
      }
      return pdf.save();
    })(),
    (async () => {
      const pdf = await PDFDocument.create();
      pdf.setTitle(plainText(parseMarkdown(guideMarkdown).find((b) => b.kind === "heading")?.text ?? "Study Guide"));
      pdf.setAuthor("HireMe");
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
      let pageNumber = 0; let page!: PDFPage; let y = 0;
      const newPage = () => { page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]); pageNumber++; drawHeaderFooter(page, pageNumber, regular, bold); y = TOP_Y; };
      const ensureSpace = (h: number) => { if (y - h < BOTTOM_Y) newPage(); };
      const drawLines = (lines: string[], size: number, font: PDFFont, color = rgb(0.15, 0.16, 0.18), x = MARGIN_X, gap = 14) => { for (const line of lines) { ensureSpace(gap); page.drawText(line, { x, y, size, font, color }); y -= gap; } };
      newPage();
      for (const block of parseMarkdown(guideMarkdown)) {
        if (block.kind === "spacer") { y -= 8; continue; }
        if (block.kind === "heading") { const size = block.level === 1 ? 18 : block.level === 2 ? 13 : 11; const gap = block.level === 1 ? 23 : block.level === 2 ? 18 : 15; const lines = wrapText(plainText(block.text), bold, size, CONTENT_WIDTH); ensureSpace(lines.length * gap + 12); y -= block.level === 1 ? 8 : 5; drawLines(lines, size, bold, rgb(0.09, 0.29, 0.46), MARGIN_X, gap); y -= 3; continue; }
        if (block.kind === "paragraph") { drawLines(wrapText(plainText(block.text), regular, 9.5, CONTENT_WIDTH), 9.5, regular); y -= 4; continue; }
        if (block.kind === "list") { for (const item of block.items) { drawLines(wrapText(`- ${plainText(item)}`, regular, 9.5, CONTENT_WIDTH - 12), 9.5, regular, rgb(0.15, 0.16, 0.18), MARGIN_X + 10); } y -= 4; continue; }
        if (block.kind === "quote") { const lines = wrapText(plainText(block.text), italic, 9.5, CONTENT_WIDTH - 28); const height = lines.length * 14 + 14; ensureSpace(height); page.drawRectangle({ x: MARGIN_X, y: y - height + 4, width: CONTENT_WIDTH, height, color: rgb(0.92, 0.95, 0.97) }); page.drawRectangle({ x: MARGIN_X, y: y - height + 4, width: 3, height, color: rgb(0.09, 0.29, 0.46) }); drawLines(lines, 9.5, italic, rgb(0.09, 0.29, 0.46), MARGIN_X + 16); y -= 8; continue; }
        const columnCount = Math.max(block.headers.length, 1); const columnWidth = CONTENT_WIDTH / columnCount; const rows = [block.headers, ...block.rows];
        for (let ri = 0; ri < rows.length; ri++) { const row = rows[ri] ?? []; const cellLines = row.map((cell) => wrapText(plainText(cell), ri === 0 ? bold : regular, 7.5, columnWidth - 12)); const rowHeight = Math.max(...cellLines.map((l) => l.length), 1) * 10 + 10; ensureSpace(rowHeight + 2); if (ri === 0) page.drawRectangle({ x: MARGIN_X, y: y - rowHeight + 3, width: CONTENT_WIDTH, height: rowHeight, color: rgb(0.09, 0.29, 0.46) }); else if (ri % 2 === 0) page.drawRectangle({ x: MARGIN_X, y: y - rowHeight + 3, width: CONTENT_WIDTH, height: rowHeight, color: rgb(0.96, 0.97, 0.98) }); for (let col = 0; col < columnCount; col++) { const lines = cellLines[col] ?? [""]; for (let li = 0; li < lines.length; li++) { page.drawText(lines[li] ?? "", { x: MARGIN_X + col * columnWidth + 6, y: y - 10 - li * 10, size: 7.5, font: ri === 0 ? bold : regular, color: ri === 0 ? rgb(1, 1, 1) : rgb(0.15, 0.16, 0.18) }); } } page.drawRectangle({ x: MARGIN_X, y: y - rowHeight + 3, width: CONTENT_WIDTH, height: rowHeight, borderColor: rgb(0.65, 0.69, 0.73), borderWidth: 0.35 }); y -= rowHeight; }
        y -= 8;
      }
      return pdf.save();
    })(),
  ]);

  const zip = new JSZip();
  zip.file(`${assessmentName}.pdf`, assessPdf);
  zip.file(`${guideName}.pdf`, guidePdf);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
