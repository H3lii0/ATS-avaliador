import { randomUUID } from "node:crypto";

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

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "UnknownError", message: String(error) };
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  let stage = "request.received";

  if (!requestSizeIsAllowed(request)) {
    return NextResponse.json(
      { error: `A solicitação excede o limite permitido de ${MAX_REQUEST_SIZE_MB} MB.`, requestId },
      { status: 413, headers: { "x-request-id": requestId } },
    );
  }

  const rateLimit = consumeRateLimit(request);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Muitas análises foram solicitadas. Aguarde alguns minutos e tente novamente.",
        requestId,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "x-request-id": requestId,
        },
      },
    );
  }

  const releaseAnalysisSlot = acquireAnalysisSlot();
  if (!releaseAnalysisSlot) {
    return NextResponse.json(
      {
        error: "O serviço está processando outras análises. Tente novamente em instantes.",
        requestId,
      },
      { status: 503, headers: { "Retry-After": "5", "x-request-id": requestId } },
    );
  }

  try {
    stage = "request.formData";
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
      stage = "job.fetch";
      if (!jobUrl || jobUrl.length > 2048) {
        return NextResponse.json({ error: "Informe um link de vaga válido." }, { status: 400 });
      }
      extractedJob = await extractJobFromUrl(jobUrl);
      jobDescription = extractedJob.text;
    }

    stage = "resume.extract";
    const resumeText = await extractText(file);
    if (resumeText.trim().length < 100) {
      return NextResponse.json(
        { error: "O currículo possui pouco texto legível para uma análise confiável." },
        { status: 422 },
      );
    }

    stage = "resume.analyze";
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
      console.warn(
        "[analysis_public_error]",
        JSON.stringify({ requestId, stage, status: error.status, message: error.message }),
      );
      return NextResponse.json(
        { error: error.message, requestId },
        { status: error.status, headers: { "x-request-id": requestId } },
      );
    }

    console.error(
      "[analysis_internal_error]",
      JSON.stringify({
        requestId,
        stage,
        nodeVersion: process.version,
        platform: process.env.VERCEL ? "vercel" : process.platform,
        cwd: process.cwd(),
        error: errorDetails(error),
      }),
    );
    return NextResponse.json(
      {
        error: "Não foi possível concluir a análise. Tente novamente em instantes.",
        requestId,
      },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  } finally {
    releaseAnalysisSlot();
  }
}
