import { describe, expect, test } from "bun:test";
import { chooseRepresentation } from "../../src/http/negotiate.ts";

describe("chooseRepresentation", () => {
  test("returns html when Accept missing", () => {
    expect(chooseRepresentation(null)).toBe("html");
  });
  test("returns html for browser Accept", () => {
    expect(chooseRepresentation("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")).toBe("html");
  });
  test("returns xml for application/xml", () => {
    expect(chooseRepresentation("application/xml")).toBe("xml");
  });
  test("returns jsonld for application/ld+json", () => {
    expect(chooseRepresentation("application/ld+json")).toBe("jsonld");
  });
  test("returns pdf for application/pdf", () => {
    expect(chooseRepresentation("application/pdf")).toBe("pdf");
  });
  test("?format=xml override beats Accept", () => {
    expect(chooseRepresentation("text/html", "xml")).toBe("xml");
  });
  test("invalid ?format= falls back to Accept", () => {
    expect(chooseRepresentation("text/html", "bogus")).toBe("html");
  });
});
