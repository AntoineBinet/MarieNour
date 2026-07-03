import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useAuth } from "../auth";
import { Icon, type IconName } from "./Icon";
import type { SearchResult, SearchResultType } from "@shared/types";

// Palette de commandes universelle (⌘K / Ctrl+K). Deux usages d'un coup :
//  • naviguer instantanément vers n'importe quelle page (utile sur 20+ écrans) ;
//  • rechercher dans TOUT son contenu (notes, listes, voyages, événements,
//    recettes, dépenses, transactions, amis…) via GET /api/search.
// Navigation 100 % clavier (↑/↓/Entrée/Échap) + clic.

interface CommandEntry {
  id: string;
  kind: "nav" | "result";
  title: string;
  subtitle: string | null;
  icon: IconName;
  to: string;
}

const NAV_COMMANDS: { title: string; subtitle: string; icon: IconName; to: string; admin?: boolean }[] = [
  { title: "Accueil", subtitle: "Ton atelier", icon: "home", to: "/" },
  { title: "Mes finances", subtitle: "Budget & comptes", icon: "wallet", to: "/finances" },
  { title: "Listes & checklists", subtitle: "À faire, courses…", icon: "lists", to: "/listes" },
  { title: "Notes & idées", subtitle: "Tes notes", icon: "notes", to: "/notes" },
  { title: "Voyages", subtitle: "Itinéraires & séjours", icon: "trips", to: "/voyages" },
  { title: "Événements", subtitle: "Soirées, week-ends…", icon: "confetti", to: "/evenements" },
  { title: "Recettes", subtitle: "Ta cuisine", icon: "recipes", to: "/recettes" },
  { title: "Inspiration", subtitle: "Moodboards & idées", icon: "inspiration", to: "/inspiration" },
  { title: "Photos", subtitle: "Albums & clichés", icon: "photos", to: "/photos" },
  { title: "Mon fil", subtitle: "Souvenirs & collections", icon: "memories", to: "/fil" },
  { title: "Dépenses partagées", subtitle: "Tricount", icon: "expenses", to: "/depenses" },
  { title: "Amis & sondages", subtitle: "Ton cercle", icon: "friends", to: "/amis" },
  { title: "Le fil des amis", subtitle: "Nouveautés", icon: "feed", to: "/feed" },
  { title: "Personnalisation", subtitle: "Thème & apparence", icon: "palette", to: "/personnalisation" },
  { title: "Aide & support", subtitle: "Guides", icon: "lightbulb", to: "/aide" },
  { title: "Profil", subtitle: "Ton compte", icon: "profile", to: "/profil" },
  { title: "Administration", subtitle: "Réglages du site", icon: "admin", to: "/admin", admin: true },
];

const TYPE_LABEL: Record<SearchResultType, string> = {
  note: "Note",
  list: "Liste",
  trip: "Voyage",
  event: "Événement",
  recipe: "Recette",
  inspiration: "Inspiration",
  collection: "Collection",
  expense_group: "Dépenses",
  transaction: "Transaction",
  friend: "Ami",
};

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Réinitialise à chaque ouverture et donne le focus au champ.
  useEffect(() => {
    if (open) {
      setQ("");
      setDebounced("");
      setActive(0);
      // Focus posé dans la frame d'ouverture (au plus près du geste utilisateur)
      // pour maximiser les chances que le clavier iOS s'ouvre tout seul ; repli :
      // l'utilisateur peut toujours toucher le champ.
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

  // Debounce de la requête réseau (la frappe reste fluide).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 160);
    return () => clearTimeout(t);
  }, [q]);

  const { data: searchData, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.search(debounced),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  const navMatches = useMemo<CommandEntry[]>(() => {
    const nq = norm(q.trim());
    return NAV_COMMANDS.filter((c) => (c.admin ? user?.role === "admin" : true))
      .filter((c) => !nq || norm(c.title).includes(nq) || norm(c.subtitle).includes(nq))
      .map((c) => ({ id: `nav:${c.to}`, kind: "nav" as const, title: c.title, subtitle: c.subtitle, icon: c.icon, to: c.to }));
  }, [q, user?.role]);

  const resultEntries = useMemo<CommandEntry[]>(() => {
    const results: SearchResult[] = searchData?.results ?? [];
    return results.map((r) => ({
      id: `res:${r.type}:${r.id}`,
      kind: "result" as const,
      title: r.title,
      subtitle: r.subtitle ? `${TYPE_LABEL[r.type]} · ${r.subtitle}` : TYPE_LABEL[r.type],
      icon: r.icon as IconName,
      to: r.link,
    }));
  }, [searchData]);

  // Quand on cherche, les résultats de contenu passent devant la navigation.
  const entries = useMemo<CommandEntry[]>(
    () => (q.trim().length >= 2 ? [...resultEntries, ...navMatches] : navMatches),
    [q, resultEntries, navMatches],
  );

  // Borne l'index actif quand la liste change.
  useEffect(() => {
    setActive((a) => Math.max(0, Math.min(a, Math.max(0, entries.length - 1))));
  }, [entries.length]);

  if (!open) return null;

  const go = (entry: CommandEntry | undefined) => {
    if (!entry) return;
    onClose();
    navigate(entry.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(entries[active]);
    }
  };

  // Garde l'élément actif visible.
  const scrollActive = (el: HTMLButtonElement | null) => {
    if (el) el.scrollIntoView({ block: "nearest" });
  };

  const searching = q.trim().length >= 2;

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Recherche et navigation">
        <div className="cmdk-input-row">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Chercher une note, un voyage, un ami… ou aller à une page"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
          />
          {isFetching && <span className="cmdk-spin" aria-hidden />}
          <button className="cmdk-esc" onClick={onClose} aria-label="Fermer">Échap</button>
        </div>

        <div className="cmdk-list" ref={listRef}>
          {searching && (
            <div className="cmdk-section">{isFetching && resultEntries.length === 0 ? "Recherche…" : `Résultats`}</div>
          )}
          {entries.length === 0 ? (
            <div className="cmdk-empty">
              <Icon name="search" size={22} />
              <p className="muted small">Aucun résultat pour « {q} »</p>
            </div>
          ) : (
            entries.map((entry, i) => {
              const showNavHeader = searching && entry.kind === "nav" && (i === 0 || entries[i - 1].kind !== "nav");
              return (
                <div key={entry.id}>
                  {showNavHeader && <div className="cmdk-section">Aller à</div>}
                  <button
                    ref={i === active ? scrollActive : undefined}
                    className={`cmdk-item${i === active ? " active" : ""}`}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(entry)}
                  >
                    <span className="cmdk-item-ic"><Icon name={entry.icon} size={17} /></span>
                    <span className="cmdk-item-main">
                      <span className="cmdk-item-title">{entry.title}</span>
                      {entry.subtitle && <span className="cmdk-item-sub">{entry.subtitle}</span>}
                    </span>
                    {entry.kind === "result" && <span className="cmdk-item-go"><Icon name="arrowRight" size={14} /></span>}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span>
          <span><kbd>↵</kbd> ouvrir</span>
          <span><kbd>Échap</kbd> fermer</span>
        </div>
      </div>
    </div>
  );
}
