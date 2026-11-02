import { MAX_REQUEST_SIZE_BYTES } from "./limits";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_REQUESTS = 10;
const MAX_CONCURRENT_ANALYSES = 4;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type GuardState = {
  activeAnalyses: number;
  clients: Map<string, RateLimitEntry>;
};

const globalState = globalThis as typeof globalThis & {
  __analysisGuardState?: GuardState;
};

function state() {
  globalState.__analysisGuardState ??= {
    activeAnalyses: 0,
    clients: new Map(),
  };
  return globalState.__analysisGuardState;
}

function clientIdentifier(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export function requestSizeIsAllowed(request: Request) {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return true;

  const contentLength = Number(rawLength);
  return (
    Number.isFinite(contentLength) && contentLength >= 0 && contentLength <= MAX_REQUEST_SIZE_BYTES
  );
}

export function consumeRateLimit(request: Request) {
  const now = Date.now();
  const guardState = state();
  const identifier = clientIdentifier(request);

  if (guardState.clients.size > 1_000) {
    for (const [key, entry] of guardState.clients) {
      if (entry.resetAt <= now) guardState.clients.delete(key);
    }
  }

  const current = guardState.clients.get(identifier);
  if (!current || current.resetAt <= now) {
    guardState.clients.set(identifier, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= RATE_LIMIT_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    };
  }

  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function acquireAnalysisSlot() {
  const guardState = state();
  if (guardState.activeAnalyses >= MAX_CONCURRENT_ANALYSES) return null;

  guardState.activeAnalyses += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    guardState.activeAnalyses = Math.max(0, guardState.activeAnalyses - 1);
  };
}
