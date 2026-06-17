// Cloche de notifications (en haut de l'app). Surface les invitations intra-app
// (demandes d'amis, invitations à un voyage / événement) et les événements à
// venir. Cliquer une notif l'écarte et ouvre l'élément concerné ; la petite
// croix l'écarte sans naviguer. Le flux est rafraîchi périodiquement.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Icon, type IconName } from "./Icon";
import type { AppNotification } from "@shared/types";

type NotifData = { notifications: AppNotification[] };

/** Libellé temporel court — gère le passé (« il y a 3 j ») et le futur
 *  (« demain », « dans 5 j ») pour les événements planifiés. */
function timeLabel(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 0) {
    const days = Math.round(-diff / 86_400_000);
    if (days <= 0) return "aujourd'hui";
    if (days === 1) return "demain";
    if (days < 14) return `dans ${days} j`;
    return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  }
  const min = Math.round(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.notifications(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const notifs = data?.notifications ?? [];
  const count = notifs.length;

  const dismiss = useMutation({
    mutationFn: (key: string) => api.dismissNotification(key),
    onMutate: async (key: string) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      const prev = qc.getQueryData<NotifData>(["notifications"]);
      qc.setQueryData<NotifData>(["notifications"], (old) =>
        old ? { notifications: old.notifications.filter((n) => n.key !== key) } : old,
      );
      return { prev };
    },
    onError: (_e, _key, ctx) => {
      if (ctx?.prev) qc.setQueryData(["notifications"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const dismissAll = useMutation({
    mutationFn: () => api.dismissAllNotifications(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  // Fermer le panneau au clic en dehors / touche Échap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openNotif = (n: AppNotification) => {
    dismiss.mutate(n.key);
    setOpen(false);
    navigate(n.link);
  };

  return (
    <div className="notif" ref={ref}>
      <button
        className="btn btn-soft btn-icon notif-bell"
        aria-label={count > 0 ? `Notifications (${count})` : "Notifications"}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" size={18} />
        {count > 0 && <span className="notif-badge">{count > 9 ? "9+" : count}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="menu">
          <div className="notif-panel-head">
            <strong>Notifications</strong>
            {count > 0 && (
              <button className="notif-clear" onClick={() => dismissAll.mutate()} disabled={dismissAll.isPending}>
                Tout effacer
              </button>
            )}
          </div>

          {count === 0 ? (
            <div className="notif-empty">
              <Icon name="bell" size={26} strokeWidth={1.5} />
              <p className="muted small" style={{ margin: 0 }}>Tu es à jour ✨</p>
            </div>
          ) : (
            <ul className="notif-list">
              {notifs.map((n) => (
                <li
                  key={n.key}
                  className="notif-item"
                  role="menuitem"
                  tabIndex={0}
                  onClick={() => openNotif(n)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openNotif(n)}
                >
                  <span className="notif-ic">
                    {n.actor?.avatar_url ? (
                      <img src={n.actor.avatar_url} alt="" />
                    ) : (
                      <Icon name={n.icon as IconName} size={17} />
                    )}
                  </span>
                  <div className="notif-text">
                    <div className="notif-title">{n.title}</div>
                    {n.body && <div className="notif-sub muted small">{n.body}</div>}
                    <div className="notif-time muted">{timeLabel(n.created_at)}</div>
                  </div>
                  <button
                    className="notif-x"
                    aria-label="Ignorer cette notification"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss.mutate(n.key);
                    }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
