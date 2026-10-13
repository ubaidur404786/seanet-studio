// the SEA-Net Studio mark: a signal with a lens over its spike - "we show where the model looked".
// same drawing as public/favicon.svg, inline here so it stays sharp at any size
export default function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="SEA-Net Studio logo">
      <rect width="32" height="32" rx="8" fill="#101827" />
      <path
        d="M3 17h4l2.5-6 3 11 2.5-5h14"
        fill="none"
        stroke="#53D6D0"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="11" cy="16.5" r="6" fill="#668BFF" fillOpacity=".18" stroke="#668BFF" strokeWidth="1.8" />
      <path d="M15.4 21l3.6 3.6" stroke="#668BFF" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
