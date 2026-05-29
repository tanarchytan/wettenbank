import { describe, expect, test, beforeEach } from "bun:test";
import { purgeUrls } from "../../src/cloudflare/purge.ts";

describe("purgeUrls", () => {
  beforeEach(() => {
    delete process.env.CF_API_TOKEN;
    delete process.env.CF_ZONE_ID;
  });

  test("is a no-op when CF_API_TOKEN is unset", async () => {
    const result = await purgeUrls(["https://example.com/eli/nl/act/2023/foo"]);
    expect(result.skipped).toBe(true);
    expect(result.urlsPurged).toBe(0);
  });

  test("returns urls purged when token is set (mocked fetch)", async () => {
    process.env.CF_API_TOKEN = "test-token";
    process.env.CF_ZONE_ID = "test-zone";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, errors: [] }), { status: 200 })
    ) as unknown as typeof fetch;
    try {
      const result = await purgeUrls(["https://example.com/x"]);
      expect(result.skipped).toBe(false);
      expect(result.urlsPurged).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
