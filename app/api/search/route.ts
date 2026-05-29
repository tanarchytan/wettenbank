import { NextResponse } from "next/server";
import { executeSearch } from "@/search/execute";
import { cacheSearchJson } from "@/http/cache";
import { log } from "@/log";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const rawQ = url.searchParams.get("q");
  const titleQ = url.searchParams.get("q_titel") ?? undefined;
  const asOfDate = url.searchParams.get("date") ?? undefined;
  const types = url.searchParams.getAll("type");
  const besArr = url.searchParams.getAll("bes");
  const besMode: "default" | "ook" | "alleen" =
    besArr.includes("alleen") ? "alleen" : besArr.includes("ook") ? "ook" : "default";
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitRaw ?? "20", 10) || 20, 1), 100);

  if (!rawQ && !titleQ) {
    return NextResponse.json(
      { error: "at least one of q or q_titel is required" },
      { status: 400 },
    );
  }

  try {
    const { total, results } = await executeSearch({
      q: rawQ ?? undefined,
      titleQ,
      types,
      asOfDate,
      besMode,
      limit,
    });
    return NextResponse.json(
      { query: rawQ ?? "", total, results },
      { headers: { "Cache-Control": cacheSearchJson() } },
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error("api/search failed", { query: rawQ, titleQ, asOfDate, types, besMode, error: detail });
    // Geen `detail` in response — PG-errors lekken anders kolomnamen + query.
    return NextResponse.json(
      { error: "search failed" },
      { status: 500 },
    );
  }
}
