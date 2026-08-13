interface BrandMarkProps {
  /** Matches lucide's `size`: one number drives both dimensions. */
  size?: number;
  className?: string;
}

/**
 * The Merovíngio brand mark: the gas mask from the project's visual identity,
 * redrawn as a monoline glyph.
 *
 * It replaces a generic lucide `Radar`, which said nothing about this platform
 * — every dashboard in the category ships that icon. The reference artwork is a
 * full-colour raster; a raster cannot recolour itself for the light theme and
 * turns to mush at the 18px this renders at, so the shapes are traced instead:
 * hood, head strap, two lenses, the two side canisters and the chin filter.
 * Everything is `currentColor` on the same 24-unit grid and stroke weight as
 * the lucide set around it, so the mark inherits `.rt-brand-mark`'s accent
 * colour in both themes and sits inside the icon system rather than beside it.
 */
export function BrandMark({ size = 18, className }: BrandMarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Hood: rounded crown, widening at the cheeks, closing under the jaw. */}
      <path d="M12 2.3c-4.1 0-7 2.6-7 6.2 0 1.6.3 2.8.8 3.9.4 1 .7 1.9.8 2.9C6.9 17.9 9 20 12 20s5.1-2.1 5.4-4.7c.1-1 .4-1.9.8-2.9.5-1.1.8-2.3.8-3.9 0-3.6-2.9-6.2-7-6.2Z" />
      {/* Head strap across the brow — the detail that still reads as "gas mask"
          at 18px, where the lenses alone would pass for a hooded figure. */}
      <path d="M5.3 6.9h13.4" />
      {/* Lenses. */}
      <circle cx="8.9" cy="10.3" r="2.2" />
      <circle cx="15.1" cy="10.3" r="2.2" />
      {/* A filter canister on each cheek, breaking the silhouette outwards. */}
      <path d="M5.5 13.4H3.6a1.7 1.7 0 0 0 0 3.4h2.2" />
      <path d="M18.5 13.4h1.9a1.7 1.7 0 0 1 0 3.4h-2.2" />
      {/* Chin filter, overlapping the jaw the way the real canister does. */}
      <circle cx="12" cy="17.5" r="2.5" />
    </svg>
  );
}
