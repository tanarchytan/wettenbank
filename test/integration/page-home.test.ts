import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import HomePage from "../../app/page.tsx";

describe("HomePage", () => {
  test("renders the search form heading", async () => {
    const tree = await HomePage();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Kies een soort regeling");
    expect(html).toContain("In de titel");
    expect(html).toContain("In de tekst");
  });
});
