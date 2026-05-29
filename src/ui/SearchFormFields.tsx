"use client";

import type { ReactNode } from "react";
import { useState } from "react";

const REG_TYPES: Array<{ value: string; label: string; defaultChecked: boolean; tooltip?: string }> = [
  { value: "Verdrag",     label: "Verdragen",                                                 defaultChecked: false },
  { value: "Wetten",      label: "Wetten",                                                    defaultChecked: true  },
  { value: "AMvB",        label: "AMvB's en andere Koninklijke besluiten",                    defaultChecked: true  },
  { value: "MinR",        label: "Ministeriële regelingen",                                   defaultChecked: true,
    tooltip: "Bij eenvoudig zoeken worden Archiefselectielijsten niet doorzocht. U kunt deze wel doorzoeken via Uitgebreid zoeken." },
  { value: "Beleid",      label: "Beleidsregels rijksdienst",                                 defaultChecked: false },
  { value: "Circulaires", label: "Circulaires rijksdienst",                                   defaultChecked: false },
  { value: "ZBO",         label: "Regelingen zelfstandige bestuursorganen (ZBO's)",           defaultChecked: false },
  { value: "Bedrijf",     label: "Regelingen publieke organisatie voor beroep en bedrijf",   defaultChecked: false },
  { value: "Reglementen", label: "Reglementen van de Staten-Generaal",                        defaultChecked: false },
];

function ChapterHeading({ children, tooltip }: { children: ReactNode; tooltip?: string }) {
  return (
    <div className="flex items-center gap-2 mt-6 mb-3 border-t-2 border-rijks-blue pt-3 first:mt-0">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-rijks-blue m-0">
        {children}
      </h2>
      {tooltip && <Tooltip>{tooltip}</Tooltip>}
    </div>
  );
}

function Tooltip({ children }: { children: ReactNode }) {
  return (
    <details className="relative inline-block">
      <summary
        className="list-none cursor-pointer w-4 h-4 rounded-full border border-rijks-border-soft
          text-[10px] font-bold text-rijks-text-subdued flex items-center justify-center
          hover:border-rijks-link hover:text-rijks-link transition-colors select-none [&::-webkit-details-marker]:hidden"
        aria-label="Toelichting"
      >
        ?
      </summary>
      <div className="absolute left-6 top-0 z-10 w-64 bg-white border border-rijks-border shadow-md p-3 text-xs text-rijks-text-muted leading-relaxed rounded-sm">
        {children}
      </div>
    </details>
  );
}

function isChecked(defaults: Defaults | undefined, key: string, value: string): boolean {
  if (!defaults) return false;
  const v = defaults[key];
  if (Array.isArray(v)) return v.includes(value);
  return v === value;
}

export type Defaults = Record<string, string | string[] | undefined>;

interface Props { defaults?: Defaults | undefined }

export function SearchFormFields({ defaults }: Props) {
  // "Alle soorten" master checkbox — checks/unchecks all type boxes
  const [allChecked, setAllChecked] = useState(false);
  function handleAllChange(e: React.ChangeEvent<HTMLInputElement>) {
    setAllChecked(e.target.checked);
    document.querySelectorAll<HTMLInputElement>('input[name="type"]').forEach((cb) => {
      cb.checked = e.target.checked;
    });
  }

  const titleQ = (defaults?.q_titel as string) ?? "";
  const bodyQ = (defaults?.q as string) ?? "";
  const dateVal = (defaults?.date as string) ?? "";
  const articleNr = (defaults?.artikelnr as string) ?? "";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
      {/* ───────── Left column ───────── */}
      <div>
        <ChapterHeading tooltip="U kunt hieronder één, meerdere of alle soorten regelingen aanvinken.">
          Kies een soort regeling
        </ChapterHeading>
        <fieldset>
          <legend className="sr-only">Welke typen regelingen wilt u meenemen in de zoekresultaten?</legend>
          <ul className="list-none p-0 m-0 space-y-1">
            <li>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={handleAllChange}
                  className="accent-rijks-blue w-3.5 h-3.5 flex-shrink-0"
                />
                <span>Alle soorten regelingen of:</span>
              </label>
              <ul className="list-none pl-5 mt-1 space-y-1">
                {REG_TYPES.map((rt) => (
                  <li key={rt.value} className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        name="type"
                        value={rt.value}
                        defaultChecked={defaults?.type ? isChecked(defaults, "type", rt.value) : rt.defaultChecked}
                        className="accent-rijks-blue w-3.5 h-3.5 flex-shrink-0"
                      />
                      <span>{rt.label}</span>
                    </label>
                    {rt.tooltip && <Tooltip>{rt.tooltip}</Tooltip>}
                  </li>
                ))}
              </ul>
            </li>
          </ul>
        </fieldset>

        <fieldset className="mt-5 pt-3 border-t border-rijks-border-soft">
          <legend className="sr-only">Specifieker zoeken</legend>
          <ul className="list-none p-0 m-0 space-y-1.5">
            <li className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  name="bes"
                  value="ook"
                  defaultChecked={isChecked(defaults, "bes", "ook")}
                  className="accent-rijks-blue w-3.5 h-3.5 flex-shrink-0"
                />
                <span>Ook zoeken in regelingen Bonaire, Sint Eustatius en Saba</span>
              </label>
              <Tooltip>Zoek ook regelingen die enkel op Bonaire, Sint Eustatius en Saba van toepassing zijn.</Tooltip>
            </li>
            <li className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  name="bes"
                  value="alleen"
                  defaultChecked={isChecked(defaults, "bes", "alleen")}
                  className="accent-rijks-blue w-3.5 h-3.5 flex-shrink-0"
                />
                <span>Alleen zoeken in regelingen Bonaire, Sint Eustatius en Saba</span>
              </label>
              <Tooltip>Zoek uitsluitend regelingen die enkel op Bonaire, Sint Eustatius en Saba van toepassing zijn.</Tooltip>
            </li>
          </ul>

          <ul className="list-none p-0 mt-4 space-y-1 text-sm">
            <li>
              <a
                href="https://eur-lex.europa.eu/homepage.html?locale=nl"
                rel="external noopener noreferrer"
                target="_blank"
                className="text-rijks-link hover:underline"
              >
                ↗ Europese regelingen (EUR-Lex)
              </a>
            </li>
            <li>
              <a
                href="https://lokaleregelgeving.overheid.nl/"
                rel="external noopener noreferrer"
                target="_blank"
                className="text-rijks-link hover:underline"
              >
                ↗ Regelingen van provincies, gemeenten, BES, waterschappen en voormalige Nederlandse Antillen
              </a>
            </li>
            <li>
              <a
                href="http://powersearch.wetten.nl/"
                rel="external noopener noreferrer"
                target="_blank"
                className="text-rijks-link hover:underline"
              >
                ↗ Powersearch
              </a>
            </li>
          </ul>
        </fieldset>
      </div>

      {/* ───────── Right column ───────── */}
      <div>
        <ChapterHeading tooltip="U kunt hier zoeken op één of meer woorden die voorkomen in de titel of in de tekst.">
          Zoek op woord of zinsdeel
        </ChapterHeading>

        <div className="space-y-4">
          <div className="form__element">
            <div className="flex items-center gap-2 mb-1">
              <label htmlFor="q_titel" className="block text-sm font-medium text-rijks-text-muted">
                In de titel
              </label>
              <Tooltip>U zoekt hier op woord(en) in de citeertitel en het opschrift van de regelingen. U kunt ook populaire benamingen invoeren, zoals 'Flexwet'.</Tooltip>
            </div>
            <input
              id="q_titel"
              name="q_titel"
              type="text"
              placeholder="Bijv: bestuursrecht"
              defaultValue={titleQ}
              className="w-full border border-rijks-border px-3 py-1.5 text-sm
                focus:border-rijks-link focus:outline-none focus:ring-1 focus:ring-rijks-link/30 rounded-sm"
            />
          </div>

          <div className="form__element">
            <div className="flex items-center gap-2 mb-1">
              <label htmlFor="q" className="block text-sm font-medium text-rijks-text-muted">
                In de tekst
              </label>
              <Tooltip>U zoekt hier op woord(en) in de tekst van de regelingen. Gebruik de EN-operator voor 'alle woorden', OF voor 'tenminste één'. Gebruik '*' voor woordsamenstellingen, bijv. 'milieu*'.</Tooltip>
            </div>
            <input
              id="q"
              name="q"
              type="text"
              placeholder="Bijv: toeslag"
              defaultValue={bodyQ}
              className="w-full border border-rijks-border px-3 py-1.5 text-sm
                focus:border-rijks-link focus:outline-none focus:ring-1 focus:ring-rijks-link/30 rounded-sm"
            />
            <div className="mt-1.5 text-sm flex items-center gap-4">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="op"
                  value="en"
                  defaultChecked={(defaults?.op ?? "en") !== "of"}
                  className="accent-rijks-blue"
                />
                <span>Alle woorden (EN)</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="op"
                  value="of"
                  defaultChecked={defaults?.op === "of"}
                  className="accent-rijks-blue"
                />
                <span>Eén van (OF)</span>
              </label>
            </div>
          </div>

          <div className="form__element">
            <div className="flex items-center gap-2 mb-1">
              <label htmlFor="artikelnr" className="block text-sm font-medium text-rijks-text-muted">
                Artikelnummer
              </label>
              <Tooltip>U kunt zoeken op alle voorkomende artikelnummers, zoals "1", "1.1", "1:1".</Tooltip>
            </div>
            <input
              id="artikelnr"
              name="artikelnr"
              type="text"
              placeholder="Bijv: 3.7a"
              defaultValue={articleNr}
              className="w-44 border border-rijks-border px-3 py-1.5 text-sm
                focus:border-rijks-link focus:outline-none focus:ring-1 focus:ring-rijks-link/30 rounded-sm"
            />
          </div>
        </div>

        <ChapterHeading tooltip="U kunt zoeken in de regelingen zoals geldend op de datum vandaag (standaard), of een eerdere datum.">
          Zoek op datum
        </ChapterHeading>
        <div className="form__element">
          <label htmlFor="date" className="block text-sm font-medium text-rijks-text-muted mb-1">
            Regeling geldig op
          </label>
          <div className="flex items-center gap-3">
            <input
              type="date"
              id="date"
              name="date"
              defaultValue={dateVal}
              className="border border-rijks-border px-3 py-1.5 text-sm w-44
                focus:border-rijks-link focus:outline-none focus:ring-1 focus:ring-rijks-link/30 rounded-sm"
            />
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("date") as HTMLInputElement | null;
                if (el) el.value = new Date().toISOString().slice(0, 10);
              }}
              className="text-sm text-rijks-link hover:underline cursor-pointer"
            >
              Vandaag
            </button>
          </div>
          <label className="inline-flex items-center gap-2 mt-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              name="materieel"
              value="1"
              defaultChecked={defaults?.materieel === "1"}
              className="accent-rijks-blue w-3.5 h-3.5"
            />
            <span>Ook materieel uitgewerkte regelingen</span>
            <Tooltip>Regelingen die niet zijn ingetrokken of vervallen maar feitelijk geen werking meer hebben, worden standaard niet doorzocht. Wilt u dit wel, vink dan dit vakje aan.</Tooltip>
          </label>
        </div>
      </div>
    </div>
  );
}
