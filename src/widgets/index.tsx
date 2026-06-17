import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Icon } from "../components/Icon";
import type { WidgetDef } from "@shared/types";

export const WIDGET_CATALOG: WidgetDef[] = [
  { type: "lists", name: "Listes & checklists", description: "Tes listes en cours et leur avancement.", emoji: "✅", icon: "lists" },
  { type: "notes", name: "Notes récentes", description: "Tes dernières notes et idées.", emoji: "📝", icon: "notes" },
  { type: "trips", name: "Prochain voyage", description: "Compte à rebours du prochain départ.", emoji: "✈️", icon: "trips" },
  { type: "events", name: "Prochain événement", description: "Ton prochain rendez-vous et le décompte.", emoji: "🎉", icon: "confetti" },
  { type: "recipes", name: "Recettes favorites", description: "Tes recettes mises en favori.", emoji: "🍳", icon: "recipes" },
  { type: "inspiration", name: "Boîte à inspirations", description: "À trier depuis tes réseaux.", emoji: "✨", icon: "inspiration" },
  { type: "photos", name: "Photos", description: "Tes derniers clichés.", emoji: "📷", icon: "photos" },
  { type: "expenses", name: "Dépenses partagées", description: "Le solde de tes groupes type Tricount.", emoji: "💸", icon: "expenses" },
  { type: "feed", name: "Fil des amis", description: "Les dernières nouveautés de tes amis.", emoji: "🫶", icon: "feed" },
  { type: "quote", name: "Note épinglée", description: "Un petit mot ou une intention du jour.", emoji: "🌼", icon: "sparkle" },
];

export const WIDGET_DEFS: Record<string, WidgetDef> = Object.fromEntries(WIDGET_CATALOG.map((w) => [w.type, w]));

function WBody({ children }: { children: React.ReactNode }) {
  return <div className="widget-body">{children}</div>;
}
const Loading = () => <p className="muted small">Chargement…</p>;

function ListsWidget() {
  const { data, isLoading } = useQuery({ queryKey: ["lists"], queryFn: () => api.lists() });
  if (isLoading) return <Loading />;
  const lists = (data?.lists ?? []).slice(0, 4);
  if (!lists.length) return <p className="muted small">Aucune liste. <Link to="/listes">En créer une →</Link></p>;
  return (
    <WBody>
      <div className="col gap-3">
        {lists.map((l) => {
          const total = l.item_count ?? 0;
          const done = l.done_count ?? 0;
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <Link key={l.id} to="/listes" style={{ color: "inherit", textDecoration: "none" }}>
              <div className="row gap-2"><span>{l.emoji}</span><strong style={{ flex: 1 }}>{l.title}</strong><span className="muted small">{done}/{total}</span></div>
              <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 99, marginTop: 4 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: 99 }} />
              </div>
            </Link>
          );
        })}
      </div>
    </WBody>
  );
}

function NotesWidget() {
  const { data, isLoading } = useQuery({ queryKey: ["notes"], queryFn: () => api.notes() });
  if (isLoading) return <Loading />;
  const notes = (data?.notes ?? []).slice(0, 4);
  if (!notes.length) return <p className="muted small">Aucune note. <Link to="/notes">Écrire →</Link></p>;
  return (
    <WBody>
      <div className="col gap-2">
        {notes.map((n) => (
          <Link key={n.id} to="/notes" style={{ color: "inherit", textDecoration: "none", borderLeft: `3px solid var(--${n.color})`, paddingLeft: 8 }}>
            <strong>{n.title || "Sans titre"}</strong>
            <div className="muted small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.body}</div>
          </Link>
        ))}
      </div>
    </WBody>
  );
}

function TripsWidget() {
  const { data, isLoading } = useQuery({ queryKey: ["trips"], queryFn: () => api.trips() });
  if (isLoading) return <Loading />;
  const upcoming = (data?.trips ?? []).filter((t) => t.start_date && t.start_date >= new Date().toISOString().slice(0, 10));
  const trip = upcoming[0] ?? data?.trips?.[0];
  if (!trip) return <p className="muted small">Aucun voyage. <Link to="/voyages">Planifier →</Link></p>;
  const days = trip.start_date ? Math.ceil((new Date(trip.start_date).getTime() - Date.now()) / 86400000) : null;
  return (
    <WBody>
      <Link to={`/voyages/${trip.id}`} style={{ color: "inherit", textDecoration: "none" }}>
        <h3>{trip.title}</h3>
        <p className="muted small">{trip.destination}</p>
        {days != null && days >= 0 && <p style={{ marginTop: 8 }}><strong style={{ fontSize: "1.6rem", color: "var(--accent)" }}>{days}</strong> jours avant le départ</p>}
      </Link>
    </WBody>
  );
}

function EventsWidget() {
  const { data, isLoading } = useQuery({ queryKey: ["events"], queryFn: () => api.events() });
  if (isLoading) return <Loading />;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (data?.events ?? []).filter((e) => e.date_decided && e.start_date && e.start_date >= today && e.status !== "cancelled");
  const ev = upcoming[0] ?? (data?.events ?? [])[0];
  if (!ev) return <p className="muted small">Aucun événement. <Link to="/evenements">Organiser →</Link></p>;
  const days = ev.start_date ? Math.ceil((new Date(ev.start_date).getTime() - Date.now()) / 86400000) : null;
  return (
    <WBody>
      <Link to={`/evenements/${ev.id}`} style={{ color: "inherit", textDecoration: "none" }}>
        <h3>{ev.title}</h3>
        {ev.location && <p className="muted small">{ev.location}</p>}
        {days != null && days >= 0 && ev.date_decided ? (
          <p style={{ marginTop: 8 }}>
            <strong style={{ fontSize: "1.6rem", color: "var(--accent)" }}>{days === 0 ? "Auj." : days}</strong> {days === 0 ? "c'est le jour !" : "jours à attendre"}
          </p>
        ) : (
          <p className="muted small" style={{ marginTop: 8 }}>Date à définir</p>
        )}
        <p className="small row gap-2" style={{ marginTop: 6 }}>
          <Icon name="users" size={13} /> {ev.going_count} attendus{ev.capacity ? ` / ${ev.capacity}` : ""}
        </p>
      </Link>
    </WBody>
  );
}

function RecipesWidget() {
  const { data, isLoading } = useQuery({ queryKey: ["recipes"], queryFn: () => api.recipes() });
  if (isLoading) return <Loading />;
  const recipes = (data?.recipes ?? []).filter((r) => r.favorite).slice(0, 4);
  const show = recipes.length ? recipes : (data?.recipes ?? []).slice(0, 4);
  if (!show.length) return <p className="muted small">Aucune recette. <Link to="/recettes">Ajouter →</Link></p>;
  return (
    <WBody>
      <div className="col gap-2">
        {show.map((r) => (
          <Link key={r.id} to="/recettes" className="row gap-2" style={{ color: "inherit", textDecoration: "none" }}>
            <Icon name={r.favorite ? "star" : "fork"} size={15} /><span style={{ flex: 1 }}>{r.title}</span>
          </Link>
        ))}
      </div>
    </WBody>
  );
}

function InspirationWidget() {
  const { data, isLoading } = useQuery({ queryKey: ["inspiration", "inbox"], queryFn: () => api.inspirations({ status: "inbox" }) });
  if (isLoading) return <Loading />;
  const items = data?.items ?? [];
  return (
    <WBody>
      <Link to="/inspiration" style={{ color: "inherit", textDecoration: "none" }}>
        <p><strong style={{ fontSize: "1.6rem", color: "var(--accent)" }}>{items.length}</strong> à trier</p>
        <div className="row gap-2 wrap" style={{ marginTop: 8 }}>
          {items.slice(0, 4).map((i) => i.image_url ? (
            <img key={i.id} src={i.image_url} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8 }} />
          ) : (
            <span key={i.id} className="chip">{i.source}</span>
          ))}
        </div>
      </Link>
    </WBody>
  );
}

function PhotosWidget() {
  const { data, isLoading } = useQuery({ queryKey: ["media"], queryFn: () => api.media() });
  if (isLoading) return <Loading />;
  const media = (data?.media ?? []).slice(0, 6);
  if (!media.length) return <p className="muted small">Aucune photo. <Link to="/photos">Importer →</Link></p>;
  return (
    <WBody>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {media.map((m) => (
          <Link key={m.id} to="/photos"><img src={m.url} alt={m.caption ?? ""} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8 }} /></Link>
        ))}
      </div>
    </WBody>
  );
}

function FeedWidget() {
  const { data, isLoading } = useQuery({ queryKey: ["feed"], queryFn: () => api.feed() });
  if (isLoading) return <Loading />;
  const feed = (data?.feed ?? []).slice(0, 4);
  if (!feed.length) return <p className="muted small">Rien pour l'instant. <Link to="/amis">Ajoute des amis →</Link></p>;
  return (
    <WBody>
      <div className="col gap-2">
        {feed.map((f) => (
          <Link key={`${f.entity_type}-${f.entity_id}`} to="/feed" className="row gap-2" style={{ color: "inherit", textDecoration: "none" }}>
            <Icon name="feed" size={15} />
            <span className="small" style={{ flex: 1 }}><strong>{f.author.display_name}</strong> · {f.title}</span>
          </Link>
        ))}
      </div>
    </WBody>
  );
}

function ExpensesWidget() {
  const { data, isLoading } = useQuery({ queryKey: ["expense-groups"], queryFn: () => api.expenseGroups() });
  if (isLoading) return <Loading />;
  const groups = (data?.groups ?? []).filter((g) => !g.archived);
  if (!groups.length) return <p className="muted small">Aucun groupe. <Link to="/depenses">Démarrer un Tricount →</Link></p>;
  const fmt = (n: number, cur: string) => n.toLocaleString("fr-FR", { style: "currency", currency: cur || "EUR" });
  return (
    <WBody>
      <div className="col gap-2">
        {groups.slice(0, 4).map((g) => {
          const bal = g.my_balance ?? 0;
          const col = Math.abs(bal) < 0.01 ? "var(--muted)" : bal > 0 ? "var(--ok)" : "var(--danger)";
          return (
            <Link key={g.id} to="/depenses" className="row gap-2" style={{ color: "inherit", textDecoration: "none" }}>
              <Icon name="expenses" size={16} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.title}</span>
              <strong style={{ color: col }}>{fmt(bal, g.currency)}</strong>
            </Link>
          );
        })}
      </div>
    </WBody>
  );
}

function QuoteWidget({ config }: { config: Record<string, unknown> }) {
  const text = (config?.text as string) || "Aujourd'hui, je crée quelque chose de beau.";
  return (
    <WBody>
      <p style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", lineHeight: 1.4 }}>{text}</p>
    </WBody>
  );
}

export function WidgetContent({ type, config }: { type: string; config: Record<string, unknown> }) {
  switch (type) {
    case "lists": return <ListsWidget />;
    case "notes": return <NotesWidget />;
    case "trips": return <TripsWidget />;
    case "events": return <EventsWidget />;
    case "recipes": return <RecipesWidget />;
    case "inspiration": return <InspirationWidget />;
    case "photos": return <PhotosWidget />;
    case "expenses": return <ExpensesWidget />;
    case "feed": return <FeedWidget />;
    case "quote": return <QuoteWidget config={config} />;
    default: return <p className="muted small">Widget inconnu</p>;
  }
}
