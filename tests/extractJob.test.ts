import { describe, expect, it } from "vitest";
import { extractJobFromUrl } from "../lib/extractJob";

describe("extractJobFromUrl", () => {
  it("recusa links sem HTTPS", async () => {
    await expect(extractJobFromUrl("http://example.com/vaga")).rejects.toThrow("deve usar HTTPS");
  });

  it("recusa endereços locais", async () => {
    await expect(extractJobFromUrl("https://localhost/vaga")).rejects.toThrow("Endereços locais");
  });
});
