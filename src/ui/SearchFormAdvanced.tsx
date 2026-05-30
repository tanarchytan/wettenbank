"use client";

import { useState, type ReactNode } from "react";
import { CheckboxModal } from "./CheckboxModal";
import {
  MINISTERIES, ZBOS, PBOS, OVERHEIDSDOMEINEN, RECHTSGEBIEDEN, VERDRAG_THEMAS,
  ONDERDELEN, DATUMBEREIK, BRON_PUBLICATIE, DATUMTYPE, DATUMSCOPE,
} from "../search/taxonomies.ts";

type Defaults = Record<string, string | string[] | undefined>;

interface Props { defaults?: Defaults | undefined }

function arr(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  if (v) return [v];
  return [];
}
function str(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function Heading({ children, tooltip }: { children: ReactNode; tooltip?: string }) {
  return (
    <div className="flex items-center gap-2 mt-6 mb-3 border-t-2 border-rijks-blue pt-3 first:mt-0">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-rijks-blue m-0">{children}</h2>
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
          hover:border-rijks-link hover:text-rijks-link select-none [&::-webkit-details-marker]:hidden"
        aria-label="Toelichting"
      >
        ?
      </summary>
      <div className="absolute left-6 top-0 z-10 w-72 bg-white border border-rijks-border shadow-md p-3 text-xs text-rijks-text-muted leading-relaxed rounded-sm">
        {children}
      </div>
    </details>
  );
}

const REG_TYPES_ADVANCED: Array<{ value: string; label: string; defaultChecked: boolean; modal?: { name: string; options: ReadonlyArray<readonly [string, string]>; title: string } }> = [
  { value: "Verdrag",     label: "Verdragen",                                              defaultChecked: false },
  { value: "Wetten",      label: "Wetten (excl. Rijkswetten)",                             defaultChecked: true,
    modal: { name: "Select_Ministeries", title: "Kies ministeries", options: MINISTERIES } },
  { value: "Rijkswetten", label: "Rijkswetten",                                            defaultChecked: true },
  { value: "AMvB",        label: "AMvB's en andere KB's (excl. RijksKB's)",                defaultChecked: true },
  { value: "RijksKBs",    label: "RijksKB's",                                              defaultChecked: true },
  { value: "MinR",        label: "Ministeriële regelingen",                                defaultChecked: false },
  { value: "Beleid",      label: "Beleidsregels rijksdienst",                              defaultChecked: false },
  { value: "Circulaires", label: "Circulaires rijksdienst",                                defaultChecked: false },
  { value: "ZBO",         label: "Regelingen ZBO's",                                       defaultChecked: false,
    modal: { name: "Select_ZBO", title: "Kies ZBO's", options: ZBOS } },
  { value: "Bedrijf",     label: "Regelingen publieke organisatie voor beroep en bedrijf", defaultChecked: false,
    modal: { name: "Select_PBO", title: "Kies organisaties", options: PBOS } },
  { value: "Reglementen", label: "Reglementen van de Staten-Generaal",                     defaultChecked: false },
];

export function SearchFormAdvanced({ defaults }: Props) {
  const d = defaults ?? {};
  const [datumbereik, setDatumbereik] = useState<string>(str(d.datumbereik) || "1");

  return (
    <form action="/uitgebreid_zoeken" method="get" className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
        {/* ───────── Left column ───────── */}
        <div>
          <Heading tooltip="U kunt hieronder één, meerdere of alle soorten regelingen aanvinken.">
            Kies een soort regeling
          </Heading>
          <fieldset>
            <legend className="sr-only">Welke typen regelingen?</legend>
            <ul className="list-none p-0 m-0 space-y-1">
              {REG_TYPES_ADVANCED.map((rt) => (
                <li key={rt.value} className="flex items-start gap-2 flex-wrap">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      name="type"
                      value={rt.value}
                      defaultChecked={arr(d.type).length ? arr(d.type).includes(rt.value) : rt.defaultChecked}
                      className="accent-rijks-blue w-3.5 h-3.5 flex-shrink-0"
                    />
                    <span>{rt.label}</span>
                  </label>
                  {rt.modal && (
                    <CheckboxModal
                      name={rt.modal.name}
                      buttonLabel="kies…"
                      title={rt.modal.title}
                      options={rt.modal.options.map(([code, label]) => ({ code, label }))}
                      defaults={arr(d[rt.modal.name])}
                    />
                  )}
                </li>
              ))}
            </ul>
          </fieldset>

          <fieldset className="mt-5 pt-3 border-t border-rijks-border-soft">
            <legend className="sr-only">Specifieker zoeken</legend>
            <ul className="list-none p-0 m-0 space-y-1.5">
              <li>
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" name="bes" value="ook" defaultChecked={arr(d.bes).includes("ook")} className="accent-rijks-blue w-3.5 h-3.5" />
                  <span>Ook zoeken in regelingen Bonaire, Sint Eustatius en Saba</span>
                </label>
              </li>
              <li>
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" name="bes" value="alleen" defaultChecked={arr(d.bes).includes("alleen")} className="accent-rijks-blue w-3.5 h-3.5" />
                  <span>Alleen zoeken in regelingen Bonaire, Sint Eustatius en Saba</span>
                </label>
              </li>
            </ul>
          </fieldset>

          <Heading tooltip="Selecteer waarop het overheidsdomein of rechtsgebied van de regeling moet matchen.">
            Thema's en rechtsgebieden
          </Heading>
          <div className="space-y-2 text-sm">
            <div>
              <CheckboxModal
                name="overheidsdomein"
                buttonLabel="Overheidsthema's"
                title="Kies overheidsthema's"
                options={OVERHEIDSDOMEINEN.map(([, label]) => ({ code: label, label }))}
                defaults={arr(d.overheidsdomein)}
              />
            </div>
            <div>
              <CheckboxModal
                name="rechtsgebied"
                buttonLabel="Rechtsgebieden"
                title="Kies rechtsgebieden"
                options={RECHTSGEBIEDEN.map((r) => ({ code: r.label, label: r.label, parent: r.parent ? (RECHTSGEBIEDEN.find((x) => x.code === r.parent)?.label ?? null) : null }))}
                defaults={arr(d.rechtsgebied)}
                hierarchical
              />
            </div>
            <div>
              <CheckboxModal
                name="verdragThema"
                buttonLabel="Thema's verdragen"
                title="Kies thema's verdragen"
                options={VERDRAG_THEMAS.map(([, label]) => ({ code: label, label }))}
                defaults={arr(d.verdragThema)}
              />
            </div>
          </div>
        </div>

        {/* ───────── Right column ───────── */}
        <div>
          <Heading tooltip="Zoek op woord(en) in titel en/of tekst.">
            Zoek op woord of zinsdeel
          </Heading>
          <div className="space-y-4">
            <Field id="q_titel" label="In de titel" placeholder="Bijv: bestuursrecht"
              defaultValue={str(d.q_titel)} tooltip="Zoekt in citeertitel/opschrift." />
            <Field id="q" label="In de tekst" placeholder="Bijv: toeslag"
              defaultValue={str(d.q)} tooltip="EN-operator (alle woorden), OF-operator (één van), * voor woordsamenstellingen." />

            <div className="form__element">
              <div className="flex items-center gap-2 mb-1">
                <span className="block text-sm font-medium text-rijks-text-muted">Zoek in onderdelen</span>
                <Tooltip>Beperk de zoekactie tot specifieke onderdelen van de regeling.</Tooltip>
              </div>
              <ul className="list-none p-0 m-0 grid grid-cols-2 gap-y-1 text-sm">
                {ONDERDELEN.map(([code, label]) => (
                  <li key={code}>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" name="onderdeel" value={code} defaultChecked={arr(d.onderdeel).includes(code)} className="accent-rijks-blue w-3.5 h-3.5" />
                      <span>{label}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <label className="inline-flex items-center gap-2 mt-2 cursor-pointer text-sm">
                <input type="checkbox" name="zoekWti" value="1" defaultChecked={str(d.zoekWti) === "1"} className="accent-rijks-blue w-3.5 h-3.5" />
                <span>Ook in wetstechnische informatie</span>
              </label>
            </div>

            <Field id="artikelnr" label="Artikelnummer" placeholder="Bijv: 3.7a"
              defaultValue={str(d.artikelnr)} className="w-44"
              tooltip='Voer een specifiek artikelnummer in (b.v. "1", "1.1", "1:1").' />

            <Field id="wetsfamilie" label="Wetsfamilie" placeholder="Bijv: BWBR0001840"
              defaultValue={str(d.wetsfamilie)}
              tooltip="Beperk de zoekactie tot een hoofdregeling en haar gedelegeerde regelgeving." />
          </div>

          <Heading tooltip="Regelingen geldend op een specifieke datum + uitgebreide datum-filters.">
            Zoek op datum
          </Heading>
          <div className="form__element space-y-2">
            <div className="flex items-center gap-3">
              <label htmlFor="date" className="text-sm font-medium text-rijks-text-muted w-32">Regeling geldig op</label>
              <input type="date" id="date" name="date" defaultValue={str(d.date)}
                className="border border-rijks-border px-3 py-1.5 text-sm w-44 rounded-sm" />
              <button type="button" onClick={() => { const el = document.getElementById("date") as HTMLInputElement; if (el) el.value = new Date().toISOString().slice(0,10); }} className="text-sm text-rijks-link hover:underline">Vandaag</button>
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="zichtdatum" className="text-sm font-medium text-rijks-text-muted w-32">Zichtdatum</label>
              <input type="date" id="zichtdatum" name="zichtdatum" defaultValue={str(d.zichtdatum)}
                className="border border-rijks-border px-3 py-1.5 text-sm w-44 rounded-sm" />
              <button type="button" onClick={() => { const el = document.getElementById("zichtdatum") as HTMLInputElement; if (el) el.value = new Date().toISOString().slice(0,10); }} className="text-sm text-rijks-link hover:underline">Vandaag</button>
            </div>

            <label className="inline-flex items-center gap-2 mt-1 cursor-pointer text-sm">
              <input type="checkbox" name="materieel" value="1" defaultChecked={str(d.materieel) === "1"} className="accent-rijks-blue w-3.5 h-3.5" />
              <span>Ook materieel uitgewerkte regelingen</span>
            </label>

            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className="text-rijks-text-muted">Scope:</span>
              {DATUMSCOPE.map(([code, label]) => (
                <label key={code} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="datumscope" value={code} defaultChecked={str(d.datumscope) === code || (!str(d.datumscope) && code === "Regeling")} className="accent-rijks-blue" />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-4 text-sm flex-wrap">
              <span className="text-rijks-text-muted">Datum van:</span>
              {DATUMTYPE.map(([code, label]) => (
                <label key={code} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="datumtype" value={code} defaultChecked={str(d.datumtype) === code || (!str(d.datumtype) && code === "Inwerkingtreding")} className="accent-rijks-blue" />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center gap-3 text-sm mt-2">
              <label htmlFor="datumbereik" className="text-rijks-text-muted">Datumbereik:</label>
              <select id="datumbereik" name="datumbereik" value={datumbereik} onChange={(e) => setDatumbereik(e.target.value)}
                className="border border-rijks-border px-2 py-1 text-sm rounded-sm">
                {DATUMBEREIK.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
              <input type="date" name="startdatum" defaultValue={str(d.startdatum)}
                className="border border-rijks-border px-3 py-1.5 text-sm w-44 rounded-sm" />
              {datumbereik === "3" && (
                <input type="date" name="einddatum" defaultValue={str(d.einddatum)}
                  className="border border-rijks-border px-3 py-1.5 text-sm w-44 rounded-sm" />
              )}
            </div>
          </div>

          <Heading tooltip="Filter op de officiële publicatie waarin de regeling is bekendgemaakt.">
            Zoek op publicatie
          </Heading>
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <select name="publicatieBron" defaultValue={str(d.publicatieBron)}
              className="border border-rijks-border px-2 py-1 text-sm rounded-sm">
              <option value="">Kies publicatie…</option>
              {BRON_PUBLICATIE.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
            </select>
            <input type="number" name="publicatieJaar" placeholder="Jaar" defaultValue={str(d.publicatieJaar)}
              className="border border-rijks-border px-2 py-1 text-sm w-24 rounded-sm" />
            <input type="text" name="publicatieNummer" placeholder="Nummer" defaultValue={str(d.publicatieNummer)}
              className="border border-rijks-border px-2 py-1 text-sm w-28 rounded-sm" />
          </div>

          <Heading tooltip="Direct opzoeken op identifier.">
            Zoek op nummer
          </Heading>
          <div className="space-y-2">
            <Field id="bwbid" label="BWB-ID" placeholder="BWBR0001840" defaultValue={str(d.bwbid)}
              tooltip="Bijv: BWBR0001840 voor de Grondwet. BWBV…-ids zijn verdragen." />
            <Field id="kamerstuk" label="Kamerstuknummer" placeholder="Bijv: 34702" defaultValue={str(d.kamerstuk)} />
            <Field id="kenmerk" label="Kenmerk regeling" placeholder="(departementaal) kenmerk" defaultValue={str(d.kenmerk)} />
            <Field id="juriconnect" label="Juriconnect-ID" placeholder="jci1.3:c:BWBR0001840&artikel=1" defaultValue={str(d.juriconnect)} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-rijks-border">
        <a href="/uitgebreid_zoeken" className="text-sm px-4 py-2 border border-rijks-border bg-white text-rijks-text-muted hover:border-rijks-link hover:text-rijks-link no-underline">
          Wis scherm
        </a>
        <button type="submit" className="bg-rijks-blue text-white px-6 py-2 text-sm font-semibold hover:bg-[#0d3057] rounded-sm">
          Zoeken
        </button>
      </div>
    </form>
  );
}

function Field({ id, label, placeholder, defaultValue, tooltip, className }: {
  id: string; label: string; placeholder?: string; defaultValue?: string; tooltip?: string; className?: string;
}) {
  return (
    <div className="form__element">
      <div className="flex items-center gap-2 mb-1">
        <label htmlFor={id} className="block text-sm font-medium text-rijks-text-muted">{label}</label>
        {tooltip && <Tooltip>{tooltip}</Tooltip>}
      </div>
      <input
        id={id}
        name={id}
        type="text"
        placeholder={placeholder ?? ""}
        defaultValue={defaultValue ?? ""}
        className={`border border-rijks-border px-3 py-1.5 text-sm rounded-sm focus:border-rijks-link focus:outline-none focus:ring-1 focus:ring-rijks-link/30 ${className ?? "w-full"}`}
      />
    </div>
  );
}
