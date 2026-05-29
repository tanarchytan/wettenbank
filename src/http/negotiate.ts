export type Representation = "html" | "xml" | "jsonld" | "pdf";

const VALID: Set<Representation> = new Set(["html", "xml", "jsonld", "pdf"]);

const MAP: Record<string, Representation> = {
  "text/html": "html",
  "application/xhtml+xml": "html",
  "application/xml": "xml",
  "text/xml": "xml",
  "application/ld+json": "jsonld",
  "application/json": "jsonld",
  "application/pdf": "pdf",
};

function parseAccept(header: string): Array<{ type: string; q: number }> {
  return header
    .split(",")
    .map((part) => {
      const [type, ...params] = part.trim().split(";").map((s) => s.trim());
      let q = 1.0;
      for (const p of params) {
        if (p.startsWith("q=")) {
          const v = parseFloat(p.slice(2));
          if (!isNaN(v)) q = v;
        }
      }
      return { type: type ?? "*/*", q };
    })
    .sort((a, b) => b.q - a.q);
}

export function chooseRepresentation(
  acceptHeader: string | null,
  formatQuery?: string,
): Representation {
  if (formatQuery && VALID.has(formatQuery as Representation)) {
    return formatQuery as Representation;
  }
  if (!acceptHeader) return "html";
  for (const { type } of parseAccept(acceptHeader)) {
    if (type === "*/*") return "html";
    const mapped = MAP[type.toLowerCase()];
    if (mapped) return mapped;
  }
  return "html";
}
