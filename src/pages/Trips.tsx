import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm } from "../ui";
import { Icon, type IconName } from "../components/Icon";
import type { Trip, TripKind, Visibility } from "@shared/types";

const VIS_LABEL: Record<Visibility, string> = {
  private: "Privé",
  friends: "Amis",
  public: "Public",
};

const TRIP_KINDS: { value: TripKind; label: string; icon: IconName }[] = [
  { value: "trip", label: "Voyage", icon: "trips" },
  { value: "roadtrip", label: "Road trip", icon: "car" },
  { value: "weekend", label: "Week-end", icon: "tent" },
  { value: "solo", label: "En solo", icon: "compass" },
];
const TRIP_KIND_MAP = Object.fromEntries(TRIP_KINDS.map((k) => [k.value, k])) as Record<TripKind, (typeof TRIP_KINDS)[number]>;

function formatDateRange(start: string | null, end: string | null): string | null {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (start && end) {
    return `${new Date(start).toLocaleDateString("fr-FR", opts)} → ${new Date(end).toLocaleDateString("fr-FR", opts)}`;
  }
  if (start) return new Date(start).toLocaleDateString("fr-FR", opts);
  if (end) return new Date(end).toLocaleDateString("fr-FR", opts);
  return null;
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  return diff > 0 ? diff : null;
}

interface TripForm {
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget: string;
  currency: string;
  cover_url: string;
  visibility: Visibility;
  kind: TripKind;
}

const EMPTY_FORM: TripForm = {
  title: "",
  destination: "",
  start_date: "",
  end_date: "",
  budget: "",
  currency: "EUR",
  cover_url: "",
  visibility: "private",
  kind: "trip",
};

/* ── Badge « créateur » d'un voyage partagé (mis en avant) ───────────────── */
function OwnerBadge({ owner }: { owner: NonNullable<Trip["owner"]> }) {
  const initial = (owner.display_name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className="row gap-2"
      style={{
        alignItems: "center",
        alignSelf: "flex-start",
        background: "var(--accent-soft)",
        color: "var(--accent-ink)",
        borderRadius: 999,
        padding: "0.2rem 0.7rem 0.2rem 0.2rem",
      }}
    >
      <span
        style={{
          width: 24, height: 24, borderRadius: "50%", overflow: "hidden", flex: "none",
          display: "grid", placeItems: "center", background: "var(--accent)", color: "#fff",
          fontSize: "0.72rem", fontWeight: 700,
        }}
      >
        {owner.avatar_url ? (
          <img src={owner.avatar_url} alt="" style={{ width: 24, height: 24, objectFit: "cover" }} />
        ) : (
          initial
        )}
      </span>
      <span className="small" style={{ fontWeight: 600 }}>Partagé par {owner.display_name}</span>
    </div>
  );
}

export default function Trips() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { confirm, confirmNode } = useConfirm();

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<TripForm>(EMPTY_FORM);

  const { data, isLoading } = useQuery({ queryKey: ["trips"], queryFn: () => api.trips() });
  const trips = data?.trips ?? [];

  const create = useMutation({
    mutationFn: (b: Partial<Trip>) => api.createTrip(b),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.push("Voyage créé");
      setCreating(false);
      setForm(EMPTY_FORM);
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTrip(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.push("Voyage supprimé");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.push("Le titre est requis", true);
      return;
    }
    create.mutate({
      title: form.title.trim(),
      destination: form.destination.trim() || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      budget: form.budget ? Number(form.budget) : null,
      currency: form.currency.trim() || "EUR",
      cover_url: form.cover_url.trim() || null,
      visibility: form.visibility,
      kind: form.kind,
    });
  };

  const askDelete = async (e: React.MouseEvent, trip: Trip) => {
    e.stopPropagation();
    if (await confirm(`Supprimer le voyage « ${trip.title} » ?`)) remove.mutate(trip.id);
  };

  const owned = trips.filter((t) => t.is_owner !== false);
  const shared = trips.filter((t) => t.is_owner === false);

  const renderCard = (trip: Trip) => {
    const countdown = daysUntil(trip.start_date);
    const range = formatDateRange(trip.start_date, trip.end_date);
    const isShared = trip.is_owner === false;
    return (
      <div
        key={trip.id}
        className="card card-pad-sm"
        style={{ cursor: "pointer", padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
        onClick={() => navigate(`/voyages/${trip.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && navigate(`/voyages/${trip.id}`)}
      >
        {trip.cover_url ? (
          <img
            src={trip.cover_url}
            alt={trip.title}
            style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: "var(--radius) var(--radius) 0 0" }}
          />
        ) : (
          <div
            style={{
              height: 140,
              display: "grid",
              placeItems: "center",
              color: "#fff",
              background: "linear-gradient(135deg, var(--accent-soft), var(--sky))",
              borderRadius: "var(--radius) var(--radius) 0 0",
            }}
          >
            <Icon name={TRIP_KIND_MAP[trip.kind]?.icon ?? "trips"} size={48} strokeWidth={1.5} />
          </div>
        )}

        <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: 1 }}>
          <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <h3 style={{ flex: 1 }}>{trip.title}</h3>
            <span className="chip">{VIS_LABEL[trip.visibility]}</span>
          </div>

          {isShared && trip.owner && <OwnerBadge owner={trip.owner} />}

          <span className="tag-pill" style={{ alignSelf: "flex-start" }}>
            <Icon name={TRIP_KIND_MAP[trip.kind]?.icon ?? "trips"} size={13} /> {TRIP_KIND_MAP[trip.kind]?.label}
          </span>
          {trip.destination && <p className="muted small row gap-2"><Icon name="map" size={13} /> {trip.destination}</p>}
          {range && <p className="small">{range}</p>}

          <div className="row wrap gap-2" style={{ marginTop: "auto", paddingTop: "var(--space-2)" }}>
            {countdown != null && (
              <span className="chip chip-accent">dans {countdown} {countdown > 1 ? "jours" : "jour"}</span>
            )}
            <span className="spacer" />
            {!isShared && (
              <button
                className="btn btn-icon btn-danger btn-sm"
                onClick={(e) => askDelete(e, trip)}
                aria-label="Supprimer"
              >
                <Icon name="trash" size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Évasions</p>
          <h1>Voyages</h1>
          <p className="muted">Voyage, road trip ou week-end — en solo ou en groupe, jusqu'au moindre budget.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> Nouveau voyage</button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : trips.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="luggage"
            title="Aucun voyage pour l'instant"
            hint="Crée ton premier voyage pour commencer à planifier ton itinéraire."
            action={<button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="plus" size={15} /> Nouveau voyage</button>}
          />
        </div>
      ) : (
        <div className="col gap-5">
          {owned.length > 0 && (
            <section>
              {shared.length > 0 && (
                <div className="panel-head"><h2 className="row gap-2"><Icon name="trips" size={18} /> Mes voyages</h2></div>
              )}
              <div className="grid-cards">{owned.map(renderCard)}</div>
            </section>
          )}

          {shared.length > 0 && (
            <section>
              <div className="panel-head">
                <h2 className="row gap-2"><Icon name="users" size={18} /> Partagé avec moi <span className="chip">{shared.length}</span></h2>
              </div>
              <div className="grid-cards">{shared.map(renderCard)}</div>
            </section>
          )}
        </div>
      )}

      {creating && (
        <Modal
          title="Nouveau voyage"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn btn-soft" onClick={() => setCreating(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={submit} disabled={create.isPending}>
                {create.isPending ? "Création…" : "Créer"}
              </button>
            </>
          }
        >
          <form onSubmit={submit}>
            <Field label="Titre">
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Week-end à Lisbonne"
                autoFocus
              />
            </Field>
            <Field label="Type de séjour">
              <div className="row gap-2 wrap">
                {TRIP_KINDS.map((k) => (
                  <button
                    type="button"
                    key={k.value}
                    className={`btn btn-sm ${form.kind === k.value ? "btn-primary" : "btn-soft"}`}
                    onClick={() => setForm({ ...form, kind: k.value })}
                  >
                    <Icon name={k.icon} size={15} /> {k.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Destination">
              <input
                className="input"
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                placeholder="Lisbonne, Portugal"
              />
            </Field>
            <div className="row gap-3 wrap">
              <div className="grow">
                <Field label="Date de début">
                  <input
                    type="date"
                    className="input"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grow">
                <Field label="Date de fin">
                  <input
                    type="date"
                    className="input"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <div className="row gap-3 wrap">
              <div className="grow">
                <Field label="Budget">
                  <input
                    type="number"
                    className="input"
                    value={form.budget}
                    onChange={(e) => setForm({ ...form, budget: e.target.value })}
                    placeholder="800"
                    min="0"
                  />
                </Field>
              </div>
              <div style={{ width: 120 }}>
                <Field label="Devise">
                  <input
                    className="input"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    placeholder="EUR"
                  />
                </Field>
              </div>
            </div>
            <Field label="Image de couverture (URL)">
              <input
                className="input"
                value={form.cover_url}
                onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
                placeholder="https://…"
              />
            </Field>
            <Field label="Visibilité">
              <select
                className="select"
                value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value as Visibility })}
              >
                <option value="private">Privé</option>
                <option value="friends">Amis</option>
                <option value="public">Public</option>
              </select>
            </Field>
          </form>
        </Modal>
      )}

      {confirmNode}
    </div>
  );
}
