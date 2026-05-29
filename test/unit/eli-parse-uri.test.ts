import { describe, expect, test } from "bun:test";
import { parseEliUri } from "../../src/eli/parse-uri.ts";

describe("parseEliUri", () => {
  test("parses latest", () => {
    expect(parseEliUri(["nl", "wet", "1815", "grondwet"])).toEqual({
      type: "wet",
      year: "1815",
      naturalId: "grondwet",
      validAt: null,
      articleNr: null,
    });
  });
  test("parses date", () => {
    expect(parseEliUri(["nl", "wet", "1815", "grondwet", "2023-01-01"])).toEqual({
      type: "wet",
      year: "1815",
      naturalId: "grondwet",
      validAt: "2023-01-01",
      articleNr: null,
    });
  });
  test("parses date + artikel", () => {
    expect(parseEliUri(["nl", "wet", "1815", "grondwet", "2023-01-01", "artikel", "5"])).toEqual({
      type: "wet",
      year: "1815",
      naturalId: "grondwet",
      validAt: "2023-01-01",
      articleNr: "5",
    });
  });
  test("rejects non-NL jurisdiction", () => {
    expect(parseEliUri(["eu", "wet", "1815", "grondwet"])).toBeNull();
  });
  test("rejects malformed date", () => {
    expect(parseEliUri(["nl", "wet", "1815", "grondwet", "not-a-date"])).toBeNull();
  });
  test("rejects malformed year", () => {
    expect(parseEliUri(["nl", "wet", "abcd", "grondwet"])).toBeNull();
  });
  test("rejects too-short slug", () => {
    expect(parseEliUri(["nl", "wet"])).toBeNull();
  });
});
