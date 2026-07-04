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
import {
  BRING_CAT_META,
  EVENT_KINDS,
  EVENT_KIND_MAP,
  ITEM_KIND_META,
  RSVP_META,
  STATUS_META,
  daysUntil,
  formatDateRange,
  formatDayLong,
} from "../eventMeta";
import type {
  BringCategory,
  DateVote,
  EventAgendaItem,
  EventDetail as EventDetailT,
  EventGuest,
  EventItemKind,
  EventKind,
  EventStatus,
  Rsvp,
  Visibility,
} from "@shared/types";

const RSVP_ORDER: Rsvp[] = ["yes", "maybe", "no", "pending"];
const IDEAS = "__ideas__";

type Tab = "overview" | "guests" | "dates" | "agenda" | "tasks" | "bring";

/* ── Pastille invité ─────────────────────────────────────────────────────── */
function GuestAvatar({ g, size = 26 }: { g: EventGuest; size?: number }) {
  const initial = (g.name || "?").trim().charAt(0).toUpperCase();
  return (
    <span
      title={g.name}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: g.user_id ? "var(--accent-soft)" : "var(--border-strong)",
        color: "#fff",
        fontSize: size * 0.4,
        fontWeight: 700,
        flex: "none",
      }}
    >
      {g.avatar_url ? <img src={g.avatar_url} alt="" loading="lazy" decoding="async" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} /> : initial}
    </span>
  );
}

export default function EventDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { confirm, confirmNode } = useConfirm();

  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["event", id], queryFn: () => api.event(id), enabled: !!id });
  const ev = data?.event;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["event", id] });
  // Wrapper compact : toute mutation ré-invalide la fiche et signale les erreurs.
  function useM<TArgs = void>(fn: (a: TArgs) => Promise<unknown>, msg?: string) {
    return useMutation({
      mutationFn: fn,
      onSuccess: () => {
        invalidate();
        if (msg) toast.push(msg);
      },
      onError: (e: any) => toast.push(e.message || "Erreur", true),
    });
  }

  const rsvpM = useM<{ rsvp: Rsvp; plus_ones: number }>((b) => api.rsvpEvent(id, b));
  const addGuest = useM<{ name: string }>((b) => api.addEventGuest(id, b), "Invité ajouté");
  const updateGuest = useM<{ gid: string; b: Partial<EventGuest> }>(({ gid, b }) => api.updateEventGuest(id, gid, b));
  const removeGuest = useM<string>((gid) => api.removeEventGuest(id, gid), "Invité retiré");
  const addDate = useM<{ day_date: string; start_time?: string; end_time?: string }>((b) => api.addEventDate(id, b), "Date proposée");
  const removeDate = useM<string>((oid) => api.removeEventDate(id, oid));
  const voteDate = useM<{ oid: string; vote: DateVote }>(({ oid, vote }) => api.voteEventDate(id, oid, vote));
  const decideDate = useM<string>((oid) => api.decideEventDate(id, oid), "Date fixée");
  const addTask = useM<{ title: string; assignee_id?: string }>((b) => api.addEventTask(id, b), "Tâche ajoutée");
  const updateTask = useM<{ tid: string; b: Partial<{ done: boolean; assignee_id: string | null }> }>(({ tid, b }) => api.updateEventTask(id, tid, b));
  const removeTask = useM<string>((tid) => api.removeEventTask(id, tid));
  const addItem = useM<Partial<EventAgendaItem>>((b) => api.addEventItem(id, b), "Étape ajoutée");
  const removeItem = useM<string>((iid) => api.removeEventItem(id, iid));
  const addBring = useM<{ title: string; category: BringCategory; qty_needed: number; claim: boolean }>((b) => api.addEventBring(id, b), "Ajouté à la liste");
  const claimBring = useM<string>((bid) => api.claimEventBring(id, bid));
  const removeBring = useM<string>((bid) => api.removeEventBring(id, bid));
  const createGroup = useM<void>(
    () => api.createExpenseGroup({ title: ev?.title || "Événement", event_id: id, members: (ev?.guests ?? []).filter((g) => !g.is_me).map((g) => g.name) }),
    "Tricount créé",
  );

  const updateEvent = useMutation({
    mutationFn: (b: Partial<EventDetailT>) => api.updateEvent(id, b),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.push("Événement mis à jour");
      setEditing(false);
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  const deleteEvent = useMutation({
    mutationFn: () => api.deleteEvent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      toast.push("Événement supprimé");
      navigate("/evenements");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  if (isLoading) return <Spinner />;
  if (!ev) {
    return (
      <div>
        <Link to="/evenements" className="small row gap-2">
          <Icon name="arrowLeft" size={15} /> Événements
        </Link>
        <div className="card" style={{ marginTop: "var(--space-4)" }}>
          <EmptyState icon="confetti" title="Événement introuvable" hint="Il n'existe pas, a été supprimé ou ne t'est pas accessible." action={<Link className="btn btn-primary" to="/evenements">Retour</Link>} />
        </div>
      </div>
    );
  }

  const meta = EVENT_KIND_MAP[ev.kind];
  const canEdit = ev.is_host;
  const myGuest = ev.guests.find((g) => g.is_me) ?? null;
  const range = ev.date_decided || ev.start_date ? formatDateRange(ev.start_date, ev.end_date) : null;
  const countdown = daysUntil(ev.start_date);
  const guestName = (gid: string | null) => (gid ? ev.guests.find((g) => g.id === gid)?.name ?? null : null);

  const rsvpCounts = RSVP_ORDER.map((r) => ({ key: r, list: ev.guests.filter((g) => g.rsvp === r) }));

  const TABS: { key: Tab; label: string; icon: IconName; badge?: number }[] = [
    { key: "overview", label: "Aperçu", icon: "info" },
    { key: "guests", label: "Invités", icon: "users", badge: ev.guests.length },
    { key: "dates", label: "Dates", icon: "calendar", badge: ev.date_options.length || undefined },
    { key: "agenda", label: "Programme", icon: "compass", badge: ev.agenda.length || undefined },
    { key: "tasks", label: "Tâches", icon: "check", badge: ev.tasks.length || undefined },
    { key: "bring", label: "À apporter", icon: "gift", badge: ev.bring.length || undefined },
  ];

  return (
    <div>
      <Link to="/evenements" className="small row gap-2">
        <Icon name="arrowLeft" size={15} /> Événements
      </Link>

      {ev.cover_url && (
        <img src={ev.cover_url} alt={ev.title} decoding="async" style={{ width: "100%", height: 200, objectFit: "cover", borderRadius: "var(--radius)", marginTop: "var(--space-3)" }} />
      )}

      <div className="page-head row wrap" style={{ justifyContent: "space-between", marginTop: "var(--space-4)" }}>
        <div>
          <p className="eyebrow">{meta?.label ?? "Événement"}</p>
          <h1>{ev.title}</h1>
          <div style={{ marginTop: "var(--space-2)" }}>
            <VisibilityChip visibility={ev.visibility} sharedWith={ev.shared_with} />
          </div>
          <div className="row wrap gap-3" style={{ marginTop: "var(--space-2)" }}>
            <span className="tag-pill">
              <Icon name={meta?.icon ?? "confetti"} size={13} /> {meta?.label}
            </span>
            {ev.status !== "planning" && <span className={STATUS_META[ev.status].chip}>{STATUS_META[ev.status].label}</span>}
            {range ? (
              <span className="muted row gap-2">
                <Icon name="calendar" size={14} /> {range}
                {ev.start_time ? ` · ${ev.start_time}` : ""}
              </span>
            ) : (
              <span className="muted row gap-2">
                <Icon name="calendar" size={14} /> Date à définir
              </span>
            )}
            {ev.location && (
              <span className="muted row gap-2">
                <Icon name="pin" size={14} /> {ev.location}
              </span>
            )}
            {countdown != null && countdown >= 0 && ev.date_decided && <span className="chip chip-accent">{countdown === 0 ? "Aujourd'hui !" : `dans ${countdown} j`}</span>}
          </div>
        </div>
        {canEdit && (
          <div className="row gap-2">
            <button className="btn btn-soft" onClick={() => setEditing(true)}>
              <Icon name="edit" size={15} /> Éditer
            </button>
            <button className="btn btn-danger" onClick={async () => (await confirm(`Supprimer « ${ev.title} » ?`)) && deleteEvent.mutate()}>
              <Icon name="trash" size={15} /> Supprimer
            </button>
          </div>
        )}
      </div>

      {/* ── Ma réponse (RSVP) ───────────────────────────────────────────── */}
      <RsvpBar ev={ev} myGuest={myGuest} onRsvp={(rsvp, plus_ones) => rsvpM.mutate({ rsvp, plus_ones })} pending={rsvpM.isPending} />

      {/* ── Onglets ─────────────────────────────────────────────────────── */}
      <div className="seg seg-scroll" style={{ margin: "var(--space-5) 0" }}>
        {TABS.map((t) => (
          <button key={t.key} className={`seg-item${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            <Icon name={t.icon} size={14} /> {t.label}
            {t.badge ? <span className="seg-badge">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* ════════════════ APERÇU ════════════════ */}
      {tab === "overview" && (
        <div className="col gap-4">
          {ev.description && <div className="card card-pad-sm" style={{ whiteSpace: "pre-wrap" }}>{ev.description}</div>}

          <div className="grid-cards">
            <Fact icon="users" label="Réponses">
              <strong style={{ fontSize: "1.4rem", color: "var(--accent-ink)" }}>{ev.going_count}</strong> attendus
              {ev.capacity ? ` / ${ev.capacity}` : ""}
            </Fact>
            {ev.budget != null && (
              <Fact icon="wallet" label="Budget">
                <strong style={{ fontSize: "1.4rem" }}>{ev.budget}</strong> {ev.currency}
              </Fact>
            )}
            {ev.rsvp_deadline && (
              <Fact icon="clock" label="Réponse avant le">
                {new Date(ev.rsvp_deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              </Fact>
            )}
            {ev.address && (
              <Fact icon="map" label="Adresse">
                {ev.address}
              </Fact>
            )}
          </div>

          {/* Récap RSVP avec avatars */}
          <div className="card card-pad-sm">
            <h3 className="row gap-2" style={{ marginBottom: "var(--space-3)" }}>
              <Icon name="users" size={17} /> Qui vient ?
            </h3>
            <div className="col gap-3">
              {rsvpCounts.map(({ key, list }) => (
                <div key={key} className="row gap-3 wrap">
                  <span className="chip" style={{ minWidth: 110 }}>
                    <Icon name={RSVP_META[key].icon} size={13} /> {RSVP_META[key].label} · {list.length}
                  </span>
                  <div className="row gap-2 wrap">
                    {list.map((g) => (
                      <span key={g.id} className="row gap-2" style={{ background: "var(--surface-2)", borderRadius: 999, padding: "2px 10px 2px 2px" }}>
                        <GuestAvatar g={g} size={22} />
                        <span className="small">
                          {g.name}
                          {g.plus_ones > 0 ? ` +${g.plus_ones}` : ""}
                        </span>
                      </span>
                    ))}
                    {list.length === 0 && <span className="muted small">—</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dépenses partagées */}
          <div className="card card-pad-sm row wrap gap-2" style={{ justifyContent: "space-between" }}>
            <div className="row gap-2">
              <Icon name="expenses" size={18} />
              <div>
                <strong>Dépenses partagées</strong>
                <p className="muted small">Partage les frais de l'événement façon Tricount.</p>
              </div>
            </div>
            {ev.expense_group_id ? (
              <Link className="btn btn-soft btn-sm" to="/depenses">
                <Icon name="expenses" size={15} /> Voir le Tricount
              </Link>
            ) : canEdit ? (
              <button className="btn btn-soft btn-sm" onClick={() => createGroup.mutate()} disabled={createGroup.isPending}>
                <Icon name="plus" size={15} /> {createGroup.isPending ? "Création…" : "Créer un Tricount"}
              </button>
            ) : null}
          </div>

          <CommentsWall id={id} />
        </div>
      )}

      {/* ════════════════ INVITÉS ════════════════ */}
      {tab === "guests" && (
        <div className="col gap-4">
          <div className="card card-pad-sm">
            <div className="panel-head">
              <h3 className="row gap-2">
                <Icon name="users" size={17} /> Liste des invités <span className="chip">{ev.guests.length}</span>
              </h3>
              {canEdit && (
                <div className="row gap-2">
                  <InviteLink kind="event" targetId={id} variant="sm">Lien</InviteLink>
                  <InviteQr kind="event" targetId={id} variant="sm">QR</InviteQr>
                </div>
              )}
            </div>

            <div className="col gap-2">
              {ev.guests.map((g) => (
                <div key={g.id} className="li-row">
                  <GuestAvatar g={g} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row wrap gap-2">
                      <strong>
                        {g.name}
                        {g.is_me ? " (toi)" : ""}
                      </strong>
                      {g.role === "owner" && <span className="badge">Orga</span>}
                      {g.role === "cohost" && <span className="badge">Co-hôte</span>}
                      {!g.user_id && <span className="badge">Hors-app</span>}
                      {g.plus_ones > 0 && <span className="chip small">+{g.plus_ones}</span>}
                    </div>
                    {g.note && <p className="muted small" style={{ marginTop: 2 }}>{g.note}</p>}
                  </div>
                  <span className="chip" title="Réponse">
                    <Icon name={RSVP_META[g.rsvp].icon} size={12} /> {RSVP_META[g.rsvp].short}
                  </span>
                  {canEdit && g.role !== "owner" && (
                    <>
                      <button
                        className="btn btn-soft btn-sm"
                        title={g.role === "cohost" ? "Repasser invité" : "Promouvoir co-hôte"}
                        onClick={() => updateGuest.mutate({ gid: g.id, b: { role: g.role === "cohost" ? "guest" : "cohost" } })}
                      >
                        <Icon name="star" size={14} filled={g.role === "cohost"} />
                      </button>
                      <button className="btn btn-icon btn-danger btn-sm" onClick={() => removeGuest.mutate(g.id)} aria-label="Retirer">
                        <Icon name="trash" size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {canEdit && <AddGuestRow onAdd={(name) => addGuest.mutate({ name })} pending={addGuest.isPending} />}
          </div>
        </div>
      )}

      {/* ════════════════ DATES ════════════════ */}
      {tab === "dates" && (
        <div className="col gap-4">
          {ev.date_decided && (
            <div className="card card-pad-sm row gap-2" style={{ background: "color-mix(in srgb, var(--accent) 8%, transparent)" }}>
              <Icon name="check" size={18} />
              <span>
                Date fixée : <strong>{range}</strong>
                {ev.start_time ? ` à ${ev.start_time}` : ""}.
              </span>
              {canEdit && (
                <button className="btn btn-soft btn-sm" style={{ marginLeft: "auto" }} onClick={() => updateEvent.mutate({ date_decided: false })}>
                  Rouvrir le sondage
                </button>
              )}
            </div>
          )}

          <div className="card card-pad-sm">
            <div className="panel-head">
              <h3 className="row gap-2">
                <Icon name="calendar" size={17} /> Sondage de dates
              </h3>
              <span className="muted small">Chacun indique ses dispos</span>
            </div>

            {ev.date_options.length === 0 ? (
              <EmptyState icon="calendar" title="Aucune date proposée" hint={canEdit ? "Propose plusieurs créneaux, le groupe vote." : "L'organisateur n'a pas encore proposé de dates."} />
            ) : (
              <div className="col gap-3">
                {(() => {
                  const maxYes = Math.max(0, ...ev.date_options.map((o) => o.yes));
                  return ev.date_options.map((o) => {
                    const total = o.yes + o.maybe + o.no || 1;
                    const isWinner = o.yes > 0 && o.yes === maxYes;
                    return (
                      <div key={o.id} className="card card-pad-sm" style={{ border: isWinner ? "1px solid var(--accent)" : undefined }}>
                        <div className="row wrap gap-2" style={{ justifyContent: "space-between" }}>
                          <strong className="row gap-2">
                            <Icon name="calendar" size={15} /> {formatDayLong(o.day_date)}
                            {o.start_time ? <span className="muted small">· {o.start_time}{o.end_time ? `–${o.end_time}` : ""}</span> : null}
                            {isWinner && <span className="chip chip-accent">En tête</span>}
                          </strong>
                          {canEdit && (
                            <div className="row gap-2">
                              {!ev.date_decided && (
                                <button className="btn btn-primary btn-sm" onClick={() => decideDate.mutate(o.id)}>
                                  <Icon name="check" size={14} /> Choisir
                                </button>
                              )}
                              <button className="btn btn-icon btn-danger btn-sm" onClick={() => removeDate.mutate(o.id)} aria-label="Supprimer">
                                <Icon name="trash" size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Barre dispo */}
                        <div className="bar" style={{ margin: "var(--space-3) 0", display: "flex" }}>
                          <span style={{ width: `${(o.yes / total) * 100}%`, background: "var(--ok)" }} />
                          <span style={{ width: `${(o.maybe / total) * 100}%`, background: "var(--warn)" }} />
                          <span style={{ width: `${(o.no / total) * 100}%`, background: "var(--danger)" }} />
                        </div>
                        <div className="row wrap gap-2" style={{ justifyContent: "space-between" }}>
                          <span className="muted small">
                            {o.yes} dispo · {o.maybe} si besoin · {o.no} non
                          </span>
                          <div className="row gap-2">
                            {(["yes", "maybe", "no"] as DateVote[]).map((v) => (
                              <button
                                key={v}
                                className={`btn btn-sm ${o.my_vote === v ? "btn-primary" : "btn-soft"}`}
                                onClick={() => voteDate.mutate({ oid: o.id, vote: v })}
                              >
                                <Icon name={RSVP_META[v].icon} size={13} /> {RSVP_META[v].short}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {canEdit && <AddDateRow onAdd={(b) => addDate.mutate(b)} pending={addDate.isPending} />}
          </div>
        </div>
      )}

      {/* ════════════════ PROGRAMME ════════════════ */}
      {tab === "agenda" && <AgendaTab ev={ev} canEdit={canEdit} onAdd={() => setAddingItem(true)} onRemove={(iid) => removeItem.mutate(iid)} />}

      {/* ════════════════ TÂCHES ════════════════ */}
      {tab === "tasks" && (
        <div className="card card-pad-sm">
          <div className="panel-head">
            <h3 className="row gap-2">
              <Icon name="check" size={17} /> Tâches à préparer
            </h3>
            {ev.tasks.length > 0 && (
              <span className="muted small">
                {ev.tasks.filter((t) => t.done).length}/{ev.tasks.length} faites
              </span>
            )}
          </div>
          {ev.tasks.length === 0 ? (
            <EmptyState icon="lists" title="Aucune tâche" hint={canEdit ? "Répartis ce qu'il y a à faire (réserver, acheter, prévenir…)." : "Rien à faire pour l'instant."} />
          ) : (
            <div className="col gap-1">
              {ev.tasks.map((t) => {
                const assignee = guestName(t.assignee_id);
                const canToggle = canEdit || (myGuest && t.assignee_id === myGuest.id);
                return (
                  <div key={t.id} className="li-row li-row-wrap">
                    <span
                      className={`check${t.done ? " done" : ""}`}
                      role="checkbox"
                      aria-checked={t.done}
                      tabIndex={0}
                      style={{ cursor: canToggle ? "pointer" : "default", opacity: canToggle ? 1 : 0.6 }}
                      onClick={() => canToggle && updateTask.mutate({ tid: t.id, b: { done: !t.done } })}
                      onKeyDown={(e) => canToggle && (e.key === "Enter" || e.key === " ") && updateTask.mutate({ tid: t.id, b: { done: !t.done } })}
                    >
                      {t.done ? <Icon name="check" size={13} /> : ""}
                    </span>
                    <span className={`li-text grow${t.done ? " done" : ""}`} style={{ fontWeight: 600 }}>
                      {t.title}
                    </span>
                    <div className="row gap-2 li-row-end">
                      {t.due_date && (
                        <span className="chip small">
                          <Icon name="clock" size={12} /> {new Date(t.due_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </span>
                      )}
                      {canEdit ? (
                        <select
                          className="select"
                          style={{ maxWidth: 150 }}
                          value={t.assignee_id ?? ""}
                          onChange={(e) => updateTask.mutate({ tid: t.id, b: { assignee_id: e.target.value || null } })}
                        >
                          <option value="">Personne</option>
                          {ev.guests.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      ) : assignee ? (
                        <span className="chip small">{assignee}</span>
                      ) : null}
                      {canEdit && (
                        <button className="btn btn-icon btn-danger btn-sm" onClick={() => removeTask.mutate(t.id)} aria-label="Supprimer">
                          <Icon name="trash" size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {canEdit && <AddTaskRow guests={ev.guests} onAdd={(b) => addTask.mutate(b)} pending={addTask.isPending} />}
        </div>
      )}

      {/* ════════════════ À APPORTER ════════════════ */}
      {tab === "bring" && (
        <div className="card card-pad-sm">
          <div className="panel-head">
            <h3 className="row gap-2">
              <Icon name="gift" size={17} /> Qui apporte quoi
            </h3>
            <span className="muted small">{ev.bring.filter((b) => b.claimed_by).length}/{ev.bring.length} pris en charge</span>
          </div>
          {ev.bring.length === 0 ? (
            <EmptyState icon="gift" title="Liste vide" hint="Ajoute ce qu'il faut apporter — chacun peut cocher ce dont il se charge." />
          ) : (
            <div className="col gap-1">
              {ev.bring.map((b) => {
                const who = guestName(b.claimed_by);
                const mineClaimed = myGuest && b.claimed_by === myGuest.id;
                return (
                  <div key={b.id} className="li-row">
                    <span style={{ color: "var(--accent-ink)", display: "inline-flex" }}>
                      <Icon name={BRING_CAT_META[b.category].icon} size={17} />
                    </span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <strong>
                        {b.title}
                        {b.qty_needed > 1 ? <span className="muted small"> ×{b.qty_needed}</span> : null}
                      </strong>
                      {b.note && <p className="muted small">{b.note}</p>}
                    </div>
                    {who ? (
                      <span className="chip chip-accent small">
                        <Icon name="check" size={12} /> {who}
                      </span>
                    ) : (
                      <span className="muted small">Libre</span>
                    )}
                    {myGuest && (
                      <button className={`btn btn-sm ${mineClaimed ? "btn-primary" : "btn-soft"}`} onClick={() => claimBring.mutate(b.id)}>
                        {mineClaimed ? "Je m'en occupe" : "Je m'en charge"}
                      </button>
                    )}
                    {canEdit && (
                      <button className="btn btn-icon btn-danger btn-sm" onClick={() => removeBring.mutate(b.id)} aria-label="Supprimer">
                        <Icon name="trash" size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {(canEdit || myGuest) && <AddBringRow onAdd={(b) => addBring.mutate(b)} pending={addBring.isPending} />}
        </div>
      )}

      {/* ── Modale d'édition de l'événement ── */}
      {editing && <EditEventModal ev={ev} onClose={() => setEditing(false)} onSave={(b) => updateEvent.mutate(b)} pending={updateEvent.isPending} />}

      {/* ── Modale d'ajout d'étape de programme ── */}
      {addingItem && (
        <AddItemModal
          onClose={() => setAddingItem(false)}
          onSave={(b) => {
            addItem.mutate(b);
            setAddingItem(false);
          }}
          pending={addItem.isPending}
        />
      )}

      {confirmNode}
    </div>
  );
}

/* ── Sous-composants ──────────────────────────────────────────────────────── */

function Fact({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <div className="card card-pad-sm">
      <p className="muted small row gap-2" style={{ marginBottom: 4 }}>
        <Icon name={icon} size={14} /> {label}
      </p>
      <div>{children}</div>
    </div>
  );
}

function RsvpBar({
  ev,
  myGuest,
  onRsvp,
  pending,
}: {
  ev: EventDetailT;
  myGuest: EventGuest | null;
  onRsvp: (rsvp: Rsvp, plusOnes: number) => void;
  pending: boolean;
}) {
  const [plusOnes, setPlusOnes] = useState(myGuest?.plus_ones ?? 0);
  const current = myGuest?.rsvp ?? null;
  return (
    <div className="card card-pad-sm" style={{ marginTop: "var(--space-4)", background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}>
      <div className="row wrap gap-3" style={{ justifyContent: "space-between" }}>
        <div className="row gap-2">
          <Icon name="bell" size={18} />
          <strong>{current && current !== "pending" ? `Ta réponse : ${RSVP_META[current].label}` : "Viens-tu ?"}</strong>
        </div>
        <div className="row gap-2 wrap">
          {(["yes", "maybe", "no"] as Rsvp[]).map((r) => (
            <button key={r} className={`btn btn-sm ${current === r ? "btn-primary" : "btn-soft"}`} onClick={() => onRsvp(r, plusOnes)} disabled={pending}>
              <Icon name={RSVP_META[r].icon} size={14} /> {RSVP_META[r].short}
            </button>
          ))}
          <span className="row gap-1" title="Accompagnants (+1)">
            <button className="btn btn-soft btn-sm btn-icon" onClick={() => setPlusOnes((n) => Math.max(0, n - 1))} aria-label="Moins">
              <Icon name="close" size={12} />
            </button>
            <span className="chip">+{plusOnes}</span>
            <button className="btn btn-soft btn-sm btn-icon" onClick={() => setPlusOnes((n) => n + 1)} aria-label="Plus">
              <Icon name="plus" size={12} />
            </button>
          </span>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        {ev.going_count} personne{ev.going_count > 1 ? "s" : ""} attendue{ev.going_count > 1 ? "s" : ""}
        {ev.capacity ? ` sur ${ev.capacity} places` : ""}.
        {ev.rsvp_deadline ? ` Réponse souhaitée avant le ${new Date(ev.rsvp_deadline).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}.` : ""}
      </p>
    </div>
  );
}

function AddGuestRow({ onAdd, pending }: { onAdd: (name: string) => void; pending: boolean }) {
  const [name, setName] = useState("");
  return (
    <form
      className="row gap-2"
      style={{ marginTop: "var(--space-3)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) {
          onAdd(name.trim());
          setName("");
        }
      }}
    >
      <input className="input" style={{ maxWidth: 280 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ajouter un invité (même sans compte)…" autoCapitalize="words" autoComplete="off" enterKeyHint="done" />
      <button className="btn btn-soft btn-sm" type="submit" disabled={pending}>
        <Icon name="plus" size={15} /> Ajouter
      </button>
    </form>
  );
}

function AddDateRow({ onAdd, pending }: { onAdd: (b: { day_date: string; start_time?: string }) => void; pending: boolean }) {
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  return (
    <form
      className="row gap-2 wrap"
      style={{ marginTop: "var(--space-3)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (day) {
          onAdd({ day_date: day, start_time: time || undefined });
          setDay("");
          setTime("");
        }
      }}
    >
      <input type="date" className="input" style={{ maxWidth: 180 }} value={day} onChange={(e) => setDay(e.target.value)} />
      <input type="time" className="input" style={{ maxWidth: 130 }} value={time} onChange={(e) => setTime(e.target.value)} />
      <button className="btn btn-soft btn-sm" type="submit" disabled={pending}>
        <Icon name="plus" size={15} /> Proposer une date
      </button>
    </form>
  );
}

function AddTaskRow({ guests, onAdd, pending }: { guests: EventGuest[]; onAdd: (b: { title: string; assignee_id?: string }) => void; pending: boolean }) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  return (
    <form
      className="row gap-2 wrap"
      style={{ marginTop: "var(--space-3)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) {
          onAdd({ title: title.trim(), assignee_id: assignee || undefined });
          setTitle("");
          setAssignee("");
        }
      }}
    >
      <input className="input grow" style={{ minWidth: 180 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Réserver le resto, acheter le gâteau…" autoCapitalize="sentences" enterKeyHint="done" />
      <select className="select" style={{ width: "auto" }} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
        <option value="">Assigner à…</option>
        {guests.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <button className="btn btn-soft btn-sm" type="submit" disabled={pending}>
        <Icon name="plus" size={15} /> Ajouter
      </button>
    </form>
  );
}

function AddBringRow({ onAdd, pending }: { onAdd: (b: { title: string; category: BringCategory; qty_needed: number; claim: boolean }) => void; pending: boolean }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<BringCategory>("food");
  const [qty, setQty] = useState("1");
  const [claim, setClaim] = useState(false);
  return (
    <form
      className="row gap-2 wrap"
      style={{ marginTop: "var(--space-3)" }}
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) {
          onAdd({ title: title.trim(), category, qty_needed: Number(qty) || 1, claim });
          setTitle("");
          setQty("1");
          setClaim(false);
        }
      }}
    >
      <input className="input grow" style={{ minWidth: 160 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bouteille de vin, enceinte, dessert…" autoCapitalize="sentences" enterKeyHint="done" />
      <select className="select" style={{ width: "auto" }} value={category} onChange={(e) => setCategory(e.target.value as BringCategory)}>
        {(Object.keys(BRING_CAT_META) as BringCategory[]).map((c) => (
          <option key={c} value={c}>
            {BRING_CAT_META[c].label}
          </option>
        ))}
      </select>
      <input type="number" className="input" style={{ width: 80 }} value={qty} min="1" inputMode="numeric" onChange={(e) => setQty(e.target.value)} title="Quantité" />
      <label className="row gap-1 small muted tap-check">
        <input type="checkbox" checked={claim} onChange={(e) => setClaim(e.target.checked)} /> je l'apporte
      </label>
      <button className="btn btn-soft btn-sm" type="submit" disabled={pending}>
        <Icon name="plus" size={15} /> Ajouter
      </button>
    </form>
  );
}

function AgendaTab({
  ev,
  canEdit,
  onAdd,
  onRemove,
}: {
  ev: EventDetailT;
  canEdit: boolean;
  onAdd: () => void;
  onRemove: (iid: string) => void;
}) {
  const groups = new Map<string, EventAgendaItem[]>();
  for (const it of ev.agenda) {
    const key = it.day_date ?? IDEAS;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const dayKeys = [...groups.keys()].filter((k) => k !== IDEAS).sort();
  const ordered = [...dayKeys, ...(groups.has(IDEAS) ? [IDEAS] : [])];

  return (
    <div className="col gap-4">
      <div className="panel-head">
        <h2>Programme</h2>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={onAdd}>
            <Icon name="plus" size={15} /> Ajouter une étape
          </button>
        )}
      </div>
      {ev.agenda.length === 0 ? (
        <div className="card">
          <EmptyState icon="compass" title="Programme vide" hint={canEdit ? "Construis le déroulé : activités, repas, transports, pauses…" : "L'organisateur n'a pas encore défini de programme."} />
        </div>
      ) : (
        ordered.map((key) => (
          <div key={key} className="card card-pad-sm">
            <h3 className="row gap-2" style={{ marginBottom: "var(--space-3)" }}>
              {key === IDEAS ? <><Icon name="lightbulb" size={16} /> Idées / à caser</> : formatDayLong(key)}
            </h3>
            {groups.get(key)!.map((it) => (
              <div key={it.id} className="li-row">
                <span style={{ color: "var(--accent-ink)", display: "inline-flex" }}>
                  <Icon name={ITEM_KIND_META[it.kind].icon} size={18} />
                </span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row wrap gap-2">
                    {it.time && <span className="badge">{it.time}</span>}
                    <span style={{ fontWeight: 600 }}>{it.title}</span>
                  </div>
                  {(it.location || it.notes) && (
                    <p className="muted small row gap-1" style={{ marginTop: 2 }}>
                      {it.location && <><Icon name="pin" size={13} /> {it.location}</>}
                      {it.location && it.notes ? " · " : ""}
                      {it.notes}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <button className="btn btn-icon btn-danger btn-sm" onClick={() => onRemove(it.id)} aria-label="Supprimer">
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function CommentsWall({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState("");
  const { data } = useQuery({ queryKey: ["comments", "event", id], queryFn: () => api.comments("event", id) });
  const comments = data?.comments ?? [];
  const add = useMutation({
    mutationFn: (text: string) => api.addComment("event", id, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", "event", id] });
      setBody("");
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });
  return (
    <div className="card card-pad-sm">
      <h3 className="row gap-2" style={{ marginBottom: "var(--space-3)" }}>
        <Icon name="chat" size={17} /> Discussion
      </h3>
      <div className="col gap-3" style={{ marginBottom: "var(--space-3)" }}>
        {comments.length === 0 && <p className="muted small">Pas encore de message. Lance la conversation !</p>}
        {comments.map((c) => (
          <div key={c.id} className="row gap-2" style={{ alignItems: "flex-start" }}>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--accent-soft)", color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, flex: "none" }}>
              {c.author.avatar_url ? <img src={c.author.avatar_url} alt="" loading="lazy" decoding="async" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} /> : (c.author.display_name || "?").charAt(0).toUpperCase()}
            </span>
            <div className="grow">
              <span className="small">
                <strong>{c.author.display_name}</strong>{" "}
                <span className="muted">{new Date(c.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </span>
              <p style={{ whiteSpace: "pre-wrap" }}>{c.body}</p>
            </div>
          </div>
        ))}
      </div>
      <form
        className="row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate(body.trim());
        }}
      >
        <input className="input grow" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Écrire un message…" autoCapitalize="sentences" enterKeyHint="send" />
        <button className="btn btn-primary btn-sm" type="submit" disabled={add.isPending || !body.trim()}>
          <Icon name="arrowRight" size={15} />
        </button>
      </form>
    </div>
  );
}

/* ── Modales ──────────────────────────────────────────────────────────────── */
function EditEventModal({ ev, onClose, onSave, pending }: { ev: EventDetailT; onClose: () => void; onSave: (b: Partial<EventDetailT>) => void; pending: boolean }) {
  const [f, setF] = useState({
    title: ev.title,
    kind: ev.kind as EventKind,
    status: ev.status as EventStatus,
    description: ev.description ?? "",
    location: ev.location ?? "",
    address: ev.address ?? "",
    start_date: ev.start_date ?? "",
    start_time: ev.start_time ?? "",
    end_date: ev.end_date ?? "",
    end_time: ev.end_time ?? "",
    cover_url: ev.cover_url ?? "",
    budget: ev.budget != null ? String(ev.budget) : "",
    currency: ev.currency || "EUR",
    capacity: ev.capacity != null ? String(ev.capacity) : "",
    rsvp_deadline: ev.rsvp_deadline ?? "",
    visibility: ev.visibility as Visibility,
  });
  const [sharedWith, setSharedWith] = useState<string[]>(ev.shared_with ?? []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    onSave({
      title: f.title.trim(),
      kind: f.kind,
      status: f.status,
      description: f.description.trim() || null,
      location: f.location.trim() || null,
      address: f.address.trim() || null,
      start_date: f.start_date || null,
      start_time: f.start_time || null,
      end_date: f.end_date || null,
      end_time: f.end_time || null,
      cover_url: f.cover_url.trim() || null,
      budget: f.budget ? Number(f.budget) : null,
      currency: f.currency.trim() || "EUR",
      capacity: f.capacity ? Number(f.capacity) : null,
      rsvp_deadline: f.rsvp_deadline || null,
      visibility: f.visibility,
      shared_with: sharedWith,
    });
  };
  return (
    <Modal
      title="Éditer l'événement"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label="Titre">
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoCapitalize="sentences" autoFocus />
        </Field>
        <Field label="Type">
          <div className="row gap-2 wrap">
            {EVENT_KINDS.map((k) => (
              <button type="button" key={k.value} className={`btn btn-sm ${f.kind === k.value ? "btn-primary" : "btn-soft"}`} onClick={() => setF({ ...f, kind: k.value })}>
                <Icon name={k.icon} size={15} /> {k.label}
              </button>
            ))}
          </div>
        </Field>
        <div className="row gap-3 wrap">
          <div className="grow">
            <Field label="Lieu">
              <input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} autoCapitalize="sentences" />
            </Field>
          </div>
          <div className="grow">
            <Field label="Adresse">
              <input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} autoCapitalize="sentences" />
            </Field>
          </div>
        </div>
        <div className="row gap-3 wrap">
          <div className="grow">
            <Field label="Début">
              <input type="date" className="input" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />
            </Field>
          </div>
          <div style={{ width: 120 }}>
            <Field label="Heure">
              <input type="time" className="input" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
            </Field>
          </div>
          <div className="grow">
            <Field label="Fin">
              <input type="date" className="input" value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} />
            </Field>
          </div>
          <div style={{ width: 120 }}>
            <Field label="Heure">
              <input type="time" className="input" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} />
            </Field>
          </div>
        </div>
        <div className="row gap-3 wrap">
          <div style={{ width: 130 }}>
            <Field label="Places (max)">
              <input type="number" className="input" value={f.capacity} min="0" inputMode="numeric" onChange={(e) => setF({ ...f, capacity: e.target.value })} />
            </Field>
          </div>
          <div className="grow">
            <Field label="Budget">
              <input type="number" className="input" value={f.budget} min="0" inputMode="numeric" onChange={(e) => setF({ ...f, budget: e.target.value })} />
            </Field>
          </div>
          <div style={{ width: 100 }}>
            <Field label="Devise">
              <input className="input" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} autoCapitalize="characters" autoComplete="off" spellCheck={false} />
            </Field>
          </div>
          <div className="grow">
            <Field label="Réponse avant le">
              <input type="date" className="input" value={f.rsvp_deadline} onChange={(e) => setF({ ...f, rsvp_deadline: e.target.value })} />
            </Field>
          </div>
        </div>
        <Field label="Image de couverture">
          <ImageField value={f.cover_url} onChange={(url) => setF({ ...f, cover_url: url })} />
        </Field>
        <Field label="Description">
          <textarea className="textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <div className="row gap-3 wrap">
          <div className="grow">
            <Field label="Statut">
              <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as EventStatus })}>
                <option value="planning">En préparation</option>
                <option value="confirmed">Confirmé</option>
                <option value="cancelled">Annulé</option>
                <option value="done">Terminé</option>
              </select>
            </Field>
          </div>
          <div className="grow">
            <Field label="Visibilité">
              <VisibilityField
                value={f.visibility}
                sharedWith={sharedWith}
                onChange={(v) => setF({ ...f, visibility: v })}
                onSharedWithChange={setSharedWith}
              />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function AddItemModal({ onClose, onSave, pending }: { onClose: () => void; onSave: (b: Partial<EventAgendaItem>) => void; pending: boolean }) {
  const [f, setF] = useState({ title: "", kind: "activity" as EventItemKind, day_date: "", time: "", location: "", notes: "" });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return;
    onSave({
      title: f.title.trim(),
      kind: f.kind,
      day_date: f.day_date || null,
      time: f.time || null,
      location: f.location.trim() || null,
      notes: f.notes.trim() || null,
    });
  };
  return (
    <Modal
      title="Ajouter une étape"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-soft" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={pending}>
            Ajouter
          </button>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label="Titre">
          <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Apéro, dîner, escape game…" autoCapitalize="sentences" autoFocus />
        </Field>
        <Field label="Type">
          <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as EventItemKind })}>
            {(Object.keys(ITEM_KIND_META) as EventItemKind[]).map((k) => (
              <option key={k} value={k}>
                {ITEM_KIND_META[k].label}
              </option>
            ))}
          </select>
        </Field>
        <div className="row gap-3 wrap">
          <div className="grow">
            <Field label="Jour (vide = à caser)">
              <input type="date" className="input" value={f.day_date} onChange={(e) => setF({ ...f, day_date: e.target.value })} />
            </Field>
          </div>
          <div style={{ width: 130 }}>
            <Field label="Heure">
              <input type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
            </Field>
          </div>
        </div>
        <Field label="Lieu">
          <input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} autoCapitalize="sentences" />
        </Field>
        <Field label="Notes">
          <textarea className="textarea" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}
