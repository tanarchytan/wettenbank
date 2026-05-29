import { SearchFormFields, type Defaults } from "./SearchFormFields";

export function SearchFormSimple({
  defaults,
  action = "/zoeken",
}: {
  defaults?: Defaults | undefined;
  action?: string | undefined;
}) {
  return (
    <form action={action} method="get" className="space-y-6">
      <SearchFormFields defaults={defaults} />
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-rijks-border">
        <a
          href="/zoeken"
          className="text-sm px-4 py-2 border border-rijks-border bg-white text-rijks-text-muted hover:border-rijks-link hover:text-rijks-link no-underline"
        >
          Wis scherm
        </a>
        <button
          type="submit"
          className="bg-rijks-blue text-white px-6 py-2 text-sm font-semibold
            hover:bg-[#0d3057] transition-colors
            focus-visible:outline-2 focus-visible:outline-rijks-link focus-visible:outline-offset-2
            rounded-sm"
        >
          Zoeken
        </button>
      </div>
    </form>
  );
}
