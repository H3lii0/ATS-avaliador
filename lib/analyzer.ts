export type AnalysisMode = "ats" | "job";

export type AnalysisResult = {
  mode: AnalysisMode;
  job?: {
    source: "text" | "url";
    title?: string;
    company?: string;
    url?: string;
    warning?: string;
  };
  score: number;
  summary: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  sections: { name: string; found: boolean }[];
  checks: { name: string; passed: boolean; detail: string }[];
  strengths: string[];
  recommendations: string[];
  stats: {
    words: number;
    keywordCoverage: number | null;
    sectionsFound: number;
    checksPassed: number;
  };
};

const STOP_WORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "como",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "esta",
  "este",
  "experiencia",
  "para",
  "por",
  "que",
  "se",
  "ser",
  "sua",
  "suas",
  "um",
  "uma",
  "ter",
  "nos",
  "na",
  "nas",
  "no",
  "os",
  "ou",
  "mais",
  "vaga",
  "cargo",
  "area",
  "sera",
  "sao",
  "anos",
  "nivel",
  "buscamos",
  "procuramos",
  "profissional",
  "responsavel",
  "atividades",
  "requisitos",
  "desejavel",
  "diferencial",
  "conhecimento",
  "conhecimentos",
  "habilidade",
  "habilidades",
  "capacidade",
  "empresa",
  "trabalho",
  "time",
  "equipe",
]);

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type KeywordCandidate = {
  term: string;
  weight: number;
};

function isRelevantWord(word: string) {
  return word.length >= 3 && !STOP_WORDS.has(word) && !/^\d+$/.test(word);
}

function jobKeywords(jobText: string): KeywordCandidate[] {
  const words = normalize(jobText).match(/[a-z0-9+#.]{3,}/g) ?? [];
  const relevantWords = words.filter(isRelevantWord);
  const wordFrequency = new Map<string, number>();
  const phraseFrequency = new Map<string, number>();

  for (const word of relevantWords) {
    wordFrequency.set(word, (wordFrequency.get(word) ?? 0) + 1);
  }

  for (let index = 0; index < relevantWords.length - 1; index++) {
    const word = relevantWords[index];
    const nextWord = relevantWords[index + 1];
    if (nextWord) {
      const phrase = `${word} ${nextWord}`;
      phraseFrequency.set(phrase, (phraseFrequency.get(phrase) ?? 0) + 1);
    }
  }

  const candidates: KeywordCandidate[] = [
    ...[...wordFrequency].map(([term, count]) => ({ term, weight: count })),
    ...[...phraseFrequency].map(([term, count]) => ({ term, weight: count * 2.25 })),
  ];

  return candidates
    .sort((a, b) => b.weight - a.weight || b.term.length - a.term.length)
    .slice(0, 20);
}

const SECTION_DEFINITIONS = [
  {
    name: "Resumo profissional",
    pattern: /^(?:resumo|perfil|objetivo|summary)(?: profissional)?$/,
  },
  {
    name: "Experiência",
    pattern:
      /^(?:experiencia|experiencias|historico|work experience)(?: profissional|profissionais)?$/,
  },
  { name: "Formação", pattern: /^(?:formacao|educacao|graduacao|education)(?: academica)?$/ },
  {
    name: "Competências",
    pattern: /^(?:competencias|habilidades|conhecimentos|skills)(?: tecnicas)?$/,
  },
];

function recognizedSectionHeadings(resumeText: string) {
  const headings = resumeText
    .split(/\r?\n/)
    .map((line) =>
      normalize(line)
        .replace(/^[-–—|:]+|[-–—|:]+$/g, "")
        .trim(),
    )
    .filter((line) => line.length > 0 && line.length <= 60 && line.split(" ").length <= 6);

  return SECTION_DEFINITIONS.map((section) => ({
    name: section.name,
    found: headings.some((heading) => section.pattern.test(heading)),
  }));
}

function getResumeProfile(resumeText: string) {
  const wordCount = resumeText.trim().split(/\s+/).filter(Boolean).length;
  const hasContact =
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/i.test(
      resumeText,
    );
  const sections = [
    { name: "Contato", found: hasContact },
    ...recognizedSectionHeadings(resumeText),
  ];
  const hasDates =
    /\b(?:19|20)\d{2}\b|\b(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\b/i.test(
      resumeText,
    );
  const hasResults =
    /\b\d+(?:[.,]\d+)?\s*(?:%|milh(?:ao|oes|ão|ões)|mil|clientes?|projetos?|pessoas?)\b|R\$\s*\d/i.test(
      resumeText,
    );
  const suspiciousLongToken = resumeText
    .split(/\s+/)
    .some(
      (token) =>
        token.length > 80 && !/^(?:https?:\/\/|www\.)/i.test(token) && !token.includes("@"),
    );
  const hasCleanText = !/[�]{2,}/.test(resumeText) && !suspiciousLongToken;

  const checks = [
    {
      name: "Contato identificável",
      passed: hasContact,
      detail: hasContact
        ? "E-mail ou telefone reconhecido."
        : "Não encontramos e-mail ou telefone no texto.",
    },
    {
      name: "Experiência profissional",
      passed: sections[2].found,
      detail: sections[2].found
        ? "Seção de experiência reconhecida."
        : "Use um título convencional para experiências.",
    },
    {
      name: "Formação",
      passed: sections[3].found,
      detail: sections[3].found
        ? "Seção de formação reconhecida."
        : "A seção de formação não foi reconhecida.",
    },
    {
      name: "Competências",
      passed: sections[4].found,
      detail: sections[4].found
        ? "Seção de competências reconhecida."
        : "Crie uma seção objetiva de competências.",
    },
    {
      name: "Resumo profissional",
      passed: sections[1].found,
      detail: sections[1].found
        ? "Resumo ou perfil profissional reconhecido."
        : "Considere incluir um resumo profissional curto.",
    },
    {
      name: "Extensão adequada",
      passed: wordCount >= 250 && wordCount <= 1200,
      detail:
        wordCount < 250
          ? "O currículo está curto e pode precisar de mais evidências."
          : wordCount > 1200
            ? "O currículo está longo; priorize as informações mais relevantes."
            : "Quantidade de texto adequada para leitura automática.",
    },
    {
      name: "Datas reconhecíveis",
      passed: hasDates,
      detail: hasDates
        ? "Datas de trajetória foram identificadas."
        : "Use datas claras, como 2022–2025 ou jan/2024.",
    },
    {
      name: "Resultados mensuráveis",
      passed: hasResults,
      detail: hasResults
        ? "Há números ou resultados quantificados."
        : "Inclua números apenas quando forem reais e verificáveis.",
    },
    {
      name: "Texto legível",
      passed: hasCleanText,
      detail: hasCleanText
        ? "Não encontramos sinais relevantes de texto corrompido."
        : "Há caracteres ou blocos que podem prejudicar a leitura.",
    },
  ];

  return { sections, wordCount, checks };
}

function analyzeAtsStandard(resumeText: string): AnalysisResult {
  const { sections, wordCount, checks } = getResumeProfile(resumeText);
  const weights = [15, 15, 10, 10, 5, 15, 10, 10, 10];
  const score = checks.reduce(
    (total, check, index) => total + (check.passed ? weights[index] : 0),
    0,
  );
  const strengths = checks
    .filter((check) => check.passed)
    .map((check) => check.detail)
    .slice(0, 4);
  const recommendations = checks
    .filter((check) => !check.passed)
    .map((check) => check.detail)
    .slice(0, 7);
  const sectionsFound = sections.filter((section) => section.found).length;
  const checksPassed = checks.filter((check) => check.passed).length;

  return {
    mode: "ats",
    score,
    summary:
      score >= 80
        ? "O currículo está bem estruturado para leitura por sistemas ATS."
        : score >= 55
          ? "O currículo atende parte dos padrões ATS, mas ainda pode melhorar."
          : "O currículo precisa de ajustes importantes para uma leitura ATS mais segura.",
    matchedKeywords: [],
    missingKeywords: [],
    sections,
    checks,
    strengths: strengths.length
      ? strengths
      : ["O documento possui texto legível para iniciar a análise."],
    recommendations: recommendations.length
      ? recommendations
      : [
          "Mantenha títulos simples, ordem cronológica clara e formatação sem elementos decorativos.",
        ],
    stats: { words: wordCount, keywordCoverage: null, sectionsFound, checksPassed },
  };
}

function analyzeJobMatch(resumeText: string, jobText: string): AnalysisResult {
  const { sections, wordCount, checks } = getResumeProfile(resumeText);
  const normalizedResume = normalize(resumeText);
  const keywords = jobKeywords(jobText);
  const searchableResume = ` ${(normalizedResume.match(/[a-z0-9+#.]{3,}/g) ?? [])
    .filter(isRelevantWord)
    .join(" ")} `;
  const matchedCandidates = keywords.filter(({ term }) => searchableResume.includes(` ${term} `));
  const missingCandidates = keywords.filter(({ term }) => !searchableResume.includes(` ${term} `));
  const matchedKeywords = matchedCandidates.map(({ term }) => term);
  const missingKeywords = missingCandidates.map(({ term }) => term);
  const sectionsFound = sections.filter((section) => section.found).length;
  const checksPassed = checks.filter((check) => check.passed).length;
  const totalKeywordWeight = keywords.reduce((total, keyword) => total + keyword.weight, 0);
  const matchedKeywordWeight = matchedCandidates.reduce(
    (total, keyword) => total + keyword.weight,
    0,
  );
  const keywordCoverage = totalKeywordWeight
    ? Math.round((matchedKeywordWeight / totalKeywordWeight) * 100)
    : 0;

  const keywordScore = keywordCoverage * 0.65;
  const atsScore = analyzeAtsStandard(resumeText).score;
  const score = Math.round(Math.min(100, keywordScore + atsScore * 0.35));

  const strengths: string[] = [];
  if (keywordCoverage >= 70) strengths.push("Boa cobertura dos termos mais relevantes da vaga.");
  if (sectionsFound >= 4)
    strengths.push("Estrutura clara, com as principais seções reconhecíveis.");
  if (wordCount >= 250 && wordCount <= 1200)
    strengths.push("Extensão adequada para uma leitura objetiva.");
  if (!strengths.length)
    strengths.push("O currículo possui conteúdo aproveitável para ser direcionado à vaga.");

  const recommendations: string[] = [];
  if (missingKeywords.length) {
    recommendations.push(
      `Revise os termos ausentes mais relevantes: ${missingKeywords.slice(0, 6).join(", ")}. Inclua apenas os que correspondem à sua experiência real.`,
    );
  }
  for (const section of sections.filter((item) => !item.found)) {
    recommendations.push(`Use um título convencional e visível para a seção “${section.name}”.`);
  }
  if (wordCount < 250)
    recommendations.push("Detalhe realizações, responsabilidades e resultados mensuráveis.");
  if (wordCount > 1200)
    recommendations.push("Reduza repetições e priorize experiências relacionadas à vaga.");
  if (!recommendations.length)
    recommendations.push("Faça uma revisão final de ortografia e mantenha a formatação simples.");

  const summary =
    score >= 75
      ? "O currículo apresenta boa compatibilidade inicial com a vaga."
      : score >= 50
        ? "O currículo tem compatibilidade moderada e pode ser mais direcionado."
        : "O currículo precisa destacar melhor as evidências relacionadas à vaga.";

  return {
    mode: "job",
    score,
    summary,
    matchedKeywords,
    missingKeywords,
    sections,
    checks,
    strengths,
    recommendations: recommendations.slice(0, 7),
    stats: { words: wordCount, keywordCoverage, sectionsFound, checksPassed },
  };
}

export function analyzeResume(
  resumeText: string,
  mode: AnalysisMode,
  jobText = "",
): AnalysisResult {
  return mode === "job" ? analyzeJobMatch(resumeText, jobText) : analyzeAtsStandard(resumeText);
}
