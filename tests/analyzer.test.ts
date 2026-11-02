import { describe, expect, it } from "vitest";
import { analyzeResume } from "../lib/analyzer";

const structuredResume = `
Maria Silva
maria@example.com | (85) 99999-9999

RESUMO PROFISSIONAL
Profissional de tecnologia com foco em produtos digitais.

EXPERIÊNCIA PROFISSIONAL
Analista de Produto — 2022 a 2025
Liderou gestão de projetos e aumentou a conversão em 30%.

FORMAÇÃO ACADÊMICA
Graduação em Sistemas de Informação — 2021

COMPETÊNCIAS TÉCNICAS
Gestão de projetos, análise de dados, SQL e comunicação.
`;

describe("analyzeResume", () => {
  it("reconhece as cinco seções principais por títulos de linha", () => {
    const result = analyzeResume(structuredResume, "ats");

    expect(result.stats.sectionsFound).toBe(5);
    expect(result.sections.every((section) => section.found)).toBe(true);
  });

  it("não confunde palavras no meio de frases com títulos de seção", () => {
    const result = analyzeResume(
      "João, joao@example.com. Tenho experiência em formação de equipes e habilidades comerciais.",
      "ats",
    );

    expect(result.sections.find((section) => section.name === "Experiência")?.found).toBe(false);
    expect(result.sections.find((section) => section.name === "Formação")?.found).toBe(false);
  });

  it("aceita uma URL longa sem marcar o texto como corrompido", () => {
    const resume = `${structuredResume}\nhttps://www.linkedin.com/in/perfil-profissional-com-um-endereco-bastante-longo-e-valido`;
    const result = analyzeResume(resume, "ats");
    const readability = result.checks.find((check) => check.name === "Texto legível");

    expect(readability?.passed).toBe(true);
  });

  it("prioriza e reconhece expressões relevantes da vaga", () => {
    const job = `
      Procuramos pessoa com experiência em gestão de projetos, análise de dados e comunicação.
      A gestão de projetos será central para planejar entregas, prazos e indicadores do produto.
    `;
    const result = analyzeResume(structuredResume, "job", job);

    expect(result.matchedKeywords).toContain("gestao projetos");
    expect(result.stats.keywordCoverage).toBeGreaterThan(0);
  });
});
