import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import { Icon, type IconName } from "./Icon";
import { IntroTour } from "./IntroTour";
import InstallApp from "./InstallApp";
import NotificationBell from "./NotificationBell";
import { resolvedTheme, toggleThemeMode } from "../theme";

interface NavItem { to: string; label: string; ic: IconName; end?: boolean; more?: boolean }
interface NavGroup { key: string; section: string | null; items: NavItem[] }

// Les items marqués `more` sont repliés sous « Plus » : un nouveau venu voit ~10
// choix posés au lieu de 13, mais chaque fonctionnalité reste à un clic.
const NAV: NavGroup[] = [
  { key: "home", section: null, items: [{ to: "/", label: "Accueil", ic: "home", end: true }] },
  {
    key: "daily",
    section: "Mon quotidien",
    items: [
      { to: "/finances", label: "Mes finances", ic: "wallet" },
      { to: "/listes", label: "Listes & checklists", ic: "lists" },
      { to: "/notes", label: "Notes & idées", ic: "notes" },
      { to: "/voyages", label: "Voyages", ic: "trips" },
      { to: "/evenements", label: "Événements", ic: "confetti" },
      { to: "/recettes", label: "Recettes", ic: "recipes", more: true },
      { to: "/inspiration", label: "Inspiration", ic: "inspiration", more: true },
      { to: "/photos", label: "Photos", ic: "photos", more: true },
    ],
  },
  {
    key: "share",
    section: "Partager",
    items: [
      { to: "/fil", label: "Mon fil", ic: "memories" },
      { to: "/depenses", label: "Dépenses partagées", ic: "expenses" },
      { to: "/amis", label: "Amis & sondages", ic: "friends" },
      { to: "/feed", label: "Le fil des amis", ic: "feed", more: true },
    ],
  },
];

// Barre de navigation inférieure (mobile) : les 5 accès les plus utilisés.
const BOTTOM_NAV: { to: string; label: string; ic: IconName; end?: boolean }[] = [
  { to: "/", label: "Accueil", ic: "home", end: true },
  { to: "/fil", label: "Mon fil", ic: "memories" },
  { to: "/finances", label: "Finances", ic: "wallet" },
  { to: "/voyages", label: "Voyages", ic: "trips" },
  { to: "/amis", label: "Amis", ic: "friends" },
];

// Libellé de la page courante (affiché dans la barre du haut sur desktop).
const TITLE_LOOKUP: { to: string; label: string }[] = [
  ...NAV.flatMap((g) => g.items.map((i) => ({ to: i.to, label: i.label.split(" & ")[0].split(" &")[0] }))),
  { to: "/personnalisation", label: "Personnalisation" },
  { to: "/aide", label: "Aide & support" },
  { to: "/profil", label: "Profil" },
  { to: "/admin", label: "Administration" },
];
function pageTitle(pathname: string): string {
  const exact = TITLE_LOOKUP.find((l) => l.to === pathname);
  if (exact) return exact.label;
  const prefix = TITLE_LOOKUP.filter((l) => l.to !== "/" && pathname.startsWith(l.to)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0];
  // Pas de repli sur « Accueil » pour une route inconnue (profil public, pages
  // légales) : mieux vaut pas de titre qu'un titre trompeur.
  return prefix?.label ?? "";
}

function isItemActive(pathname: string, item: NavItem): boolean {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
}

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
      onClick={onNavigate}
    >
      <span className="ic"><Icon name={item.ic} size={19} /></span>
      {item.label}
    </NavLink>
  );
}

function NavSection({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const { pathname } = useLocation();
  const primary = group.items.filter((i) => !i.more);
  const more = group.items.filter((i) => i.more);
  const activeInMore = more.some((i) => isItemActive(pathname, i));
  const storeKey = "mn.nav.more." + group.key;
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(storeKey) === "1";
    } catch {
      return false;
    }
  });
  const expanded = open || activeInMore; // la section de la page active reste ouverte
  const toggle = () => {
    // Quand la page active est dans la traîne, la section ne peut pas se replier :
    // on ne touche pas à la préférence pour ne pas la corrompre (sinon « Moins »
    // mémoriserait « ouvert » par erreur).
    if (activeInMore) return;
    const v = !expanded;
    setOpen(v);
    try {
      localStorage.setItem(storeKey, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="nav" style={{ gap: 2 }}>
      {group.section && <div className="nav-section">{group.section}</div>}
      {primary.map((item) => (
        <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />
      ))}
      {expanded && more.map((item) => <NavItemLink key={item.to} item={item} onNavigate={onNavigate} />)}
      {/* Pas de bascule quand la page active est dans la traîne (toujours dépliée). */}
      {more.length > 0 && !activeInMore && (
        <button type="button" className="nav-more" onClick={toggle} aria-expanded={expanded}>
          <span className="ic"><Icon name="dots" size={18} /></span>
          {expanded ? "Moins" : "Plus"}
          <span className={`nav-more-chevron${expanded ? " open" : ""}`}><Icon name="arrowRight" size={14} /></span>
        </button>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(resolvedTheme());

  const toggleTheme = () => {
    const mode = toggleThemeMode(); // applique immédiatement clair/sombre
    setTheme(resolvedTheme());
    // Mémorise le choix côté serveur pour le retrouver sur tous les appareils.
    api
      .updateMe({ prefs: { theme_mode: mode } })
      .then((res) => setUser(res.user))
      .catch(() => {});
  };

  const close = () => setOpen(false);

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={close} />}
      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="brand">
          <img src="/favicon.svg" alt="" className="brand-logo" />
          <span className="brand-name">MarieNour</span>
        </div>

        <nav className="nav">
          {NAV.map((group) => (
            <NavSection key={group.key} group={group} onNavigate={close} />
          ))}
          {user?.role === "admin" && (
            <div className="nav" style={{ gap: 2 }}>
              <div className="nav-section">Admin</div>
              <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} onClick={close}>
                <span className="ic"><Icon name="admin" size={19} /></span> Administration
              </NavLink>
            </div>
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

          <div className="nav-section">Réglages</div>
          <NavLink to="/personnalisation" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} onClick={close}>
            <span className="ic"><Icon name="palette" size={19} /></span>
            Personnalisation
          </NavLink>
          <NavLink to="/aide" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} onClick={close}>
            <span className="ic"><Icon name="lightbulb" size={19} /></span>
            Aide &amp; support
          </NavLink>

          {/* Actions de compte en icônes : ne débordent jamais sur deux lignes. */}
          <div className="row gap-2 sidebar-actions">
            <button className="btn btn-soft btn-icon" onClick={toggleTheme} title={theme === "dark" ? "Passer en clair" : "Passer en sombre"} aria-label="Changer de thème">
              <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
            </button>
            <InstallApp />
            <button
              className="btn btn-soft btn-icon"
              title="Se déconnecter"
              aria-label="Se déconnecter"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn btn-soft btn-icon menu-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu"><Icon name="menu" size={18} /></button>
          <span className="topbar-title">{pageTitle(pathname)}</span>
          <div className="brand topbar-brand">
            <img src="/favicon.svg" alt="" className="brand-logo" style={{ width: 28, height: 28 }} />
            <span className="brand-name" style={{ fontSize: "1.05rem" }}>MarieNour</span>
          </div>
          <NotificationBell />
        </header>
        <main className="content">
          {children}
          <footer className="app-footer">
            <div className="app-footer-links">
              <Link to="/cgu">Conditions d'utilisation</Link>
              <span className="sep">·</span>
              <Link to="/confidentialite">Confidentialité</Link>
              <span className="sep">·</span>
              <Link to="/mentions-legales">Mentions légales</Link>
            </div>
            <div className="app-footer-meta">
              MarieNour — service gratuit de <strong>AB&nbsp;Azur&nbsp;Tech</strong>, sans pub ni revente de données.
            </div>
          </footer>
        </main>
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
