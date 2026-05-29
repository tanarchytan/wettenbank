import { notFound } from "next/navigation";
import { parseEliUri } from "@/eli/parse-uri";
import { resolveEli } from "@/eli/resolve";
import { RegulationViewer } from "@/ui/RegulationViewer";

export const dynamic = "force-dynamic";

interface Props { params: Promise<{ slug: string[] }>; }

export default async function EliPage({ params }: Props) {
  const { slug } = await params;
  const eli = parseEliUri(slug);
  if (!eli) notFound();
  const state = await resolveEli(eli);
  if (!state) notFound();

  return (
    <RegulationViewer
      title={state.title}
      bwbId={state.bwbId}
      eliUri={state.eliUri}
      type={state.type}
      ministry={state.ministry}
      validFrom={state.validFrom}
      validTo={state.validTo}
      articles={state.articles}
      outbound={state.outbound}
      inbound={state.inbound}
    />
  );
}
