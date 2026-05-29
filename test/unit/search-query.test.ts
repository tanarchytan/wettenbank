import { describe, expect, test } from "bun:test";
import { sanitiseTsQuery } from "../../src/search/query.ts";

describe("sanitiseTsQuery", () => {
  test("converts Dutch EN/OF operators to & |", () => {
    expect(sanitiseTsQuery("kat EN hond")).toBe("kat & hond");
    expect(sanitiseTsQuery("kat OF hond")).toBe("kat | hond");
  });
  test("strips dangerous characters", () => {
    expect(sanitiseTsQuery("kat;DROP TABLE foo")).toBe("kat & drop & table & foo");
  });
  test("returns empty string for empty input", () => {
    expect(sanitiseTsQuery("")).toBe("");
    expect(sanitiseTsQuery("   ")).toBe("");
  });
  test("supports prefix operator", () => {
    expect(sanitiseTsQuery("grond*")).toBe("grond:*");
  });
});
