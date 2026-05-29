import { Document, Page, Text, View, StyleSheet, renderToStream } from "@react-pdf/renderer";
import type { ResolvedState } from "@/eli/resolve";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 11, fontFamily: "Helvetica", color: "#000" },
  h1: { fontSize: 18, fontWeight: 700, color: "#154273", marginBottom: 8 },
  meta: { fontSize: 9, color: "#555", marginBottom: 12 },
  hKop: { fontSize: 13, fontWeight: 700, color: "#154273", marginTop: 12, marginBottom: 4 },
  body: { lineHeight: 1.4 },
});

export async function renderRegulationPdf(state: ResolvedState): Promise<Uint8Array<ArrayBuffer>> {
  const doc = (
    <Document title={state.title} author={state.ministry ?? "Wettenbank.online"}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>{state.title}</Text>
        <Text style={styles.meta}>
          {state.bwbId} · {state.type}{state.ministry ? ` · ${state.ministry}` : ""}
          {"\n"}Geldend: {state.validFrom} – {state.validTo === "9999-12-31" ? "heden" : state.validTo}
        </Text>
        {state.articles.map((a) => (
          <View key={a.anchorId} wrap={false}>
            <Text style={styles.hKop}>Artikel {a.number}{a.heading ? ` — ${a.heading}` : ""}</Text>
            <Text style={styles.body}>{a.bodyText.trim()}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
  const stream = await renderToStream(doc);
  const chunks: Buffer[] = [];
  return await new Promise((resolve, reject) => {
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => {
      const buf = Buffer.concat(chunks);
      resolve(new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer));
    });
    stream.on("error", reject);
  });
}
