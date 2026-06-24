// marienour — jeu d'icônes « maison ».
//
// Remplace les emojis par des logos vectoriels personnalisés, dessinés à la
// main (viewBox 24×24, trait `currentColor`) : nets sur tous les écrans, ils
// héritent de la couleur/taille du contexte et du thème clair/sombre — bien
// plus pro et cohérent qu'un emoji système. Un seul composant <Icon/> partout.

import type { CSSProperties } from "react";

export type IconName =
  | "home"
  | "lists"
  | "notes"
  | "trips"
  | "recipes"
  | "inspiration"
  | "photos"
  | "feed"
  | "friends"
  | "polls"
  | "expenses"
  | "admin"
  | "profile"
  | "qr"
  | "plus"
  | "sun"
  | "moon"
  | "logout"
  | "menu"
  | "heart"
  | "star"
  | "sparkle"
  | "compass"
  | "calendar"
  | "wallet"
  | "users"
  | "check"
  | "map"
  | "tent"
  | "car"
  | "plane"
  | "bed"
  | "fork"
  | "camera"
  | "trash"
  | "edit"
  | "share"
  | "link"
  | "scale"
  | "bell"
  | "settings"
  | "search"
  | "luggage"
  | "coins"
  | "bank"
  | "target"
  | "repeat"
  | "pin"
  | "image"
  | "music"
  | "fire"
  | "palette"
  | "mirror"
  | "trophy"
  | "chart"
  | "key"
  | "lock"
  | "rocket"
  | "leaf"
  | "flower"
  | "chat"
  | "bookmark"
  | "grid"
  | "archive"
  | "filter"
  | "close"
  | "arrowLeft"
  | "arrowRight"
  | "dots"
  | "eye"
  | "download"
  | "building"
  | "piggybank"
  | "transfer"
  | "tag"
  | "clock"
  | "info"
  | "lightbulb"
  | "globe"
  | "wand"
  | "trend"
  | "confetti"
  | "cake"
  | "glass"
  | "gift"
  | "memories"
  | "play";

const P: Record<IconName, JSX.Element> = {
  home: <path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" />,
  lists: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m4 5.5 1.2 1.2L7.5 4M4 11.5l1.2 1.2L7.5 10M4 17.5l1.2 1.2L7.5 16" />
    </>
  ),
  notes: (
    <>
      <path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5M8.5 13h7M8.5 16.5h5" />
    </>
  ),
  trips: (
    <>
      <path d="M3 12c3-1 5-1 9-1s6 0 9 1" />
      <path d="M12 4c2 2 3 5 3 8s-1 6-3 8c-2-2-3-5-3-8s1-6 3-8Z" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  recipes: (
    <>
      <path d="M7 3v6a3 3 0 0 0 6 0V3" />
      <path d="M10 3v18M17 3c-1.5 1-2.5 3-2.5 6 0 2 1 3 2.5 3v9" />
    </>
  ),
  inspiration: (
    <>
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2v.6h5v-.6c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
      <path d="M9.5 20h5M10.5 22h3" />
    </>
  ),
  photos: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="m4 17 5-4.5 4 3.2 2.5-2.2L20 17" />
    </>
  ),
  feed: (
    <>
      <path d="M12 20.5c-5-3.2-8-6.3-8-10A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 8 2.5c0 3.7-3 6.8-8 10Z" />
    </>
  ),
  friends: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2A3 3 0 0 1 17.5 12M17 14.5a5.5 5.5 0 0 1 3.5 4.5" />
    </>
  ),
  polls: (
    <>
      <path d="M5 20V10M12 20V4M19 20v-7" />
    </>
  ),
  expenses: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v2" />
      <rect x="3" y="7" width="18" height="12" rx="2.5" />
      <path d="M16 12.5h.01M21 11h-4a1.5 1.5 0 0 0 0 3h4" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3 4 6v5c0 4.5 3.2 8 8 10 4.8-2 8-5.5 8-10V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3M21 14v.01M14 21h.01M17.5 17.5h.01M21 17.5v3.5h-3.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />,
  logout: (
    <>
      <path d="M15 12H6m0 0 3-3m-3 3 3 3" />
      <path d="M11 5h6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  heart: <path d="M12 20.5c-5-3.2-8-6.3-8-10A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 8 2.5c0 3.7-3 6.8-8 10Z" />,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" />,
  sparkle: (
    <>
      <path d="M12 3c.4 3.6 1.4 4.6 5 5-3.6.4-4.6 1.4-5 5-.4-3.6-1.4-4.6-5-5 3.6-.4 4.6-1.4 5-5Z" />
      <path d="M18 13c.2 1.6.7 2.1 2.3 2.3-1.6.2-2.1.7-2.3 2.3-.2-1.6-.7-2.1-2.3-2.3 1.6-.2 2.1-.7 2.3-2.3Z" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 6.2A3 3 0 0 1 17.5 12M17 14.5a5.5 5.5 0 0 1 3.5 4.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 6.5" />,
  map: (
    <>
      <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  tent: (
    <>
      <path d="M11 4 3 19h18L13 4M12 7v12" />
      <path d="m9 19 3-5 3 5" />
    </>
  ),
  car: (
    <>
      <path d="M4 16v2M20 16v2" />
      <path d="M3 16v-3l2-5h14l2 5v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M5.5 8h13M7 13h.01M17 13h.01" />
    </>
  ),
  plane: <path d="M21 13.5 14 11V5.5a2 2 0 0 0-4 0V11l-7 2.5V16l7-1.5V19l-2.5 1.5V22l4.5-1 4.5 1v-1.5L14 19v-4.5l7 1.5Z" />,
  bed: (
    <>
      <path d="M3 7v11M3 12h18v6M21 12v-1a3 3 0 0 0-3-3h-6v4" />
      <circle cx="7.5" cy="10.5" r="1.5" />
    </>
  ),
  fork: (
    <>
      <path d="M7 3v6a3 3 0 0 0 6 0V3" />
      <path d="M10 3v18M17 3c-1.5 1-2.5 3-2.5 6 0 2 1 3 2.5 3v9" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="m4 17 5-4.5 4 3.2 2.5-2.2L20 17" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6" />,
  edit: (
    <>
      <path d="M5 19h14" />
      <path d="M13.5 5.5 17 9 8 18l-4 1 1-4 8.5-9.5Z" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" />
    </>
  ),
  link: <path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />,
  scale: (
    <>
      <path d="M12 4v16M7 8h10M6 20h12" />
      <path d="M7 8 4 14h6L7 8ZM17 8l-3 6h6l-3-6Z" />
    </>
  ),
  bell: <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M9.5 19a2.5 2.5 0 0 0 5 0" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 7l1.9 1.1M17.9 15.9l1.9 1.1M4.2 17l1.9-1.1M17.9 8.1l1.9-1.1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  luggage: (
    <>
      <rect x="6" y="7" width="12" height="13" rx="2" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M10 11v5M14 11v5M9 20v1M15 20v1" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="5.5" ry="2.6" />
      <path d="M3.5 7v4c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V7" />
      <path d="M9 13.6v3.8c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-6" />
      <ellipse cx="14.5" cy="11.4" rx="5.5" ry="2.6" />
    </>
  ),
  bank: (
    <>
      <path d="M12 3 3 8h18L12 3Z" />
      <path d="M5 11v6M9.5 11v6M14.5 11v6M19 11v6M3.5 20h17" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>
  ),
  repeat: <path d="M4 9a5 5 0 0 1 5-5h7l-2.5-2.5M20 15a5 5 0 0 1-5 5H8l2.5 2.5M16 4l2.5 2.5M8 20l-2.5-2.5" />,
  pin: (
    <>
      <path d="M12 21v-7" />
      <path d="M8 3h8l-1 4 2.5 3.5h-11L8 7 8 3Z" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="9.5" r="1.6" />
      <path d="m4 17 5-4.5 4 3.2 3-2.7 4 3.5" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </>
  ),
  fire: <path d="M12 3c.5 3-1.5 4.5-3 6.5C7.3 11.8 6 13.6 6 16a6 6 0 0 0 12 0c0-1.8-.8-3.3-1.8-4.6-.3 1-.9 1.7-1.7 2.1.6-2.6-.6-4.8-2.5-6.5-.5 1.3-1 2-2 2.5.3-2.6-.3-4.5 0-7Z" />,
  palette: (
    <>
      <path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-.9 2-1.8 0-.5-.2-.9-.5-1.2-.3-.4-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-3.9-4-7-9-7Z" />
      <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  mirror: (
    <>
      <ellipse cx="12" cy="9" rx="6" ry="7" />
      <path d="M12 16v5M9 21h6" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M10 13.5V17M14 13.5V17M8 20h8M9 17h6v3H9z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="m11 11 8 8M16 16l2-2M19 19l1.5-1.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 3c3 1.5 5 4.5 5 8.5 0 2-.5 3.5-1 4.5H8c-.5-1-1-2.5-1-4.5C7 7.5 9 4.5 12 3Z" />
      <circle cx="12" cy="9.5" r="1.6" />
      <path d="M9 16c-1.5.5-2.5 2-2.5 4 2 0 3.5-1 4-2M15 16c1.5.5 2.5 2 2.5 4-2 0-3.5-1-4-2" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 6-13 14-13 0 8-5 14-13 14-1 0-1-1-1-1Z" />
      <path d="M5 19c3-4 6-6 10-7" />
    </>
  ),
  flower: (
    <>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 9.6V5a2.4 2.4 0 0 1 0 4.6M12 14.4V19a2.4 2.4 0 0 0 0-4.6M9.6 12H5a2.4 2.4 0 0 0 4.6 0M14.4 12H19a2.4 2.4 0 0 1-4.6 0" />
    </>
  ),
  chat: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 4v-4H5.5A1.5 1.5 0 0 1 4 13.5Z" />,
  bookmark: <path d="M6 4h12v17l-6-4-6 4Z" />,
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  archive: (
    <>
      <rect x="3.5" y="4" width="17" height="4" rx="1" />
      <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" />
    </>
  ),
  filter: <path d="M4 5h16l-6.5 8v5l-3 2v-7L4 5Z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  arrowLeft: <path d="M19 12H5m0 0 6-6m-6 6 6 6" />,
  arrowRight: <path d="M5 12h14m0 0-6-6m6 6-6 6" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  download: <path d="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 20h16" />,
  building: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" />
    </>
  ),
  piggybank: (
    <>
      <path d="M15 6c3 0 5.5 2.4 5.5 5.5 0 1.6-.7 3-1.8 4l.3 3h-2.3l-.5-1.6c-.6.2-1.4.3-2.2.3H10l-1.5 1.3H7l-.4-2.4C5 18.4 4 16.6 4 14.5 4 10.9 7.6 8 12 8h3" />
      <path d="M3.5 12.5H5M15.5 11h.01M8 8.5 7 5.5" />
    </>
  ),
  transfer: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  tag: (
    <>
      <path d="M4 4h7l9 9-7 7-9-9V4Z" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 17h6M9.5 20h5M8 13a5 5 0 1 1 8 0c-.8 1-1.5 1.7-1.5 2.5V16h-5v-.5c0-.8-.7-1.5-1.5-2.5Z" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.3 2.5 14.7 0 17M12 3.5c-2.5 2.3-2.5 14.7 0 17" />
    </>
  ),
  wand: (
    <>
      <path d="M5 19 16 8M14 6l1-2 1 2 2 1-2 1-1 2-1-2-2-1 2-1ZM6.5 11.5 5 11l1.5-.5L7 9l.5 1.5L9 11l-1.5.5L7 13Z" />
    </>
  ),
  trend: <path d="M4 16l5-5 3 3 7-7m0 0h-4.5m4.5 0v4.5" />,
  confetti: (
    <>
      <path d="M3 21 9.2 5.5a1 1 0 0 1 1.7-.2l4.8 4.8a1 1 0 0 1-.2 1.7L3 21Z" />
      <path d="m9.5 14.5 4.2-4.2" />
      <path d="M15 3.5v.01M19.5 5.5v.01M21 10v.01M17.5 9h.01M20 14.5h.01" />
    </>
  ),
  cake: (
    <>
      <path d="M4 21h16" />
      <path d="M5 21v-8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8" />
      <path d="M5 15.2c1.3 0 1.3 1 2.6 1s1.3-1 2.6-1 1.3 1 2.6 1 1.3-1 2.6-1 1.3 1 2.6 1" />
      <path d="M12 8.5V11M12 5.5v.01" />
    </>
  ),
  glass: (
    <>
      <path d="M5 4h14l-7 8-7-8Z" />
      <path d="M12 12v6M8.5 20h7" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="9.5" width="16" height="10.5" rx="1.2" />
      <path d="M4 9.5h16M12 9.5V20" />
      <path d="M12 9.5C12 6.5 10.3 5 8.8 5.8S8.5 9.5 12 9.5Zm0 0c0-3 1.7-4.5 3.2-3.7S15.5 9.5 12 9.5Z" />
    </>
  ),
  memories: (
    <>
      <rect x="6.5" y="6.5" width="14" height="13" rx="2.5" />
      <path d="M3.5 4.5v13a2 2 0 0 0 2 2" />
      <circle cx="11" cy="11" r="1.6" />
      <path d="m8 17 3.5-3 2.5 2 2-1.8 3.5 3" />
    </>
  ),
  play: <path d="M7 5.5v13l11-6.5-11-6.5Z" />,
};

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  filled?: boolean;
}

export function Icon({ name, size = 20, className, strokeWidth = 1.8, style, filled }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {P[name]}
    </svg>
  );
}

export default Icon;
