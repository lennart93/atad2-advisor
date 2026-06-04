import mammoth from "mammoth";
import * as XLSX from "xlsx";
import officeparser from "officeparser";

export type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

const MIME = {
  PDF: "application/pdf",
  PNG: "image/png",
  JPG: "image/jpeg",
  WEBP: "image/webp",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  TXT: "text/plain",
  CSV: "text/csv",
  MD: "text/markdown",
} as const;

export const ACCEPTED_MIMES = new Set<string>(Object.values(MIME));

export function isAccepted(mimeType: string): boolean {
  return ACCEPTED_MIMES.has(mimeType);
}

export async function toAnthropicBlock(
  bytes: Uint8Array,
  mimeType: string,
): Promise<AnthropicBlock> {
  if (mimeType === MIME.PDF) {
    // Fast path: PDFs are normally converted to text in the browser (see
    // usePrefill.ts useUploadDocument) and arrive here as text/plain. Raw
    // PDFs only land here when browser extraction was thin/empty (scanned,
    // image-only, signed Deloitte-style outputs). Forward to Claude as a
    // native "document" block — Anthropic does the OCR, no server-side
    // parsing happens here so the edge-runtime wall clock is safe.
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: toBase64(bytes) },
    };
  }
  if (mimeType === MIME.PNG || mimeType === MIME.JPG || mimeType === MIME.WEBP) {
    return { type: "image", source: { type: "base64", media_type: mimeType, data: toBase64(bytes) } };
  }
  if (mimeType === MIME.DOCX) {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const result = await mammoth.extractRawText({ arrayBuffer: buf });
    return { type: "text", text: result.value };
  }
  if (mimeType === MIME.PPTX) {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const text = await new Promise<string>((resolve, reject) => {
      officeparser.parseOffice(new Uint8Array(buf), (err: Error | null, data: string) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    return { type: "text", text };
  }
  if (mimeType === MIME.XLSX) {
    const wb = XLSX.read(bytes, { type: "array" });
    const parts: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const md = XLSX.utils.sheet_to_csv(sheet);
      parts.push(`### Sheet: ${sheetName}\n\n${md}`);
    }
    return { type: "text", text: parts.join("\n\n") };
  }
  if (mimeType === MIME.TXT || mimeType === MIME.CSV || mimeType === MIME.MD) {
    return { type: "text", text: new TextDecoder().decode(bytes) };
  }
  throw new Error(`Unsupported mime type: ${mimeType}`);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
