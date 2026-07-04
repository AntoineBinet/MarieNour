import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { api } from "../api";
import { Icon, type IconName } from "./Icon";
import { IntroTour } from "./IntroTour";
import InstallApp from "./InstallApp";
import NotificationBell from "./NotificationBell";
import CommandPalette from "./CommandPalette";
import QuickAdd from "./QuickAdd";
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

// Barre de navigation inférieure (mobile) : 4 accès + un bouton central « + »
// (inséré au milieu, cf. rendu). Voyages sort de la barre (reste dans la barre
// latérale) et l'ancien item « Menu » disparaît — le hamburger de la barre du
// haut ouvre toujours la barre latérale.
const BOTTOM_NAV: { to: string; label: string; ic: IconName; end?: boolean }[] = [
  { to: "/", label: "Accueil", ic: "home", end: true },
  { to: "/finances", label: "Finances", ic: "wallet" },
  { to: "/fil", label: "Fil", ic: "memories" },
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
  const navType = useNavigationType();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const [theme, setTheme] = useState(resolvedTheme());
  // Tirer-pour-rafraîchir (PWA standalone : pas de pull-to-refresh natif Safari).
  const [pull, setPull] = useState(0); // distance courante du tirage (px, avec résistance)
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false); // doigt en cours de tirage (fige la transition)

  // Raccourci clavier global ⌘K / Ctrl+K : ouvre la palette de commandes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Remonte en haut au changement de page — uniquement en navigation avant
  // (PUSH). Le retour arrière (POP) garde la restauration native du navigateur.
  useEffect(() => {
    if (navType === "PUSH") window.scrollTo(0, 0);
  }, [pathname, navType]);

  // Tirer-pour-rafraîchir : sur écran tactile, un tirage vers le bas depuis le
  // haut de page (> ~70 px) invalide toutes les requêtes React Query. On
  // n'attache le touchmove non-passif qu'au besoin (preventDefault seulement
  // pendant un vrai tirage) pour ne casser ni le scroll ni les carrousels.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const THRESHOLD = 70; // seuil de déclenchement (px, après résistance)
    const MAX = 120; // amplitude visuelle maximale
    let startY = 0;
    let startX = 0;
    let tracking = false; // doigt posé alors qu'on est en haut de page
    let active = false; // geste reconnu comme un tirage vertical descendant
    let dist = 0; // distance visuelle courante (après résistance)
    let busy = false; // rafraîchissement en cours

    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    // Ne pas armer le geste quand une surface se superpose (modale, palette,
    // feuille QuickAdd, tiroir latéral, lecteur de stories plein écran) : leur
    // défilement/geste interne est distinct. `.story-overlay` est inclus car le
    // StoryViewer ne verrouille pas window.scrollY (atTop() y reste vrai) et son
    // glisser-pour-fermer laisse remonter les touchmove jusqu'ici.
    const overlayOpen = () =>
      !!document.querySelector(".overlay, .cmdk-overlay, .sidebar.open, .story-overlay");

    const onStart = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1 || !atTop() || overlayOpen()) {
        tracking = false;
        return;
      }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      tracking = true;
      active = false;
      dist = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      if (!active) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return; // mouvement encore ambigu
        // Vers le haut ou plutôt horizontal (carrousel) : on abandonne le geste.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
          tracking = false;
          return;
        }
        active = true;
        setDragging(true); // le doigt suit l'indicateur : pas de transition
      }
      if (dy <= 0 || !atTop()) {
        // Repassé au-dessus du haut : on annule proprement.
        tracking = false;
        active = false;
        dist = 0;
        setDragging(false);
        setPull(0);
        return;
      }
      dist = Math.min(MAX, dy * 0.5); // résistance : le tirage « traîne »
      setPull(dist);
      if (e.cancelable) e.preventDefault(); // bloque le rubber-band seulement pendant le tirage
    };

    const finish = () => {
      if (!tracking) {
        return;
      }
      tracking = false;
      setDragging(false); // relâché : la transition CSS anime le retour / le maintien
      if (active && dist >= THRESHOLD && !busy) {
        busy = true;
        setRefreshing(true);
        setPull(THRESHOLD); // maintient l'indicateur pendant le rafraîchissement
        Promise.resolve(queryClient.invalidateQueries()).finally(() => {
          busy = false;
          setRefreshing(false);
          setPull(0);
        });
      } else {
        setPull(0);
      }
      active = false;
      dist = 0;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", finish, { passive: true });
    window.addEventListener("touchcancel", finish, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", finish);
      window.removeEventListener("touchcancel", finish);
    };
  }, [queryClient]);

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
      {/* Indicateur de tirer-pour-rafraîchir : suit le doigt puis tourne pendant
          le rafraîchissement. Masqué au repos (transform négatif de base). */}
      <div
        className={`ptr-indicator${dragging ? " dragging" : ""}${refreshing ? " refreshing" : ""}`}
        style={{ transform: `translateY(${pull}px)`, opacity: pull > 0 || refreshing ? 1 : 0 }}
        aria-hidden={pull === 0 && !refreshing}
      >
        <span
          className="ptr-spinner"
          style={refreshing ? undefined : { transform: `rotate(${Math.round(pull * 2.6)}deg)` }}
        >
          <Icon name="repeat" size={18} />
        </span>
      </div>
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
          <button
            className="btn btn-soft topbar-search"
            onClick={() => setPalette(true)}
            aria-label="Rechercher"
            title="Rechercher (⌘K)"
          >
            <Icon name="search" size={16} />
            <span className="topbar-search-label">Rechercher</span>
            <kbd className="topbar-search-kbd">⌘K</kbd>
          </button>
          <button className="btn btn-soft btn-icon topbar-search-icon" onClick={() => setPalette(true)} aria-label="Rechercher">
            <Icon name="search" size={18} />
          </button>
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
              <span className="app-version" title="Version de l'application">{"v" + __APP_VERSION__.split(".")[0]}</span>
            </div>
          </footer>
        </main>
      </div>

      {/* Navigation inférieure — visible uniquement sur mobile (CSS). Le bouton
          central « + » surélevé ouvre la feuille « Créer rapidement ». */}
      <nav className="bottomnav" aria-label="Navigation rapide">
        {BOTTOM_NAV.slice(0, 2).map((item) => (
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
        <button
          type="button"
          className="quickadd-btn"
          onClick={() => setQuickAdd(true)}
          aria-label="Créer rapidement"
        >
          <span className="quickadd-btn-ring"><Icon name="plus" size={24} /></span>
        </button>
        {BOTTOM_NAV.slice(2).map((item) => (
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
      </nav>

      {quickAdd && <QuickAdd onClose={() => setQuickAdd(false)} />}

      <CommandPalette open={palette} onClose={() => setPalette(false)} />

      <IntroTour />
    </div>
  );
}
