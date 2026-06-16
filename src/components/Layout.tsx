import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { Icon, type IconName } from "./Icon";
import { IntroTour } from "./IntroTour";

const NAV: { section: string | null; items: { to: string; label: string; ic: IconName; end?: boolean }[] }[] = [
  { section: null, items: [{ to: "/", label: "Accueil", ic: "home", end: true }] },
  {
    section: "Mon quotidien",
    items: [
      { to: "/finances", label: "Mes finances", ic: "wallet" },
      { to: "/listes", label: "Listes & checklists", ic: "lists" },
      { to: "/notes", label: "Notes & idées", ic: "notes" },
      { to: "/voyages", label: "Voyages", ic: "trips" },
      { to: "/recettes", label: "Recettes", ic: "recipes" },
      { to: "/inspiration", label: "Inspiration", ic: "inspiration" },
      { to: "/photos", label: "Photos", ic: "photos" },
    ],
  },
  {
    section: "Partager",
    items: [
      { to: "/depenses", label: "Dépenses partagées", ic: "expenses" },
      { to: "/feed", label: "Le fil", ic: "feed" },
      { to: "/amis", label: "Amis & sondages", ic: "friends" },
    ],
  },
];

// Barre de navigation inférieure (mobile) : les 5 accès les plus utilisés.
const BOTTOM_NAV: { to: string; label: string; ic: IconName; end?: boolean }[] = [
  { to: "/", label: "Accueil", ic: "home", end: true },
  { to: "/finances", label: "Finances", ic: "wallet" },
  { to: "/voyages", label: "Voyages", ic: "trips" },
  { to: "/depenses", label: "Dépenses", ic: "expenses" },
  { to: "/amis", label: "Amis", ic: "friends" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(document.documentElement.getAttribute("data-theme") || "light");

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("mn_theme", next);
  };

  const close = () => setOpen(false);

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={close} />}
      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="brand">
          <img src="/favicon.svg" alt="" className="brand-logo" />
          <span className="brand-name">marienour</span>
        </div>

        <nav className="nav">
          {NAV.map((group, i) => (
            <div key={i} className="nav" style={{ gap: 2 }}>
              {group.section && <div className="nav-section">{group.section}</div>}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                  onClick={close}
                >
                  <span className="ic"><Icon name={item.ic} size={19} /></span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
          {user?.role === "admin" && (
            <>
              <div className="nav-section">Admin</div>
              <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} onClick={close}>
                <span className="ic"><Icon name="admin" size={19} /></span> Administration
              </NavLink>
            </>
          )}
        </nav>

        <div className="spacer" />

        <div className="col gap-2">
          <NavLink to="/profil" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} onClick={close}>
            <span className="ic">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <Icon name="profile" size={19} />
              )}
            </span>
            <span className="col" style={{ lineHeight: 1.2 }}>
              <strong style={{ fontWeight: 600 }}>{user?.display_name}</strong>
              <span className="muted small">@{user?.handle}</span>
            </span>
          </NavLink>
          <div className="row gap-2">
            <button className="btn btn-soft btn-sm grow" onClick={toggleTheme}>
              <Icon name={theme === "dark" ? "sun" : "moon"} size={15} /> {theme === "dark" ? "Clair" : "Sombre"}
            </button>
            <button
              className="btn btn-soft btn-sm grow"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              Déconnexion
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-soft btn-icon menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu"><Icon name="menu" size={18} /></button>
          <div className="brand topbar-brand">
            <img src="/favicon.svg" alt="" className="brand-logo" style={{ width: 28, height: 28 }} />
            <span className="brand-name" style={{ fontSize: "1.05rem" }}>marienour</span>
          </div>
          <div className="grow" />
        </header>
        <main className="content">{children}</main>
      </div>

      {/* Navigation inférieure — visible uniquement sur mobile (CSS). */}
      <nav className="bottomnav" aria-label="Navigation rapide">
        {BOTTOM_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `bottomnav-item${isActive ? " active" : ""}`}
          >
            <Icon name={item.ic} size={22} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button className="bottomnav-item" onClick={() => setOpen(true)} aria-label="Plus">
          <Icon name="menu" size={22} />
          <span>Menu</span>
        </button>
      </nav>

      <IntroTour />
    </div>
  );
}
