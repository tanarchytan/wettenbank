import { describe, expect, test } from "bun:test";
import { cacheImmutable, cacheLatest, cacheSearchHtml, cacheSearchJson, cacheNoStore } from "../../src/http/cache.ts";

describe("cache header helpers", () => {
  test("cacheImmutable returns 1y immutable", () => {
    expect(cacheImmutable()).toBe("public, max-age=31536000, immutable");
  });
  test("cacheLatest returns 1d fresh + 7d SWR", () => {
    expect(cacheLatest()).toBe("public, s-maxage=86400, stale-while-revalidate=604800");
  });
  test("cacheSearchHtml returns 5min fresh + 10min SWR", () => {
    expect(cacheSearchHtml()).toBe("public, s-maxage=300, stale-while-revalidate=600");
  });
  test("cacheSearchJson returns 60s", () => {
    expect(cacheSearchJson()).toBe("public, s-maxage=60");
  });
  test("cacheNoStore returns no-store", () => {
    expect(cacheNoStore()).toBe("no-store");
  });
});
