import { parseEliUri } from "@/eli/parse-uri";
import { resolveEli } from "@/eli/resolve";
import { renderJsonLd } from "@/eli/jsonld";
import { chooseRepresentation } from "@/http/negotiate";
import { cacheImmutable, cacheLatest } from "@/http/cache";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string[] }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const { slug } = await ctx.params;
  const eli = parseEliUri(slug);
  if (!eli) return new Response("Bad ELI URI", { status: 400 });

  const url = new URL(req.url);
  const formatQuery = url.searchParams.get("format") ?? undefined;
  const rep = chooseRepresentation(req.headers.get("Accept"), formatQuery);

  const state = await resolveEli(eli);
  if (!state) return new Response("Not Found", { status: 404 });

  const cacheControl = eli.validAt ? cacheImmutable() : cacheLatest();
  const baseHeaders: Record<string, string> = {
    "Cache-Control": cacheControl,
    "Vary": "Accept",
  };

  switch (rep) {
    case "xml":
      return new Response(state.bodyXml, {
        status: 200,
        headers: { ...baseHeaders, "Content-Type": "application/xml; charset=utf-8" },
      });

    case "jsonld":
      return new Response(renderJsonLd(state, url.pathname), {
        status: 200,
        headers: { ...baseHeaders, "Content-Type": "application/ld+json; charset=utf-8" },
      });

    case "pdf": {
      const { renderRegulationPdf } = await import("@/pdf/render-regulation-pdf");
      const pdfBytes = await renderRegulationPdf(state);
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          ...baseHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${state.bwbId}.pdf"`,
        },
      });
    }

    case "html":
    default: {
      const target = url.pathname.replace(/^\/api\/eli/, "/eli");
      return Response.redirect(new URL(target, url), 302);
    }
  }
}
