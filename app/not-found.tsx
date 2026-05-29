export default function NotFound() {
  return (
    <div className="py-10 max-w-xl">
      <div className="border-l-4 border-rijks-error pl-5 mb-6">
        <h1 className="text-2xl font-bold text-rijks-blue mb-1">Pagina niet gevonden</h1>
        <p className="text-sm text-rijks-text-subdued">HTTP 404</p>
      </div>
      <p className="text-rijks-text-muted mb-6">
        De pagina of regeling die u zoekt bestaat niet, of is nog niet in onze database opgenomen.
      </p>

      {/* Jump-back search box */}
      <div className="bg-neutral-bg border border-rijks-border p-5">
        <p className="text-sm font-semibold text-rijks-blue mb-3">Probeer te zoeken:</p>
        <form action="/zoeken" method="get" className="flex gap-0">
          <input
            name="q"
            type="text"
            placeholder="Bijv: bestuursrecht…"
            aria-label="Zoek in wetten en regelingen"
            className="flex-1 border border-rijks-border border-r-0 px-3 py-2 text-sm
              focus:border-rijks-link focus:outline-none focus:ring-1 focus:ring-rijks-link/30
              rounded-l-sm bg-white"
          />
          <button
            type="submit"
            className="bg-rijks-blue text-white px-4 py-2 text-sm font-semibold
              hover:bg-[#0d3057] transition-colors rounded-r-sm border border-rijks-blue"
          >
            Zoeken
          </button>
        </form>
      </div>

      <p className="mt-4 text-sm">
        <a href="/" className="text-rijks-link hover:underline">Terug naar de homepage</a>
      </p>
    </div>
  );
}
