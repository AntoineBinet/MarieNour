import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { takeCompose } from "../compose";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm } from "../ui";
import { Icon } from "../components/Icon";
import {
  EVENT_KINDS,
  EVENT_KIND_MAP,
  RSVP_META,
  STATUS_META,
  daysUntil,
  formatDateRange,
  isPast,
} from "../eventMeta";
import type { EventKind, EventSummary, Visibility } from "@shared/types";

interface EventForm {
  title: string;
  kind: EventKind;
  start_date: string;
  start_time: string;
  location: string;
  capacity: string;
  budget: string;
  currency: string;
  cover_url: string;
  description: string;
  visibility: Visibility;
}

const EMPTY_FORM: EventForm = {
  title: "",
  kind: "party",
  start_date: "",
  start_time: "",
  location: "",
  capacity: "",
  budget: "",
  currency: "EUR",
  cover_url: "",
  description: "",
  visibility: "friends",
};

type FilterKey = "upcoming" | "past" | "all";

export default function Events() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { confirm, confirmNode } = useConfirm();

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [filter, setFilter] = useState<FilterKey>("upcoming");

  // Ouverture pré-remplie depuis une note convertie (« Planifier l'activité »).
  useEffect(() => {
    const c = takeCompose("event");
    if (!c) return;
    setForm((f) => ({ ...f, ...(c.prefill as Partial<EventForm>) }));
    setCreating(true);
  }, []);

  const { data, isLoading } = useQuery({ queryKey: ["events"], queryFn: () => api.events() });
  const events = data?.events ?? [];

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((e) => (filter === "past" ? isPast(e.start_date) : !isPast(e.start_date)));
  }, [events, filter]);

  const create = useMutation({
    mutationFn: (b: Partial<EventSummary>) => api.createEvent(b),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.push("Événement créé");
      setCreating(false);
      setForm(EMPTY_FORM);
      navigate(`/evenements/${res.id}`);
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.push("Événement supprimé");
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
      kind: form.kind,
      start_date: form.start_date || null,
      start_time: form.start_time || null,
      location: form.location.trim() || null,
      capacity: form.capacity ? Number(form.capacity) : null,
      budget: form.budget ? Number(form.budget) : null,
      currency: form.currency.trim() || "EUR",
      cover_url: form.cover_url.trim() || null,
      description: form.description.trim() || null,
      visibility: form.visibility,
    });
  };

  const askDelete = async (e: React.MouseEvent, ev: EventSummary) => {
    e.stopPropagation();
    if (await confirm(`Supprimer l'événement « ${ev.title} » ?`)) remove.mutate(ev.id);
  };

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "upcoming", label: "À venir" },
    { key: "past", label: "Passés" },
    { key: "all", label: "Tous" },
  ];

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Organiser</p>
          <h1>Événements</h1>
          <p className="muted">
            Week-end, EVG/EVJF, soirée, anniv… Trouve la date ensemble, gère les invitations (RSVP), les tâches et qui apporte quoi.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={16} /> Nouvel événement
        </button>
      </div>

      {events.length > 0 && (
        <div className="seg" style={{ marginBottom: "var(--space-5)" }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`seg-item${filter === f.key ? " active" : ""}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : events.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="confetti"
            title="Aucun événement pour l'instant"
            hint="Crée ton premier événement : propose des dates, invite tes amis et organise tout au même endroit."
            action={
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <Icon name="plus" size={15} /> Nouvel événement
              </button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon="calendar" title="Rien ici" hint="Aucun événement dans cette catégorie." />
        </div>
      ) : (
        <div className="grid-cards">
          {filtered.map((ev) => {
            const meta = EVENT_KIND_MAP[ev.kind];
            const countdown = daysUntil(ev.start_date);
            const range = ev.date_decided || ev.start_date ? formatDateRange(ev.start_date, ev.end_date) : null;
            const past = isPast(ev.start_date);
            return (
              <div
                key={ev.id}
                className="card"
                style={{ cursor: "pointer", padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", opacity: ev.status === "cancelled" ? 0.6 : 1 }}
                onClick={() => navigate(`/evenements/${ev.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && navigate(`/evenements/${ev.id}`)}
              >
                {ev.cover_url ? (
                  <img src={ev.cover_url} alt={ev.title} style={{ width: "100%", height: 140, objectFit: "cover" }} />
                ) : (
                  <div
                    style={{
                      height: 140,
                      display: "grid",
                      placeItems: "center",
                      color: "#fff",
                      background: "linear-gradient(135deg, var(--accent-soft), var(--lilac))",
                    }}
                  >
                    <Icon name={meta?.icon ?? "confetti"} size={48} strokeWidth={1.5} />
                  </div>
                )}

                <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)", flex: 1 }}>
                  <div className="row wrap" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <h3 style={{ flex: 1 }}>{ev.title}</h3>
                    {ev.is_host ? <span className="badge">Orga</span> : ev.my_rsvp ? <span className="chip">{RSVP_META[ev.my_rsvp].short}</span> : null}
                  </div>

                  <span className="tag-pill" style={{ alignSelf: "flex-start" }}>
                    <Icon name={meta?.icon ?? "confetti"} size={13} /> {meta?.label}
                  </span>
                  {ev.location && (
                    <p className="muted small row gap-2">
                      <Icon name="pin" size={13} /> {ev.location}
                    </p>
                  )}
                  {range ? (
                    <p className="small row gap-2">
                      <Icon name="calendar" size={13} /> {range}
                      {ev.start_time ? ` · ${ev.start_time}` : ""}
                    </p>
                  ) : (
                    <p className="small muted row gap-2">
                      <Icon name="calendar" size={13} /> Date à définir
                    </p>
                  )}

                  <div className="row wrap gap-2" style={{ marginTop: "auto", paddingTop: "var(--space-2)" }}>
                    {ev.status !== "planning" && <span className={STATUS_META[ev.status].chip}>{STATUS_META[ev.status].label}</span>}
                    {!past && countdown != null && countdown >= 0 && ev.status !== "cancelled" && (
                      <span className="chip chip-accent">{countdown === 0 ? "Aujourd'hui" : `dans ${countdown} j`}</span>
                    )}
                    {past && <span className="chip">Passé</span>}
                    <span className="chip">
                      <Icon name="users" size={12} /> {ev.going_count}
                      {ev.capacity ? `/${ev.capacity}` : ""}
                    </span>
                    <span className="spacer" />
                    {ev.is_host && (
                      <button className="btn btn-icon btn-danger btn-sm" onClick={(e) => askDelete(e, ev)} aria-label="Supprimer">
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <Modal
          title="Nouvel événement"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn btn-soft" onClick={() => setCreating(false)}>
                Annuler
              </button>
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
                placeholder="EVG de Thomas, Soirée de Noël…"
                autoFocus
              />
            </Field>
            <Field label="Type d'événement">
              <div className="row gap-2 wrap">
                {EVENT_KINDS.map((k) => (
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
            <div className="row gap-3 wrap">
              <div className="grow">
                <Field label="Date (laisser vide pour sonder le groupe)">
                  <input type="date" className="input" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </Field>
              </div>
              <div style={{ width: 130 }}>
                <Field label="Heure">
                  <input type="time" className="input" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
                </Field>
              </div>
            </div>
            <Field label="Lieu">
              <input
                className="input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Chez Marie, Le Perchoir…"
              />
            </Field>
            <div className="row gap-3 wrap">
              <div style={{ width: 130 }}>
                <Field label="Places (max)">
                  <input type="number" className="input" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} min="0" placeholder="∞" />
                </Field>
              </div>
              <div className="grow">
                <Field label="Budget">
                  <input type="number" className="input" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} min="0" placeholder="0" />
                </Field>
              </div>
              <div style={{ width: 100 }}>
                <Field label="Devise">
                  <input className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
                </Field>
              </div>
            </div>
            <Field label="Image de couverture (URL)">
              <input className="input" value={form.cover_url} onChange={(e) => setForm({ ...form, cover_url: e.target.value })} placeholder="https://…" />
            </Field>
            <Field label="Description">
              <textarea
                className="textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Le mot d'intro, le thème, le dress code…"
              />
            </Field>
            <Field label="Visibilité">
              <select className="select" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as Visibility })}>
                <option value="private">Privé (sur invitation)</option>
                <option value="friends">Amis (visible par mes amis)</option>
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
