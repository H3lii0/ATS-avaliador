import { describe, expect, it } from "vitest";
import { acquireAnalysisSlot, consumeRateLimit, requestSizeIsAllowed } from "../lib/requestGuards";

describe("request guards", () => {
  it("recusa solicitações declaradas acima de 4 MB", () => {
    const request = new Request("https://example.test/api/analisar", {
      headers: { "content-length": String(5 * 1024 * 1024) },
    });

    expect(requestSizeIsAllowed(request)).toBe(false);
  });

  it("limita o cliente após dez solicitações na janela", () => {
    const request = new Request("https://example.test/api/analisar", {
      headers: { "x-real-ip": "203.0.113.77" },
    });

    for (let count = 0; count < 10; count++) {
      expect(consumeRateLimit(request).allowed).toBe(true);
    }
    expect(consumeRateLimit(request).allowed).toBe(false);
  });

  it("permite no máximo quatro análises simultâneas", () => {
    const releases = Array.from({ length: 4 }, () => acquireAnalysisSlot());

    expect(releases.every(Boolean)).toBe(true);
    expect(acquireAnalysisSlot()).toBeNull();

    releases[0]?.();
    const nextRelease = acquireAnalysisSlot();
    expect(nextRelease).not.toBeNull();

    nextRelease?.();
    releases.slice(1).forEach((release) => release?.());
  });
});
