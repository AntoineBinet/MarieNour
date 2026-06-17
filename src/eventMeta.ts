// Métadonnées partagées de la section « Événements » (labels FR, icônes,
// helpers de date) — réutilisées par la liste, la fiche détaillée et le widget.
import type { IconName } from "./components/Icon";
import type { BringCategory, EventItemKind, EventKind, EventStatus, Rsvp } from "@shared/types";

export const EVENT_KINDS: { value: EventKind; label: string; icon: IconName }[] = [
  { value: "weekend", label: "Week-end", icon: "tent" },
  { value: "evg", label: "EVG", icon: "rocket" },
  { value: "evjf", label: "EVJF", icon: "flower" },
  { value: "party", label: "Soirée", icon: "confetti" },
  { value: "birthday", label: "Anniversaire", icon: "cake" },
  { value: "dinner", label: "Dîner", icon: "fork" },
  { value: "aperitif", label: "Apéro", icon: "glass" },
  { value: "wedding", label: "Mariage", icon: "heart" },
  { value: "trip", label: "Voyage", icon: "trips" },
  { value: "other", label: "Autre", icon: "calendar" },
];
export const EVENT_KIND_MAP = Object.fromEntries(EVENT_KINDS.map((k) => [k.value, k])) as Record<
  EventKind,
  (typeof EVENT_KINDS)[number]
>;

export const STATUS_META: Record<EventStatus, { label: string; chip: string }> = {
  planning: { label: "En préparation", chip: "chip" },
  confirmed: { label: "Confirmé", chip: "chip chip-accent" },
  cancelled: { label: "Annulé", chip: "chip" },
  done: { label: "Terminé", chip: "chip" },
};

export const RSVP_META: Record<Rsvp, { label: string; short: string; icon: IconName }> = {
  pending: { label: "En attente", short: "?", icon: "clock" },
  yes: { label: "Je viens", short: "Oui", icon: "check" },
  maybe: { label: "Peut-être", short: "Peut-être", icon: "info" },
  no: { label: "Je ne viens pas", short: "Non", icon: "close" },
};

export const ITEM_KIND_META: Record<EventItemKind, { label: string; icon: IconName }> = {
  activity: { label: "Activité", icon: "compass" },
  food: { label: "Repas", icon: "fork" },
  transport: { label: "Transport", icon: "car" },
  break: { label: "Pause", icon: "clock" },
  other: { label: "Autre", icon: "sparkle" },
};

export const BRING_CAT_META: Record<BringCategory, { label: string; icon: IconName }> = {
  food: { label: "Nourriture", icon: "fork" },
  drink: { label: "Boisson", icon: "glass" },
  material: { label: "Matériel", icon: "luggage" },
  other: { label: "Autre", icon: "gift" },
};

/* ── Helpers de date ───────────────────────────────────────────────────── */
export function formatDateRange(start: string | null, end: string | null): string | null {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  if (start && end && start !== end) {
    return `${new Date(start).toLocaleDateString("fr-FR", opts)} → ${new Date(end).toLocaleDateString("fr-FR", opts)}`;
  }
  if (start) return new Date(start).toLocaleDateString("fr-FR", opts);
  if (end) return new Date(end).toLocaleDateString("fr-FR", opts);
  return null;
}

export function formatDayLong(day: string): string {
  const d = new Date(day);
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  return diff;
}

/** Un événement est-il passé ? (date fixée et antérieure à aujourd'hui) */
export function isPast(startDate: string | null): boolean {
  if (!startDate) return false;
  const d = daysUntil(startDate);
  return d != null && d < 0;
}
