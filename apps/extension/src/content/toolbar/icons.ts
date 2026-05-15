/**
 * Hand-picked Lucide icons inlined as SVG markup so the content script
 * doesn't have to pull the entire `lucide-preact` runtime into every page.
 *
 * All paths share Lucide's authored attributes: 24x24 viewBox, currentColor
 * stroke, 2px line, round caps/joins.
 */

const wrap = (path: string, size = 18): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`

export const icons = {
  chevronLeft: (s?: number) => wrap(`<path d="m15 18-6-6 6-6"/>`, s),
  chevronRight: (s?: number) => wrap(`<path d="m9 18 6-6-6-6"/>`, s),
  bell: (s?: number) =>
    wrap(
      `<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>`,
      s,
    ),
  bellOff: (s?: number) =>
    wrap(
      `<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>`,
      s,
    ),
  globe: (s?: number) =>
    wrap(
      `<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20"/><path d="M12 2a14.5 14.5 0 0 1 0 20"/><path d="M2 12h20"/>`,
      s,
    ),
  pencil: (s?: number) =>
    wrap(
      `<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497Z"/><path d="m15 5 4 4"/>`,
      s,
    ),
  quote: (s?: number) =>
    wrap(
      `<path d="M3 21c3 0 7-1 7-8V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M15 21c3 0 7-1 7-8V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>`,
      s,
    ),
  wand: (s?: number) =>
    wrap(
      `<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>`,
      s,
    ),
  play: (s?: number) => wrap(`<polygon points="6 3 20 12 6 21 6 3"/>`, s),
  pause: (s?: number) =>
    wrap(`<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>`, s),
  restart: (s?: number) =>
    wrap(
      `<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>`,
      s,
    ),
  step: (s?: number) =>
    wrap(
      `<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>`,
      s,
    ),
  x: (s?: number) => wrap(`<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`, s),
  refresh: (s?: number) =>
    wrap(
      `<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>`,
      s,
    ),
  download: (s?: number) =>
    wrap(
      `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>`,
      s,
    ),
  send: (s?: number) =>
    wrap(
      `<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11Z"/><path d="m21.854 2.147-10.94 10.939"/>`,
      s,
    ),
  trash: (s?: number) =>
    wrap(
      `<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`,
      s,
    ),
} satisfies Record<string, (s?: number) => string>

export type IconName = keyof typeof icons
