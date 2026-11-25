// Stroke icons drawn on a 24-unit grid.
const PATHS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  home: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  scale: 'M12 4v16M6 20h12M5 8h14M7.5 8l-3 6a3 3 0 0 0 6 0zM16.5 8l-3 6a3 3 0 0 0 6 0z',
  factory: 'M3 20V10l5 3V10l5 3V6l8 4v10zM3 20h18M7 17h2M12 17h2M17 17h2',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  flow: 'M3 4h6v6H3zM15 14h6v6h-6zM9 7h3a3 3 0 0 1 3 3v4',
  lock: 'M6 11h12v9H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  engrenagem: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5v14M16 5v14',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  bag: 'M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  sun: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7'
};

export function Icon({name, size = 16, stroke = 1.8, fill = 'none', style}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{flexShrink: 0, ...style}}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
