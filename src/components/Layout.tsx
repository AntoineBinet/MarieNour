import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

const NAV = [
  { section: null, items: [{ to: "/", label: "Accueil", ic: "🏠", end: true }] },
  {
    section: "Créer & organiser",
    items: [
      { to: "/listes", label: "Listes & checklists", ic: "✅" },
      { to: "/notes", label: "Notes & idées", ic: "📝" },
      { to: "/voyages", label: "Voyages", ic: "✈️" },
      { to: "/recettes", label: "Recettes", ic: "🍳" },
      { to: "/inspiration", label: "Inspiration", ic: "✨" },
      { to: "/photos", label: "Photos", ic: "📷" },
    ],
  },
  {
    section: "Avec mes amis",
    items: [
      { to: "/feed", label: "Le fil", ic: "🫶" },
      { to: "/amis", label: "Amis", ic: "👫" },
    ],
  },
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
                  end={(item as { end?: boolean }).end}
                  className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
                  onClick={close}
                >
                  <span className="ic">{item.ic}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
          {user?.role === "admin" && (
            <>
              <div className="nav-section">Admin</div>
              <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} onClick={close}>
                <span className="ic">🛠️</span> Administration
              </NavLink>
            </>
          )}
        </nav>

        <div className="spacer" />

        <div className="col gap-2">
          <NavLink to="/profil" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} onClick={close}>
            <span className="ic">{user?.avatar_url ? "🙂" : "👤"}</span>
            <span className="col" style={{ lineHeight: 1.2 }}>
              <strong style={{ fontWeight: 600 }}>{user?.display_name}</strong>
              <span className="muted small">@{user?.handle}</span>
            </span>
          </NavLink>
          <div className="row gap-2">
            <button className="btn btn-soft btn-sm grow" onClick={toggleTheme}>
              {theme === "dark" ? "☀️ Clair" : "🌙 Sombre"}
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
          <button className="btn btn-soft btn-icon menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰</button>
          <div className="grow" />
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
