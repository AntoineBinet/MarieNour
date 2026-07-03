import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm } from "../ui";
import { Icon, type IconName } from "../components/Icon";
import { InviteQr } from "../components/InviteQr";
import { InviteLink } from "../components/InviteLink";
import { VisibilityField, VisibilityChip } from "../components/VisibilityField";
import { ImageField } from "../components/ImageField";
import type { Friendship, Trip, TripItem, TripKind, TripParticipant, Visibility } from "@shared/types";

const TRIP_KINDS: { value: TripKind; label: string; icon: IconName }[] = [
  { value: "trip", label: "Voyage", icon: "trips" },
  { value: "roadtrip", label: "Road trip", icon: "car" },
  { value: "weekend", label: "Week-end", icon: "tent" },
  { value: "solo", label: "En solo", icon: "compass" },
];
const TRIP_KIND_MAP = Object.fromEntries(TRIP_KINDS.map((k) => [k.value, k])) as Record<TripKind, (typeof TRIP_KINDS)[number]>;

const KIND_ICON: Record<TripItem["kind"], IconName> = {
  activity: "compass",
  food: "fork",
  lodging: "bed",
  transport: "car",
  note: "notes",
};

const KIND_LABEL: Record<TripItem["kind"], string> = {
  activity: "Activité",
  food: "Repas",
  lodging: "Logement",
  transport: "Transport",
  note: "Note",
};

const IDEAS_KEY = "__ideas__";

function formatDateRange(start: string | null, end: string | null): string | null {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (start && end) {
    return `${new Date(start).toLocaleDateString("fr-FR", opts)} → ${new Date(end).toLocaleDateString("fr-FR", opts)}`;
  }
  if (start) return new Date(start).toLocaleDateString("fr-FR", opts);
  if (end) return new Date(end).toLocaleDateString("fr-FR", opts);
  return null;
}

function formatDayTitle(day: string): string {
  const d = new Date(day);
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── Trip edit form ─────────────────────────────────────────────────────── */
interface TripForm {
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget: string;
  currency: string;
  cover_url: string;
  notes: string;
  visibility: Visibility;
  shared_with: string[];
  kind: TripKind;
}

function tripToForm(t: Trip): TripForm {
  return {
    title: t.title,
    destination: t.destination ?? "",
    start_date: t.start_date ?? "",
    end_date: t.end_date ?? "",
    budget: t.budget != null ? String(t.budget) : "",
    currency: t.currency || "EUR",
    cover_url: t.cover_url ?? "",
    notes: t.notes ?? "",
    visibility: t.visibility,
    shared_with: t.shared_with ?? [],
    kind: t.kind ?? "trip",
  };
}

/* ── Pastille participant ───────────────────────────────────────────────── */
function ParticipantChip({ p, onRemove }: { p: TripParticipant; onRemove?: () => void }) {
  const initial = (p.name || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      className="row gap-2"
      style={{ background: "var(--surface-2)", borderRadius: 999, padding: "0.2rem 0.2rem 0.2rem 0.55rem" }}
      title={p.user_id ? `@${p.handle ?? ""}` : "Invité (sans compte)"}
    >
      <span
        style={{
          width: 24, height: 24, borderRadius: "50%", display: "grid", placeItems: "center",
          background: p.user_id ? "var(--accent-soft)" : "var(--border-strong)", color: "#fff",
          fontSize: "0.72rem", fontWeight: 700,
        }}
      >
        {p.avatar_url ? <img src={p.avatar_url} alt="" loading="lazy" decoding="async" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} /> : initial}
      </span>
      <span className="small" style={{ fontWeight: 600 }}>{p.name}{p.is_me ? " (toi)" : ""}</span>
      {p.role === "owner" && <span className="badge">Orga</span>}
      {!p.user_id && <span className="badge">Invité</span>}
      {onRemove && p.role !== "owner" && (
        <button className="btn btn-icon btn-soft btn-sm" style={{ width: 24, height: 24 }} onClick={onRemove} aria-label="Retirer">
          <Icon name="trash" size={13} />
        </button>
      )}
    </span>
  );
}

/* ── Itinerary item form ────────────────────────────────────────────────── */
interface ItemForm {
  day_date: string;
  time: string;
  title: string;
  kind: TripItem["kind"];
  location: string;
  url: string;
  notes: string;
  cost: string;
}

const EMPTY_ITEM: ItemForm = {
  day_date: "",
  time: "",
  title: "",
  kind: "activity",
  location: "",
  url: "",
  notes: "",
  cost: "",
};

export default function TripDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { confirm, confirmNode } = useConfirm();

  const [editing, setEditing] = useState(false);
  const [tripForm, setTripForm] = useState<TripForm | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM);
  const [guestName, setGuestName] = useState("");
  const [invitingFriend, setInvitingFriend] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["trip", id], queryFn: () => api.trip(id), enabled: !!id });
  const trip = data?.trip;
  const items = trip?.items ?? [];
  const participants = trip?.participants ?? [];

  // Liste d'amis (pour le partage en un clic), chargée à l'ouverture de la modale.
  const friendsQ = useQuery({ queryKey: ["friends"], queryFn: () => api.friends(), enabled: invitingFriend });
  const participantUserIds = new Set(participants.map((p) => p.user_id).filter(Boolean));
  const invitableFriends = (friendsQ.data?.friends ?? []).filter((f) => !participantUserIds.has(f.user.id));

  const invalidateTrip = () => qc.invalidateQueries({ queryKey: ["trip", id] });

  const addParticipant = useMutation({
    mutationFn: (name: string) => api.addTripParticipant(id, { name }),
    onSuccess: () => {
      invalidateTrip();
      setGuestName("");
      toast.push("Participant ajouté");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const removeParticipant = useMutation({
    mutationFn: (pid: string) => api.removeTripParticipant(id, pid),
    onSuccess: invalidateTrip,
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const addFriendParticipant = useMutation({
    mutationFn: (f: Friendship) =>
      api.addTripParticipant(id, { name: f.user.display_name, user_id: f.user.id, role: "traveller" }),
    onSuccess: () => {
      invalidateTrip();
      toast.push("Ami ajouté au voyage");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const voteItem = useMutation({
    mutationFn: (itemId: string) => api.voteTripItem(id, itemId),
    onSuccess: invalidateTrip,
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const createGroup = useMutation({
    mutationFn: () =>
      api.createExpenseGroup({
        title: trip?.title || "Voyage",
        trip_id: id,
        members: participants.filter((p) => !p.is_me).map((p) => p.name),
      }),
    onSuccess: () => {
      invalidateTrip();
      toast.push("Tricount du voyage créé");
      navigate("/depenses");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const updateTrip = useMutation({
    mutationFn: (b: Partial<Trip>) => api.updateTrip(id, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", id] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.push("Voyage mis à jour");
      setEditing(false);
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const deleteTrip = useMutation({
    mutationFn: () => api.deleteTrip(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.push("Voyage supprimé");
      navigate("/voyages");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const addItem = useMutation({
    mutationFn: (b: Partial<TripItem>) => api.addTripItem(id, b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", id] });
      toast.push("Étape ajoutée");
      setAddingItem(false);
      setItemForm(EMPTY_ITEM);
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const updateItem = useMutation({
    mutationFn: ({ itemId, b }: { itemId: string; b: Partial<TripItem> }) => api.updateTripItem(id, itemId, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip", id] }),
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => api.deleteTripItem(id, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trip", id] });
      toast.push("Étape supprimée");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  if (isLoading) return <Spinner />;

  if (!trip) {
    return (
      <div>
        <Link to="/voyages" className="small row gap-2"><Icon name="arrowLeft" size={15} /> Voyages</Link>
        <div className="card" style={{ marginTop: "var(--space-4)" }}>
          <EmptyState
            icon="map"
            title="Voyage introuvable"
            hint="Ce voyage n'existe pas ou a été supprimé."
            action={<Link className="btn btn-primary" to="/voyages">Retour aux voyages</Link>}
          />
        </div>
      </div>
    );
  }

  const range = formatDateRange(trip.start_date, trip.end_date);
  // Voyage partagé : je suis participant mais pas le créateur → vue en lecture
  // (je peux consulter et voter, mais pas éditer/supprimer ni gérer les voyageurs).
  const isOwner = trip.is_owner !== false;

  /* Group items: by day_date (ascending), then an "ideas" group for null day_date. */
  const groups = new Map<string, TripItem[]>();
  for (const it of items) {
    const key = it.day_date ?? IDEAS_KEY;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const dayKeys = [...groups.keys()].filter((k) => k !== IDEAS_KEY).sort();
  const orderedKeys = [...dayKeys, ...(groups.has(IDEAS_KEY) ? [IDEAS_KEY] : [])];
  for (const list of groups.values()) {
    list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.position - b.position);
  }

  const totalCost = items.reduce((sum, it) => sum + (it.cost ?? 0), 0);

  const openEdit = () => {
    setTripForm(tripToForm(trip));
    setEditing(true);
  };

  const submitTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripForm) return;
    if (!tripForm.title.trim()) {
      toast.push("Le titre est requis", true);
      return;
    }
    updateTrip.mutate({
      title: tripForm.title.trim(),
      destination: tripForm.destination.trim() || null,
      start_date: tripForm.start_date || null,
      end_date: tripForm.end_date || null,
      budget: tripForm.budget ? Number(tripForm.budget) : null,
      currency: tripForm.currency.trim() || "EUR",
      cover_url: tripForm.cover_url.trim() || null,
      notes: tripForm.notes.trim() || null,
      visibility: tripForm.visibility,
      shared_with: tripForm.shared_with,
      kind: tripForm.kind,
    });
  };

  const submitItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.title.trim()) {
      toast.push("Le titre de l'étape est requis", true);
      return;
    }
    addItem.mutate({
      day_date: itemForm.day_date || null,
      time: itemForm.time || null,
      title: itemForm.title.trim(),
      kind: itemForm.kind,
      location: itemForm.location.trim() || null,
      url: itemForm.url.trim() || null,
      notes: itemForm.notes.trim() || null,
      cost: itemForm.cost ? Number(itemForm.cost) : null,
    });
  };

  const askDeleteTrip = async () => {
    if (await confirm(`Supprimer le voyage « ${trip.title} » et toutes ses étapes ?`)) deleteTrip.mutate();
  };

  const askDeleteItem = async (it: TripItem) => {
    if (await confirm(`Supprimer l'étape « ${it.title} » ?`)) deleteItem.mutate(it.id);
  };

  return (
    <div>
      <Link to="/voyages" className="small row gap-2"><Icon name="arrowLeft" size={15} /> Voyages</Link>

      <div className="page-head row wrap" style={{ justifyContent: "space-between", marginTop: "var(--space-3)" }}>
        <div>
          <p className="eyebrow">{TRIP_KIND_MAP[trip.kind]?.label ?? "Voyage"}</p>
          <h1>{trip.title}</h1>
          <div className="row wrap gap-3" style={{ marginTop: "var(--space-2)" }}>
            <span className="tag-pill"><Icon name={TRIP_KIND_MAP[trip.kind]?.icon ?? "trips"} size={13} /> {TRIP_KIND_MAP[trip.kind]?.label}</span>
            <VisibilityChip visibility={trip.visibility} sharedWith={trip.shared_with} />
            {trip.destination && <span className="muted row gap-2"><Icon name="map" size={14} /> {trip.destination}</span>}
            {range && <span className="muted row gap-2"><Icon name="calendar" size={14} /> {range}</span>}
            {trip.budget != null && <span className="chip chip-accent"><Icon name="wallet" size={13} /> {trip.budget} {trip.currency}</span>}
          </div>
        </div>
        {isOwner ? (
          <div className="row gap-2">
            <button className="btn btn-soft" onClick={openEdit}><Icon name="edit" size={15} /> Éditer</button>
            <button className="btn btn-danger" onClick={askDeleteTrip}><Icon name="trash" size={15} /> Supprimer</button>
          </div>
        ) : trip.owner ? (
          <span className="chip chip-accent row gap-2" style={{ alignSelf: "flex-start" }}>
            <Icon name="users" size={14} /> Partagé par {trip.owner.display_name}
          </span>
        ) : null}
      </div>

      {/* ── Participants & partage ──────────────────────────────────────── */}
      <div className="card card-pad-sm" style={{ marginBottom: "var(--space-5)" }}>
        <div className="panel-head" style={{ marginBottom: "var(--space-3)" }}>
          <h3 className="row gap-2"><Icon name="users" size={17} /> Voyageurs {participants.length > 0 && <span className="chip">{participants.length}</span>}</h3>
          {isOwner && (
            <div className="row gap-2 wrap">
              <button className="btn btn-soft btn-sm" onClick={() => setInvitingFriend(true)}>
                <Icon name="friends" size={15} /> Un ami
              </button>
              <InviteLink kind="trip" targetId={id} variant="sm">Lien</InviteLink>
              <InviteQr kind="trip" targetId={id} variant="sm">QR</InviteQr>
            </div>
          )}
        </div>
        <div className="row wrap gap-2">
          {participants.map((p) => (
            <ParticipantChip key={p.id} p={p} onRemove={isOwner ? () => removeParticipant.mutate(p.id) : undefined} />
          ))}
        </div>
        {isOwner && (
          <form
            className="row gap-2"
            style={{ marginTop: "var(--space-3)" }}
            onSubmit={(e) => {
              e.preventDefault();
              if (guestName.trim()) addParticipant.mutate(guestName.trim());
            }}
          >
            <input
              className="input"
              style={{ maxWidth: 240 }}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Ajouter un voyageur (même sans compte)…"
              autoCapitalize="words"
              autoComplete="off"
              enterKeyHint="done"
            />
            <button className="btn btn-soft btn-sm" type="submit" disabled={addParticipant.isPending}>
              <Icon name="plus" size={15} /> Ajouter
            </button>
          </form>
        )}
        <div className="row gap-2 wrap" style={{ marginTop: "var(--space-3)" }}>
          {trip.expense_group_id ? (
            <Link className="btn btn-soft btn-sm" to="/depenses"><Icon name="expenses" size={15} /> Voir les dépenses partagées</Link>
          ) : isOwner ? (
            <button className="btn btn-soft btn-sm" onClick={() => createGroup.mutate()} disabled={createGroup.isPending}>
              <Icon name="expenses" size={15} /> {createGroup.isPending ? "Création…" : "Créer un Tricount pour ce voyage"}
            </button>
          ) : null}
        </div>
      </div>

      {trip.notes && (
        <div className="card card-pad-sm" style={{ marginBottom: "var(--space-5)", whiteSpace: "pre-wrap" }}>
          {trip.notes}
        </div>
      )}

      <div className="panel-head">
        <h2>Itinéraire</h2>
        {isOwner && (
          <button className="btn btn-primary btn-sm" onClick={() => setAddingItem(true)}><Icon name="plus" size={15} /> Ajouter une étape</button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="compass"
            title="Itinéraire vide"
            hint={isOwner
              ? "Ajoute des activités, repas, logements ou transports pour construire ton programme."
              : "L'organisateur n'a pas encore ajouté d'étapes à ce voyage."}
            action={isOwner ? <button className="btn btn-primary" onClick={() => setAddingItem(true)}><Icon name="plus" size={15} /> Ajouter une étape</button> : undefined}
          />
        </div>
      ) : (
        <div className="col gap-4">
          {orderedKeys.map((key) => {
            const groupItems = groups.get(key)!;
            const isIdeas = key === IDEAS_KEY;
            return (
              <div key={key} className="card card-pad-sm">
                <h3 className="row gap-2" style={{ marginBottom: "var(--space-3)" }}>
                  {isIdeas ? <><Icon name="lightbulb" size={16} /> Idées / à caser</> : formatDayTitle(key)}
                </h3>
                {groupItems.map((it) => (
                  <div key={it.id} className="li-row li-row-wrap">
                    <span
                      className={`check${it.done ? " done" : ""}`}
                      role="checkbox"
                      aria-checked={it.done}
                      tabIndex={isOwner ? 0 : -1}
                      style={isOwner ? undefined : { cursor: "default" }}
                      onClick={isOwner ? () => updateItem.mutate({ itemId: it.id, b: { done: !it.done } }) : undefined}
                      onKeyDown={
                        isOwner
                          ? (e) => (e.key === "Enter" || e.key === " ") && updateItem.mutate({ itemId: it.id, b: { done: !it.done } })
                          : undefined
                      }
                    >
                      {it.done ? <Icon name="check" size={13} /> : ""}
                    </span>

                    <span title={KIND_LABEL[it.kind]} style={{ color: "var(--accent-ink)", display: "inline-flex" }}>
                      <Icon name={KIND_ICON[it.kind]} size={18} />
                    </span>

                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="row wrap gap-2">
                        {it.time && <span className="badge">{it.time}</span>}
                        <span className={`li-text${it.done ? " done" : ""}`} style={{ fontWeight: 600 }}>
                          {it.url ? (
                            <a href={it.url} target="_blank" rel="noreferrer">{it.title}</a>
                          ) : (
                            it.title
                          )}
                        </span>
                      </div>
                      {(it.location || it.notes) && (
                        <p className="muted small row gap-1" style={{ marginTop: 2 }}>
                          {it.location && <><Icon name="pin" size={13} /> {it.location}</>}
                          {it.location && it.notes ? " · " : ""}
                          {it.notes}
                        </p>
                      )}
                    </div>

                    <div className="row gap-2 li-row-end">
                      {it.cost != null && (
                        <span className="chip small">{it.cost} {trip.currency}</span>
                      )}
                      <button
                        className={`btn btn-sm ${it.voted_by_me ? "btn-primary" : "btn-soft"}`}
                        onClick={() => voteItem.mutate(it.id)}
                        title="Voter pour cette étape (décision de groupe)"
                      >
                        <Icon name="heart" size={14} filled={it.voted_by_me} /> {it.votes ?? 0}
                      </button>
                      {isOwner && (
                        <button
                          className="btn btn-icon btn-danger btn-sm"
                          onClick={() => askDeleteItem(it)}
                          aria-label="Supprimer"
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}

          {totalCost > 0 && (
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <span className="chip chip-accent">Total estimé · {totalCost} {trip.currency}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Edit trip modal ── */}
      {editing && tripForm && (
        <Modal
          title="Éditer le voyage"
          onClose={() => setEditing(false)}
          footer={
            <>
              <button className="btn btn-soft" onClick={() => setEditing(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={submitTrip} disabled={updateTrip.isPending}>
                {updateTrip.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </>
          }
        >
          <form onSubmit={submitTrip}>
            <Field label="Titre">
              <input className="input" value={tripForm.title} onChange={(e) => setTripForm({ ...tripForm, title: e.target.value })} autoCapitalize="sentences" autoFocus />
            </Field>
            <Field label="Type de séjour">
              <div className="row gap-2 wrap">
                {TRIP_KINDS.map((k) => (
                  <button
                    type="button"
                    key={k.value}
                    className={`btn btn-sm ${tripForm.kind === k.value ? "btn-primary" : "btn-soft"}`}
                    onClick={() => setTripForm({ ...tripForm, kind: k.value })}
                  >
                    <Icon name={k.icon} size={15} /> {k.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Destination">
              <input className="input" value={tripForm.destination} onChange={(e) => setTripForm({ ...tripForm, destination: e.target.value })} autoCapitalize="words" autoComplete="off" />
            </Field>
            <div className="row gap-3 wrap">
              <div className="grow">
                <Field label="Date de début">
                  <input type="date" className="input" value={tripForm.start_date} onChange={(e) => setTripForm({ ...tripForm, start_date: e.target.value })} />
                </Field>
              </div>
              <div className="grow">
                <Field label="Date de fin">
                  <input type="date" className="input" value={tripForm.end_date} onChange={(e) => setTripForm({ ...tripForm, end_date: e.target.value })} />
                </Field>
              </div>
            </div>
            <div className="row gap-3 wrap">
              <div className="grow">
                <Field label="Budget">
                  <input type="number" className="input" value={tripForm.budget} onChange={(e) => setTripForm({ ...tripForm, budget: e.target.value })} min="0" inputMode="numeric" />
                </Field>
              </div>
              <div style={{ width: 120 }}>
                <Field label="Devise">
                  <input className="input" value={tripForm.currency} onChange={(e) => setTripForm({ ...tripForm, currency: e.target.value })} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
                </Field>
              </div>
            </div>
            <Field label="Image de couverture">
              <ImageField value={tripForm.cover_url} onChange={(url) => setTripForm({ ...tripForm, cover_url: url })} />
            </Field>
            <Field label="Notes">
              <textarea className="textarea" value={tripForm.notes} onChange={(e) => setTripForm({ ...tripForm, notes: e.target.value })} placeholder="Choses à ne pas oublier, réservations…" />
            </Field>
            <Field label="Visibilité">
              <VisibilityField
                value={tripForm.visibility}
                sharedWith={tripForm.shared_with}
                onChange={(v) => setTripForm({ ...tripForm, visibility: v })}
                onSharedWithChange={(ids) => setTripForm({ ...tripForm, shared_with: ids })}
              />
            </Field>
          </form>
        </Modal>
      )}

      {/* ── Add item modal ── */}
      {addingItem && (
        <Modal
          title="Ajouter une étape"
          onClose={() => setAddingItem(false)}
          footer={
            <>
              <button className="btn btn-soft" onClick={() => setAddingItem(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={submitItem} disabled={addItem.isPending}>
                {addItem.isPending ? "Ajout…" : "Ajouter"}
              </button>
            </>
          }
        >
          <form onSubmit={submitItem}>
            <Field label="Titre">
              <input className="input" value={itemForm.title} onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })} placeholder="Visite du château" autoCapitalize="sentences" autoFocus />
            </Field>
            <Field label="Type">
              <select className="select" value={itemForm.kind} onChange={(e) => setItemForm({ ...itemForm, kind: e.target.value as TripItem["kind"] })}>
                <option value="activity">Activité</option>
                <option value="food">Repas</option>
                <option value="lodging">Logement</option>
                <option value="transport">Transport</option>
                <option value="note">Note</option>
              </select>
            </Field>
            <div className="row gap-3 wrap">
              <div className="grow">
                <Field label="Jour (laisser vide pour « à caser »)">
                  <input type="date" className="input" value={itemForm.day_date} onChange={(e) => setItemForm({ ...itemForm, day_date: e.target.value })} />
                </Field>
              </div>
              <div style={{ width: 140 }}>
                <Field label="Heure">
                  <input type="time" className="input" value={itemForm.time} onChange={(e) => setItemForm({ ...itemForm, time: e.target.value })} />
                </Field>
              </div>
            </div>
            <Field label="Lieu">
              <input className="input" value={itemForm.location} onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })} placeholder="Adresse, quartier…" autoCapitalize="sentences" />
            </Field>
            <Field label="Lien (URL)">
              <input className="input" type="url" inputMode="url" value={itemForm.url} onChange={(e) => setItemForm({ ...itemForm, url: e.target.value })} placeholder="https://…" autoCapitalize="none" autoComplete="off" spellCheck={false} />
            </Field>
            <Field label="Coût">
              <input type="number" className="input" value={itemForm.cost} onChange={(e) => setItemForm({ ...itemForm, cost: e.target.value })} placeholder="0" min="0" inputMode="decimal" />
            </Field>
            <Field label="Notes">
              <textarea className="textarea" value={itemForm.notes} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
            </Field>
          </form>
        </Modal>
      )}

      {/* ── Inviter un ami (partage en un clic) ── */}
      {invitingFriend && (
        <Modal title="Inviter un ami" onClose={() => setInvitingFriend(false)}>
          {friendsQ.isLoading ? (
            <Spinner />
          ) : invitableFriends.length === 0 ? (
            <EmptyState
              icon="friends"
              title="Personne à ajouter"
              hint="Tous tes amis participent déjà — ou tu n'as pas encore d'amis. Ajoute-en depuis « Amis & sondages », ou partage le lien."
            />
          ) : (
            <div className="col gap-2">
              {invitableFriends.map((f) => (
                <div key={f.id} className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div className="row gap-2" style={{ minWidth: 0, alignItems: "center" }}>
                    {f.user.avatar_url ? (
                      <img src={f.user.avatar_url} alt="" loading="lazy" decoding="async" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
                    ) : (
                      <span style={{ width: 34, height: 34, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: "var(--surface-2)", color: "var(--accent-ink)", fontWeight: 700 }}>
                        {(f.user.display_name || "?").trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ display: "block" }}>{f.user.display_name}</strong>
                      {f.user.handle && <span className="muted small">@{f.user.handle}</span>}
                    </div>
                  </div>
                  <button
                    className="btn btn-soft btn-sm"
                    onClick={() => addFriendParticipant.mutate(f)}
                    disabled={addFriendParticipant.isPending}
                  >
                    <Icon name="plus" size={14} /> Ajouter
                  </button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {confirmNode}
    </div>
  );
}
