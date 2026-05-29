import type { ReactNode } from "react";
import { Header } from "@/ui/Header";
import { Footer } from "@/ui/Footer";
import { InfoBanner } from "@/ui/InfoBanner";

export const metadata = {
  title: "Wettenbank.online — Onafhankelijke mirror BWB",
  description: "Onafhankelijke mirror van het Basis Wetten Bestand",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const banner = process.env.INFO_BANNER ?? null;
  return (
    <html lang="nl">
      <head>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body className="min-h-screen flex flex-col">
        {/* Tricolor stripe — 2px */}
        <div className="tricolor" aria-hidden="true">
          <div style={{ background: "#d52b1e" }} />
          <div style={{ background: "#ffffff" }} />
          <div style={{ background: "#154273" }} />
        </div>
        <a href="#content" className="skiplinks">Direct naar content</a>
        {banner ? <InfoBanner message={banner} /> : null}
        <Header />
        <main id="content" className="container py-6 flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
