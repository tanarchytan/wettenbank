/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import Link from "next/link";
import { useState } from "react";

function WMark() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      {/* Rijkshuisstijl-style geometric W mark in rijks-accent */}
      <rect width="32" height="32" fill="#154273" rx="2" />
      <path
        d="M5 8 L10 24 L16 14 L22 24 L27 8"
        stroke="#b2d7ee"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/zoeken", label: "Eenvoudig zoeken" },
  { href: "/uitgebreid_zoeken", label: "Uitgebreid zoeken" },
  { href: "/over", label: "Over Wettenbank.online" },
] as const;

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="header bg-rijks-blue text-white" role="banner">
      {/* Header start bar */}
      <div className="header__start border-b border-white/10">
        <div className="container py-2.5 flex items-center gap-4">
          {/* Mobile hamburger */}
          <button
            className="header__hamburger lg:hidden flex flex-col gap-1.5 p-1.5 -ml-1.5 rounded focus-visible:outline-2 focus-visible:outline-white"
            aria-expanded={menuOpen}
            aria-controls="header-nav"
            aria-label={menuOpen ? "Menu sluiten" : "Menu openen"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span
              className={`block w-5 h-0.5 bg-white transition-transform origin-center ${menuOpen ? "rotate-45 translate-y-2" : ""}`}
            />
            <span
              className={`block w-5 h-0.5 bg-white transition-opacity ${menuOpen ? "opacity-0" : ""}`}
            />
            <span
              className={`block w-5 h-0.5 bg-white transition-transform origin-center ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`}
            />
          </button>

          {/* Logo block */}
          <div className="logo flex items-center gap-3">
            <WMark />
            <div className="flex items-baseline gap-2.5">
              <Link
                href="/"
                className="text-xl font-bold text-white no-underline leading-none hover:text-rijks-accent transition-colors"
              >
                Wettenbank<span className="text-rijks-accent">.online</span>
              </Link>
              <span
                className="hidden sm:block w-px h-4 bg-white/30 self-center"
                aria-hidden="true"
              />
              <span className="hidden sm:block text-xs text-white/60 font-normal leading-none tracking-wide uppercase">
                Onafhankelijke mirror
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary nav */}
      <nav
        id="header-nav"
        className={`header__nav ${menuOpen ? "block" : "hidden"} lg:block border-t border-white/10`}
        aria-label="Primaire navigatie"
      >
        <div className="container">
          <ul className="header__primary-nav flex flex-col lg:flex-row lg:gap-0 list-none m-0 p-0">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href as any}
                  className="block px-3 py-2.5 text-sm text-white/90 no-underline
                    hover:text-white hover:border-b-2 hover:border-rijks-accent
                    border-b-2 border-transparent
                    transition-colors leading-tight"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </header>
  );
}
