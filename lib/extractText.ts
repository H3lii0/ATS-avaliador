import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PublicError } from "./publicError";
import { MAX_RESUME_FILE_SIZE_BYTES, MAX_RESUME_FILE_SIZE_MB } from "./limits";

const MAX_PDF_PAGES = 20;

async function configurePdfRuntime() {
  if (process.env.VERCEL !== "1") return;

  // Keep the native canvas import out of the Turbopack ESM graph. Vercel
  // loads it from the external Node.js package at runtime.
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<typeof import("@napi-rs/canvas")>;
  const canvas = await dynamicImport("@napi-rs/canvas");
  const runtime = globalThis as unknown as Record<string, unknown>;

  runtime.DOMMatrix ??= canvas.DOMMatrix;
  runtime.ImageData ??= canvas.ImageData;
  runtime.Path2D ??= canvas.Path2D;
}

function configurePdfWorker(PDFParse: typeof import("pdf-parse").PDFParse) {
  const workerPath = join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs",
  );
  if (!existsSync(workerPath)) {
    throw new Error(`PDF_WORKER_NOT_FOUND: ${workerPath}`);
  }
  PDFParse.setWorker(pathToFileURL(workerPath).href);
}

function hasPdfSignature(data: Uint8Array) {
  const header = new TextDecoder("latin1").decode(data.subarray(0, 1_024));
  return header.includes("%PDF-");
}

function hasDocxStructure(data: Uint8Array) {
  const isZip =
    data.length >= 4 &&
    data[0] === 0x50 &&
    data[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(data[2]) &&
    [0x04, 0x06, 0x08].includes(data[3]);

  if (!isZip) return false;

  const archiveIndex = new TextDecoder("latin1").decode(data);
  return archiveIndex.includes("[Content_Types].xml") && archiveIndex.includes("word/document.xml");
}

export async function extractText(file: File) {
  if (file.size === 0) {
    throw new PublicError("O arquivo enviado está vazio.");
  }
  if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
    throw new PublicError(`O arquivo deve ter no máximo ${MAX_RESUME_FILE_SIZE_MB} MB.`, 413);
  }

  const extension = file.name.toLowerCase().split(".").pop();
  const fileData = await file.arrayBuffer();
  const bytes = new Uint8Array(fileData);

  if (extension === "pdf" || file.type === "application/pdf") {
    if (!hasPdfSignature(bytes)) {
      throw new PublicError("O arquivo não possui uma estrutura PDF válida.", 422);
    }

    await configurePdfRuntime();
    const { PDFParse } = await import("pdf-parse");
    configurePdfWorker(PDFParse);
    const parser = new PDFParse({ data: bytes });

    try {
      const result = await parser.getText();
      if (result.total > MAX_PDF_PAGES) {
        throw new PublicError(`O PDF deve ter no máximo ${MAX_PDF_PAGES} páginas.`, 422);
      }

      if (!result.text.trim()) {
        throw new PublicError(
          "Não foi possível ler o PDF. Envie um PDF pesquisável ou um arquivo DOCX.",
          422,
        );
      }
      return result.text;
    } catch (error) {
      if (error instanceof PublicError) throw error;
      console.error("Falha interna ao processar PDF.", error);
      throw new PublicError(
        "Não foi possível processar o PDF. Verifique se o arquivo está íntegro e não possui senha.",
        422,
      );
    } finally {
      await parser.destroy();
    }
  }

  if (
    extension === "docx" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    if (!hasDocxStructure(bytes)) {
      throw new PublicError("O arquivo não possui uma estrutura DOCX válida.", 422);
    }

    try {
      const mammoth = await import("mammoth");
      const buffer = Buffer.from(fileData);
      const result = await mammoth.extractRawText({ buffer });
      if (!result.value.trim()) {
        throw new PublicError("O arquivo DOCX não contém texto legível.", 422);
      }
      return result.value;
    } catch (error) {
      if (error instanceof PublicError) throw error;
      console.error("Falha interna ao processar DOCX.", error);
      throw new PublicError(
        "Não foi possível processar o DOCX. Verifique se o arquivo está íntegro e não possui senha.",
        422,
      );
    }
  }

  throw new PublicError("Formato não aceito. Envie um arquivo PDF ou DOCX.");
}
