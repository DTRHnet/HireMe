import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { z } from "zod";
import type { ExtractedDocument, InputKind, SourceSpan } from "../shared/hireme";

export const extractDocumentInput = z.object({
  kind: z.enum(["job", "resume"]),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(150).nullable().optional(),
  base64: z.string().min(1),
});

function makeSpans(kind: InputKind, text: string, page: number | null = null): SourceSpan[] {
  let cursor = 0;
  return text.split(/\n+/).map((line, index) => {
    const start = cursor;
    cursor += line.length + 1;
    return { id: `${kind}-span-${index + 1}`, source: kind, section: null, page, text: line.trim(), start, end: start + line.length };
  }).filter((span) => span.text.length > 0);
}

export async function extractDocument(input: z.infer<typeof extractDocumentInput>): Promise<ExtractedDocument> {
  const extension = input.fileName.toLowerCase().split(".").pop();
  const bytes = Buffer.from(input.base64, "base64");
  let text = "";
  let provenance: ExtractedDocument["provenance"] = extension === "pdf" ? "pdf" : extension === "docx" ? "docx" : "txt";
  const warnings: string[] = [];
  if (extension === "txt") {
    text = bytes.toString("utf8").trim();
  } else if (extension === "pdf") {
    const parser = new PDFParse({ data: bytes });
    const parsed = await parser.getText();
    await parser.destroy();
    text = parsed.text.trim();
    if (!text) warnings.push("The PDF contains no selectable text. It may be image-only; provide an OCR-readable copy rather than guessing.");
    if (parsed.total > 1) warnings.push(`Extracted selectable text from ${parsed.total} PDF pages. Review the preview for layout-sensitive omissions.`);
  } else if (extension === "docx") {
    const parsed = await mammoth.extractRawText({ buffer: bytes });
    text = parsed.value.trim();
    for (const message of parsed.messages) warnings.push(message.message);
  } else {
    throw new Error("Unsupported file type. Use PDF, DOCX, or TXT.");
  }
  if (!text) warnings.push("No readable text was extracted. Replace the file or paste the source text.");
  return { kind: input.kind, fileName: input.fileName, mimeType: input.mimeType ?? null, text, provenance, warnings, sourceSpans: makeSpans(input.kind, text) };
}
