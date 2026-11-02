"use client";

import { DragEvent, FormEvent, useRef, useState } from "react";
import type { AnalysisMode, AnalysisResult } from "@/lib/analyzer";
import { MAX_RESUME_FILE_SIZE_BYTES, MAX_RESUME_FILE_SIZE_MB } from "@/lib/limits";

const FileIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.6a1 1 0 0 1 .7.3l5.4 5.4a1 1 0 0 1 .3.7V19a2 2 0 0 1-2 2Z" />
  </svg>
);

const CompareIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 7h12m0 0-4-4m4 4-4 4m0 6H4m0 0 4 4m-4-4 4-4" />
  </svg>
);

const BrandDocumentIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3.5h6.8L18.5 8v12.5H7z" />
    <path d="M13.5 3.5V8h5M9.7 12h6.1M9.7 15.2h6.1M9.7 18.4h4.2" />
  </svg>
);

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<AnalysisMode>("ats");
  const [job, setJob] = useState("");
  const [jobSource, setJobSource] = useState<"text" | "url">("text");
  const [jobUrl, setJobUrl] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function chooseMode(nextMode: AnalysisMode) {
    setMode(nextMode);
    setError("");
    setResult(null);
  }

  function acceptFile(nextFile: File | null) {
    if (nextFile && nextFile.size > MAX_RESUME_FILE_SIZE_BYTES) {
      setFile(null);
      setError(`O arquivo deve ter no máximo ${MAX_RESUME_FILE_SIZE_MB} MB.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    if (nextFile && !/\.(?:pdf|docx)$/i.test(nextFile.name)) {
      setFile(null);
      setError("Formato não aceito. Envie um arquivo PDF ou DOCX.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setFile(nextFile);
    setError("");
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return setError("Selecione um currículo em PDF ou DOCX.");
    if (mode === "job" && jobSource === "text" && job.trim().length < 80) {
      return setError("Cole uma descrição de vaga com pelo menos 80 caracteres.");
    }
    if (mode === "job" && jobSource === "url" && !jobUrl.trim()) {
      return setError("Informe o link da vaga.");
    }

    setLoading(true);
    setError("");
    const data = new FormData();
    data.append("curriculo", file);
    data.append("modo", mode);
    data.append("fonteVaga", jobSource);
    data.append("vaga", job);
    data.append("linkVaga", jobUrl);

    try {
      const response = await fetch("/api/analisar", { method: "POST", body: data });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Falha na análise.");
      setResult(payload);
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir a análise.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFile(null);
    setMode("ats");
    setJob("");
    setJobSource("text");
    setJobUrl("");
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="topbarInner">
          <a className="brand" href="#inicio" aria-label="Análise Curricular, início">
            <span className="brandMark">
              <BrandDocumentIcon />
            </span>
            <span>
              Análise<strong>Curricular</strong>
            </span>
          </a>
          <span className="privacy">
            <i /> Seus dados não são armazenados
          </span>
        </div>
      </header>

      <main className="mainContent" id="inicio">
        <section className="hero">
          <span className="eyebrow">Avaliador de Currículos ATS</span>
          <h1>
            Seu currículo está
            <br className="desktopBreak" /> pronto para o ATS?
          </h1>
          <p>
            Confira a estrutura do documento ou compare seu currículo com uma vaga específica. Você
            escolhe o tipo de análise.
          </p>
          <div className="viewSwitch" aria-label="Etapa atual">
            <span className={!result ? "active" : ""}>1. Formulário de Envio</span>
            <span className={result ? "active" : ""}>
              2. Resultado da Análise{result ? ` (${result.score}/100)` : ""}
            </span>
          </div>
        </section>

        {!result ? (
          <section className="workspace">
            <form className="analysisForm" onSubmit={submit}>
              <fieldset className="modeSelector">
                <legend>Escolha o tipo de análise</legend>
                <div className="modeGrid">
                  <label className={`modeOption ${mode === "ats" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="modo"
                      value="ats"
                      checked={mode === "ats"}
                      onChange={() => chooseMode("ats")}
                    />
                    <span className="modeIcon">
                      <FileIcon />
                    </span>
                    <span>
                      <strong>Análise ATS</strong>
                      <small>Avalia estrutura e padrão do currículo, sem uma vaga.</small>
                    </span>
                  </label>
                  <label className={`modeOption ${mode === "job" ? "active" : ""}`}>
                    <input
                      type="radio"
                      name="modo"
                      value="job"
                      checked={mode === "job"}
                      onChange={() => chooseMode("job")}
                    />
                    <span className="modeIcon">
                      <CompareIcon />
                    </span>
                    <span>
                      <strong>Comparar com vaga</strong>
                      <small>Verifica aderência, termos centrais encontrados e ausentes.</small>
                    </span>
                  </label>
                </div>
              </fieldset>

              <div className="formDivider" />
              <div className="stepHeading">
                <span>01</span>
                <div>
                  <h2>Envie seu currículo</h2>
                  <p>PDF ou DOCX, com até {MAX_RESUME_FILE_SIZE_MB} MB.</p>
                </div>
              </div>
              <label
                className={`dropzone ${file ? "hasFile" : ""} ${dragging ? "dragging" : ""}`}
                onDragEnter={() => setDragging(true)}
                onDragLeave={() => setDragging(false)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
                />
                <span className="uploadIcon">{file ? "✓" : "↑"}</span>
                <strong>{file ? file.name : "Clique para escolher o arquivo"}</strong>
                <small>
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(2)} MB • Pronto para análise ATS`
                    : "ou arraste e solte aqui"}
                </small>
              </label>

              {mode === "job" && (
                <div className="jobStep">
                  <div className="stepHeading">
                    <span>02</span>
                    <div>
                      <h2>Informe a vaga</h2>
                      <p>Cole a descrição ou deixe o sistema tentar ler o link.</p>
                    </div>
                  </div>
                  <div
                    className="jobSourceSelector"
                    role="group"
                    aria-label="Forma de informar a vaga"
                  >
                    <button
                      type="button"
                      className={jobSource === "text" ? "active" : ""}
                      onClick={() => {
                        setJobSource("text");
                        setError("");
                      }}
                    >
                      Colar descrição
                    </button>
                    <button
                      type="button"
                      className={jobSource === "url" ? "active" : ""}
                      onClick={() => {
                        setJobSource("url");
                        setError("");
                      }}
                    >
                      Usar link da vaga
                    </button>
                  </div>
                  {jobSource === "text" ? (
                    <div className="textareaWrap">
                      <textarea
                        value={job}
                        onChange={(event) => setJob(event.target.value)}
                        placeholder="Cole aqui responsabilidades, requisitos, qualificações e diferenciais da vaga..."
                        minLength={80}
                        maxLength={30000}
                        required
                      />
                      <span>{job.length} caracteres</span>
                    </div>
                  ) : (
                    <div className="urlInputWrap">
                      <input
                        id="job-url"
                        type="url"
                        inputMode="url"
                        value={jobUrl}
                        onChange={(event) => setJobUrl(event.target.value)}
                        placeholder="https://empresa.com/vagas/..."
                        required
                        aria-label="Link público da vaga"
                      />
                      <small>
                        Funciona com páginas públicas em HTTPS. Sites com login ou bloqueio podem
                        exigir a descrição manual.
                      </small>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <button className="primary" disabled={loading} type="submit">
                <span>
                  {loading
                    ? "Analisando..."
                    : mode === "ats"
                      ? "Avaliar padrão ATS"
                      : "Comparar com a vaga"}
                </span>
                <b aria-hidden="true">{loading ? "·" : "→"}</b>
              </button>
              <p className="disclaimer">
                A análise é orientativa e não representa a pontuação de um ATS específico.
              </p>
            </form>

            <aside className="sideNote">
              <div className="infoCard">
                <p className="mono">Como funciona</p>
                {mode === "ats" ? (
                  <ol>
                    <li>
                      <span>1</span>Extraímos o texto do documento com fidelidade de estrutura.
                    </li>
                    <li>
                      <span>2</span>Verificamos seções, contato e legibilidade para robôs de
                      triagem.
                    </li>
                    <li>
                      <span>3</span>Apontamos ajustes objetivos para o padrão ATS.
                    </li>
                  </ol>
                ) : (
                  <ol>
                    <li>
                      <span>1</span>Extraímos o texto do documento com fidelidade de estrutura.
                    </li>
                    <li>
                      <span>2</span>Identificamos os termos centrais da vaga e cruzamos com seu
                      documento.
                    </li>
                    <li>
                      <span>3</span>Apontamos ajustes objetivos e termos recomendados.
                    </li>
                  </ol>
                )}
              </div>
              <div className="privacyCard">
                <span>◇</span>
                <div>
                  <strong>Privacidade em primeiro lugar</strong>
                  <p>
                    O arquivo é processado temporariamente apenas durante a solicitação. Nenhum
                    currículo ou dado de perfil é salvo em nossos servidores.
                  </p>
                </div>
              </div>
            </aside>
          </section>
        ) : (
          <Results result={result} onReset={reset} />
        )}
      </main>

      <footer>
        <div>
          <strong>Análise Curricular</strong>
          <span>— Otimização transparente para seleção e triagem.</span>
        </div>
        <span>Privacidade garantida • Nenhum currículo retido</span>
      </footer>
    </div>
  );
}

function Results({ result, onReset }: { result: AnalysisResult; onReset: () => void }) {
  return (
    <section className="results" id="resultado">
      <div className="resultIntro">
        <div
          className="score"
          style={{ "--score": `${result.score * 3.6}deg` } as React.CSSProperties}
        >
          <div>
            <strong>{result.score}</strong>
            <span>/100</span>
          </div>
        </div>
        <div>
          <p className="mono">Resultado da análise</p>
          <h2>{result.summary}</h2>
          <p>Cada recomendação abaixo está ligada ao conteúdo que conseguimos ler no documento.</p>
        </div>
      </div>

      {result.job?.source === "url" && (
        <div className="importedJob">
          <span>Vaga lida pelo link</span>
          <div>
            <strong>{result.job.title || "Descrição da vaga identificada"}</strong>
            {result.job.company && <small>{result.job.company}</small>}
          </div>
          {result.job.url && (
            <a href={result.job.url} target="_blank" rel="noreferrer">
              Abrir origem ↗
            </a>
          )}
          {result.job.warning && <p className="importedJobWarning">⚠ {result.job.warning}</p>}
        </div>
      )}

      <div className="metrics">
        <article>
          <span>{result.mode === "job" ? "Cobertura de termos" : "Critérios aprovados"}</span>
          <strong>
            {result.mode === "job"
              ? `${result.stats.keywordCoverage}%`
              : `${result.stats.checksPassed}/${result.checks.length}`}
          </strong>
        </article>
        <article>
          <span>Seções reconhecidas</span>
          <strong>{result.stats.sectionsFound}/5</strong>
        </article>
        <article>
          <span>Palavras no currículo</span>
          <strong>{result.stats.words}</strong>
        </article>
      </div>

      <details className="metricsHelp">
        <summary>Entenda como interpretar estes indicadores</summary>
        <div className="metricsHelpContent">
          <article>
            <h3>Nota geral</h3>
            <p>
              {result.mode === "job"
                ? "Na comparação com uma vaga, a nota combina a compatibilidade dos termos da vaga (65%) com a estrutura ATS do currículo (35%). Por isso, um currículo pode estar bem organizado e ainda ter uma nota menor quando poucos requisitos aparecem no texto."
                : "Na análise ATS, a nota representa quantos critérios de estrutura, legibilidade e conteúdo básico do currículo foram atendidos."}
            </p>
          </article>
          <article>
            <h3>{result.mode === "job" ? "Cobertura de termos" : "Critérios aprovados"}</h3>
            <p>
              {result.mode === "job"
                ? "Mostra a proporção dos termos relevantes extraídos da vaga que também foram encontrados no currículo. É uma comparação textual: a ausência de um termo não prova que você não tenha a habilidade, pois pode ter usado outra expressão."
                : "Mostra quantas verificações de estrutura e legibilidade foram aprovadas, como contato, seções, datas e resultados mensuráveis."}
            </p>
            {result.mode === "job" && (
              <p className="metricsHelpExample">
                Exemplo: 14% significa que poucos termos priorizados da vaga foram identificados no
                currículo; revise a lista abaixo e inclua apenas os itens que representam sua
                experiência real.
              </p>
            )}
          </article>
          <article>
            <h3>Seções reconhecidas</h3>
            <p>
              Indica se o sistema encontrou títulos convencionais para Contato, Resumo profissional,
              Experiência, Formação e Competências. Essa métrica mede a organização do documento,
              não a sua compatibilidade com a vaga.
            </p>
          </article>
          <article>
            <h3>Tamanho do currículo</h3>
            <p>
              A quantidade de palavras ajuda a verificar se o documento está curto demais ou extenso
              demais para uma leitura objetiva. Ela não mede a qualidade das suas experiências nem
              substitui a análise do conteúdo.
            </p>
          </article>
          {result.mode === "job" && (
            <article>
              <h3>Termos encontrados e a revisar</h3>
              <p>
                Os termos encontrados aparecem no texto do currículo. Os termos a revisar foram
                identificados na vaga, mas não foram localizados com a mesma forma no documento.
                Confira o contexto antes de fazer qualquer alteração e não inclua palavras que não
                correspondam à sua experiência.
              </p>
            </article>
          )}
        </div>
      </details>

      <div className="resultGrid">
        {result.mode === "job" ? (
          <>
            <article className="panel">
              <p className="mono">Termos encontrados</p>
              <div className="tags good">
                {result.matchedKeywords.length ? (
                  result.matchedKeywords.map((item) => <span key={item}>{item}</span>)
                ) : (
                  <em>Nenhum termo relevante identificado.</em>
                )}
              </div>
            </article>
            <article className="panel">
              <p className="mono">Termos a revisar</p>
              <div className="tags missing">
                {result.missingKeywords.length ? (
                  result.missingKeywords.map((item) => <span key={item}>{item}</span>)
                ) : (
                  <em>Não há termos prioritários ausentes.</em>
                )}
              </div>
            </article>
          </>
        ) : (
          <>
            <article className="panel checksPanel">
              <p className="mono">Verificações ATS</p>
              <div className="checkList">
                {result.checks.map((check) => (
                  <div key={check.name} className={check.passed ? "passed" : "failed"}>
                    <span>{check.passed ? "✓" : "!"}</span>
                    <div>
                      <strong>{check.name}</strong>
                      <small>{check.detail}</small>
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel">
              <p className="mono">Seções do currículo</p>
              <div className="sectionList">
                {result.sections.map((section) => (
                  <span key={section.name} className={section.found ? "found" : "notFound"}>
                    {section.found ? "✓" : "—"} {section.name}
                  </span>
                ))}
              </div>
            </article>
          </>
        )}
        <article className="panel">
          <p className="mono">Pontos fortes</p>
          <ul>
            {result.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
        <article className="panel">
          <p className="mono">Melhorias prioritárias</p>
          <ol>
            {result.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </article>
      </div>
      <button className="secondary" onClick={onReset}>
        Analisar outro currículo
      </button>
    </section>
  );
}
