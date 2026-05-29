export function InfoBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="informatie-melding bg-[#fdf5e0] border-y border-[#e8c84a] py-2 text-sm" role="status">
      <div className="container flex items-center gap-2">
        {/* Info icon SVG */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="flex-shrink-0 text-[#b8860b]"
        >
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="5" r="0.75" fill="currentColor" />
        </svg>
        <span className="text-[#5a4200]">{message}</span>
      </div>
    </div>
  );
}
