import { describe, expect, it } from "vitest";
import { extractText } from "../lib/extractText";

function minimalPdf(text: string) {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += object;
  }

  const xref = new TextEncoder().encode(pdf).length;
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}

describe("extractText", () => {
  it("recusa PDF com extensão válida e conteúdo falso", async () => {
    const file = new File(["isto não é um PDF"], "curriculo.pdf", {
      type: "application/pdf",
    });

    await expect(extractText(file)).rejects.toThrow("estrutura PDF válida");
  });

  it("extrai texto de um PDF válido", async () => {
    const file = new File([minimalPdf("Curriculo profissional de teste")], "curriculo.pdf", {
      type: "application/pdf",
    });

    await expect(extractText(file)).resolves.toContain("Curriculo profissional de teste");
  });

  it("recusa arquivo DOCX sem estrutura de documento Word", async () => {
    const fakeZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const file = new File([fakeZip], "curriculo.docx");

    await expect(extractText(file)).rejects.toThrow("estrutura DOCX válida");
  });
});
