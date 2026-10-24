const iconPaths = {
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
  chat: <><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-4.6a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 4h.5a8.5 8.5 0 0 1 8 7.5Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>,
  notes: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 12h7M9 16h7" /></>,
  quiz: <><path d="M9 4h6M9 2h6v4H9z" /><path d="M6 4H4v18h16V4h-2M8 12l2 2 5-5M8 18h8" /></>,
  cards: <><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M8 2h10a2 2 0 0 1 2 2v15M9 11h6M9 15h4" /></>,
  play: <><path d="m8 5 12 7-12 7z" /></>,
  pause: <><path d="M8 5h3v14H8zM15 5h3v14h-3z" /></>,
  history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></>,
  edit: <><path d="m15 5 4 4M4 20l4.2-.8L19.5 7.9a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3" /></>,
  spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h7" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  filter: <><path d="M4 7h16M7 12h10M10 17h4" /><circle cx="8" cy="7" r="1.5" /><circle cx="15" cy="12" r="1.5" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  save: <><path d="M5 3h12l3 3v15H4V3z" /><path d="M8 3v6h8V3M8 21v-8h8v8" /></>,
  chevron: <><path d="m9 18 6-6-6-6" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  leaf: <><path d="M20 4c-8 0-14 3-14 10a6 6 0 0 0 6 6c7 0 10-7 8-16Z" /><path d="M4 21c2-5 6-8 11-11" /></>,
  bolt: <><path d="m13 2-3 9h7L9 22l2-9H5z" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" /></>,
  lightbulb: <><path d="M9 18h6M10 22h4" /><path d="M8.2 14.5A6 6 0 1 1 15.8 14.5c-.8.7-1.3 1.6-1.5 2.5h-4.6c-.2-.9-.7-1.8-1.5-2.5Z" /></>,
  linkedin: <><path d="M6.5 9.5v9M6.5 6.5h.01M11 18.5v-9h4v1.5a3 3 0 0 1 6 0v7.5M11 13a3 3 0 0 1 6 0v5.5" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
}

function Icon({ name, size = 18, strokeWidth = 1.8, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths[name] || iconPaths.spark}
    </svg>
  )
}

export default Icon
