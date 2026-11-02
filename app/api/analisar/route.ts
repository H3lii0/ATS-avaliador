import { NextResponse } from "next/server";
import { analyzeResume } from "@/lib/analyzer";
import type { AnalysisMode } from "@/lib/analyzer";
import { extractText } from "@/lib/extractText";
import { extractJobFromUrl } from "@/lib/extractJob";
import { acquireAnalysisSlot, consumeRateLimit, requestSizeIsAllowed } from "@/lib/requestGuards";
import { PublicError } from "@/lib/publicError";
import { MAX_REQUEST_SIZE_MB } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_JOB_DESCRIPTION_LENGTH = 30_000;

export async function POST(request: Request) {
  if (!requestSizeIsAllowed(request)) {
    return NextResponse.json(
      { error: `A solicitação excede o limite permitido de ${MAX_REQUEST_SIZE_MB} MB.` },
      { status: 413 },
    );
  }

  const rateLimit = consumeRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas análises foram solicitadas. Aguarde alguns minutos e tente novamente." },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const releaseAnalysisSlot = acquireAnalysisSlot();
  if (!releaseAnalysisSlot) {
    return NextResponse.json(
      { error: "O serviço está processando outras análises. Tente novamente em instantes." },
      { status: 503, headers: { "Retry-After": "5" } },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("curriculo");
    const mode = String(formData.get("modo") ?? "ats") as AnalysisMode;
    const jobSource = String(formData.get("fonteVaga") ?? "text");
    const jobUrl = String(formData.get("linkVaga") ?? "").trim();
    let jobDescription = String(formData.get("vaga") ?? "").trim();
    let extractedJob: Awaited<ReturnType<typeof extractJobFromUrl>> | null = null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecione um currículo." }, { status: 400 });
    }
    if (mode !== "ats" && mode !== "job") {
      return NextResponse.json({ error: "Tipo de análise inválido." }, { status: 400 });
    }
    if (mode === "job" && jobSource !== "text" && jobSource !== "url") {
      return NextResponse.json({ error: "Fonte da vaga inválida." }, { status: 400 });
    }
    if (mode === "job" && jobSource === "text" && jobDescription.length < 80) {
      return NextResponse.json(
        { error: "Cole uma descrição de vaga com pelo menos 80 caracteres." },
        { status: 400 },
      );
    }
    if (
      mode === "job" &&
      jobSource === "text" &&
      jobDescription.length > MAX_JOB_DESCRIPTION_LENGTH
    ) {
      return NextResponse.json(
        { error: "A descrição da vaga deve ter no máximo 30.000 caracteres." },
        { status: 400 },
      );
    }
    if (mode === "job" && jobSource === "url") {
      if (!jobUrl || jobUrl.length > 2048) {
        return NextResponse.json({ error: "Informe um link de vaga válido." }, { status: 400 });
      }
      extractedJob = await extractJobFromUrl(jobUrl);
      jobDescription = extractedJob.text;
    }

    const resumeText = await extractText(file);
    if (resumeText.trim().length < 100) {
      return NextResponse.json(
        { error: "O currículo possui pouco texto legível para uma análise confiável." },
        { status: 422 },
      );
    }

    const analysis = analyzeResume(resumeText, mode, jobDescription);
    return NextResponse.json({
      ...analysis,
      job:
        mode === "job"
          ? jobSource === "url"
            ? {
                source: "url",
                title: extractedJob?.title,
                company: extractedJob?.company,
                url: extractedJob?.url,
                warning: extractedJob?.warning,
              }
            : { source: "text" }
          : undefined,
    });
  } catch (error) {
    if (error instanceof PublicError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Falha interna durante a análise do currículo.", error);
    return NextResponse.json(
      { error: "Não foi possível concluir a análise. Tente novamente em instantes." },
      { status: 500 },
    );
  } finally {
    releaseAnalysisSlot();
  }
}
