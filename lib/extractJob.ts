import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";
import * as cheerio from "cheerio";
import { PublicError } from "./publicError";

const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

export type ExtractedJob = {
  text: string;
  title?: string;
  company?: string;
  url: string;
  warning?: string;
};

function isBlockedIpv4(address: string) {
  const parts = address.split(".").map(Number);
  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIp(address: string) {
  const normalized = address.toLowerCase().split("%")[0];

  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice(7);
    return isIP(mappedIpv4) === 4 ? isBlockedIpv4(mappedIpv4) : true;
  }

  if (isIP(normalized) === 4) return isBlockedIpv4(normalized);
  if (isIP(normalized) === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff")
    );
  }

  return true;
}

async function validatePublicUrl(rawUrl: string) {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new PublicError("Informe um link de vaga válido.");
  }

  if (url.protocol !== "https:") {
    throw new PublicError("O link da vaga deve usar HTTPS.");
  }
  if (url.username || url.password) {
    throw new PublicError("Links com usuário ou senha não são aceitos.");
  }
  if (url.port && url.port !== "443") {
    throw new PublicError("O link deve utilizar a porta HTTPS padrão.");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost")) {
    throw new PublicError("Endereços locais não são aceitos.");
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new PublicError("Não foi possível localizar o endereço da vaga.");
  }
  if (!addresses.length || addresses.some(({ address }) => isBlockedIp(address))) {
    throw new PublicError("O endereço informado não pode ser acessado.");
  }

  return {
    url,
    address: addresses[0].address,
    family: addresses[0].family,
  };
}

async function readLimitedBody(response: IncomingMessage) {
  const declaredSize = Number(response.headers["content-length"] ?? 0);
  if (declaredSize > MAX_PAGE_BYTES) {
    response.destroy();
    throw new PublicError("A página da vaga é muito grande para ser processada.");
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  for await (const chunk of response) {
    const value = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += value.byteLength;
    if (total > MAX_PAGE_BYTES) {
      response.destroy();
      throw new PublicError("A página da vaga excede o limite de 2 MB.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const contentType = String(response.headers["content-type"] ?? "");
  const charset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

type ValidatedTarget = Awaited<ReturnType<typeof validatePublicUrl>>;

function requestJobPage(target: ValidatedTarget) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: target.address,
        family: target.family,
        port: 443,
        path: `${target.url.pathname}${target.url.search}`,
        method: "GET",
        servername: target.url.hostname,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8",
          "Accept-Encoding": "identity",
          Host: target.url.host,
          "User-Agent": "AnaliseCurricular/1.0 (+job-analysis)",
        },
      },
      resolve,
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error("JOB_FETCH_TIMEOUT"));
    });
    request.on("error", reject);
    request.end();
  });
}

async function fetchJobPage(initialUrl: string) {
  let currentTarget = await validatePublicUrl(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    try {
      const response = await requestJobPage(currentTarget);
      const status = response.statusCode ?? 0;

      if (status >= 300 && status < 400) {
        const rawLocation = response.headers.location;
        const location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation;
        response.resume();
        if (!location) throw new PublicError("A página redirecionou sem informar o destino.");
        if (redirectCount === MAX_REDIRECTS)
          throw new PublicError("A página possui redirecionamentos demais.");
        currentTarget = await validatePublicUrl(new URL(location, currentTarget.url).toString());
        continue;
      }

      if (status < 200 || status >= 300) {
        response.resume();
        throw new PublicError(`A página da vaga respondeu com o código ${status}.`);
      }

      const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
      if (
        !/(?:text\/html|application\/xhtml\+xml|application\/json|text\/plain)/.test(contentType)
      ) {
        response.resume();
        throw new PublicError("O link não retornou uma página HTML, JSON ou texto.");
      }

      return {
        body: await readLimitedBody(response),
        contentType,
        finalUrl: currentTarget.url.toString(),
      };
    } catch (error) {
      if (error instanceof Error && error.message === "JOB_FETCH_TIMEOUT") {
        throw new PublicError("A página demorou demais para responder.");
      }
      throw error;
    }
  }

  throw new PublicError("Não foi possível acessar a página da vaga.");
}

function findJobPosting(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = record["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return record;

  for (const child of Object.values(record)) {
    const found = findJobPosting(child);
    if (found) return found;
  }
  return null;
}

function cleanHtmlText(value: string) {
  return cheerio.load(`<div>${value}</div>`).text().replace(/\s+/g, " ").trim();
}

function organizationName(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const name = (value as Record<string, unknown>).name;
    return typeof name === "string" ? name : undefined;
  }
  return undefined;
}

function extractFromJson(value: unknown, url: string): ExtractedJob | null {
  const posting =
    findJobPosting(value) ??
    (value && typeof value === "object" ? (value as Record<string, unknown>) : null);
  if (!posting) return null;

  const rawDescription = posting.description ?? posting.text ?? posting.content;
  const description = typeof rawDescription === "string" ? cleanHtmlText(rawDescription) : "";
  const title = typeof posting.title === "string" ? cleanHtmlText(posting.title) : undefined;
  const company = organizationName(posting.hiringOrganization ?? posting.company);

  if (description.length < 80) return null;
  return { text: [title, company, description].filter(Boolean).join("\n\n"), title, company, url };
}

function extractFromHtml(html: string, url: string): ExtractedJob {
  const $ = cheerio.load(html);

  for (const element of $("script[type='application/ld+json']").toArray()) {
    try {
      const structured = JSON.parse($(element).text());
      const extracted = extractFromJson(structured, url);
      if (extracted) return extracted;
    } catch {
      // Algumas páginas publicam JSON-LD inválido; nesse caso usamos o HTML visível.
    }
  }

  $("script, style, noscript, svg, nav, footer, header, form, iframe").remove();
  const title =
    $("h1").first().text().replace(/\s+/g, " ").trim() ||
    $("meta[property='og:title']").attr("content")?.trim() ||
    $("title").text().replace(/\s+/g, " ").trim() ||
    undefined;
  const company =
    $("[itemprop='hiringOrganization'] [itemprop='name']").first().text().trim() ||
    $("meta[property='og:site_name']").attr("content")?.trim() ||
    undefined;

  const candidates = [
    "[itemprop='description']",
    "[class*='job-description']",
    "[class*='jobDescription']",
    "#job-description",
    "main",
    "article",
  ];
  let description = "";
  let usedDescriptionSelector = false;
  for (const selector of candidates) {
    const candidate = $(selector).first().text().replace(/\s+/g, " ").trim();
    if (candidate.length > description.length) {
      description = candidate;
      usedDescriptionSelector = true;
    }
  }
  if (description.length < 80) {
    description = $("body").text().replace(/\s+/g, " ").trim();
    usedDescriptionSelector = false;
  }
  if (description.length < 80) {
    throw new PublicError("Não encontramos uma descrição de vaga legível nessa página.");
  }

  return {
    text: [title, company, description.slice(0, 30_000)].filter(Boolean).join("\n\n"),
    title,
    company,
    url,
    warning: usedDescriptionSelector
      ? undefined
      : "Não foi possível identificar com segurança a seção principal da vaga. Revise o conteúdo ou cole a descrição para uma comparação mais precisa.",
  };
}

export async function extractJobFromUrl(rawUrl: string): Promise<ExtractedJob> {
  try {
    const { body, contentType, finalUrl } = await fetchJobPage(rawUrl.trim());

    if (contentType.includes("application/json")) {
      try {
        const extracted = extractFromJson(JSON.parse(body), finalUrl);
        if (extracted) return extracted;
      } catch {
        throw new PublicError("O link retornou um JSON de vaga que não pôde ser interpretado.");
      }
    }

    if (contentType.includes("text/plain")) {
      const text = body.replace(/\s+/g, " ").trim();
      if (text.length < 80)
        throw new PublicError("O link não contém uma descrição de vaga suficiente.");
      return { text: text.slice(0, 30_000), url: finalUrl };
    }

    return extractFromHtml(body, finalUrl);
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError(
      "Não foi possível acessar essa página com segurança. Tente colar a descrição da vaga.",
      400,
    );
  }
}
