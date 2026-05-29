import { describe, expect, test, afterEach } from "bun:test";
import { loadConfig } from "../../src/config.ts";

describe("loadConfig", () => {
  const origDbUrl = process.env.DATABASE_URL;
  const origSruUrl = process.env.SRU_BASE_URL;

  afterEach(() => {
    // Restore env so subsequent test files in the same worker aren't broken.
    if (origDbUrl !== undefined) process.env.DATABASE_URL = origDbUrl;
    else delete process.env.DATABASE_URL;
    if (origSruUrl !== undefined) process.env.SRU_BASE_URL = origSruUrl;
    else delete process.env.SRU_BASE_URL;
  });

  test("reads DATABASE_URL from env", () => {
    process.env.DATABASE_URL = "postgres://x:y@h:5432/d";
    process.env.SRU_BASE_URL = "https://example.invalid/sru";
    const cfg = loadConfig();
    expect(cfg.databaseUrl).toBe("postgres://x:y@h:5432/d");
    expect(cfg.sruBaseUrl).toBe("https://example.invalid/sru");
    expect(cfg.logLevel).toBe("info"); // default
  });

  test("throws if DATABASE_URL missing", () => {
    delete process.env.DATABASE_URL;
    expect(() => loadConfig()).toThrow(/DATABASE_URL/);
  });
});
