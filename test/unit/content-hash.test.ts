import { describe, expect, test } from "bun:test";
import { contentHash } from "../../src/ingest/content-hash.ts";

describe("contentHash", () => {
  test("is deterministic for identical input", () => {
    const a = contentHash("<x>hello</x>");
    const b = contentHash("<x>hello</x>");
    expect(a).toEqual(b);
  });

  test("differs on any byte change", () => {
    const a = contentHash("<x>hello</x>");
    const b = contentHash("<x>hellO</x>");
    expect(a).not.toEqual(b);
  });

  test("returns 32-byte buffer (sha256)", () => {
    const h = contentHash("anything");
    expect(h.length).toBe(32);
  });
});
