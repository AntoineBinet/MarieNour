import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Modal, Spinner, EmptyState, Field, useToast, useConfirm } from "../ui";
import { useAuth } from "../auth";

/* ── Libellés FR des statistiques ────────────────────────────────────────── */
const STAT_LABELS: Record<string, string> = {
  users: "Utilisateurs",
  lists: "Listes",
  notes: "Notes",
  trips: "Voyages",
  recipes: "Recettes",
  boards: "Tableaux",
  inspirations: "Inspirations",
  media: "Photos",
  friendships: "Liens d'amitié",
  list_items: "Items de liste",
};

const STAT_EMOJI: Record<string, string> = {
  users: "🧑",
  lists: "📋",
  notes: "📝",
  trips: "✈️",
  recipes: "🍳",
  boards: "🧷",
  inspirations: "✨",
  media: "📷",
  friendships: "🫶",
  list_items: "✅",
};

interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  handle: string | null;
  role: "admin" | "member";
  created_at: number;
  notes?: number;
  recipes?: number;
  trips?: number;
}

function fmtDate(ts: number) {
  if (!ts) return "—";
  // les timestamps sont en secondes côté API
  const d = new Date(ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── Mise à jour de l'application (VM Node uniquement) ─────────────────────── */
function MaintenanceCard() {
  const toast = useToast();
  // startedAt de la mise à jour qu'on suit (null = aucune en cours côté UI).
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);

  const statusQ = useQuery({
    queryKey: ["admin-update-status"],
    queryFn: () => api.adminUpdateStatus(),
    refetchInterval: runStartedAt !== null ? 2000 : false,
    retry: false,
  });

  const status = statusQ.data?.status;
  const commit = statusQ.data?.current_commit;
  // 404 = endpoint absent (repli serverless ou dev sans serveur Node).
  const unsupported = statusQ.isError && (statusQ.error as { status?: number } | undefined)?.status === 404;

  // Détecte la fin de NOTRE run (même startedAt renvoyé par le POST) — robuste
  // au redémarrage : le statut persisté garde le même startedAt.
  useEffect(() => {
    if (runStartedAt === null || !status) return;
    if (status.startedAt !== runStartedAt) return;
    if (status.phase === "done") {
      setRunStartedAt(null);
      toast.push(status.upToDate ? "Déjà à jour ✓" : "Mise à jour appliquée 🎉");
    } else if (status.phase === "error") {
      setRunStartedAt(null);
      toast.push(status.error || "Échec de la mise à jour", true);
    }
  }, [runStartedAt, status, toast]);

  const update = useMutation({
    mutationFn: () => api.adminUpdate(),
    onSuccess: (r) => {
      if (!r.ok || !r.status?.startedAt) {
        toast.push(r.error || "Impossible de démarrer la mise à jour", true);
        return;
      }
      setRunStartedAt(r.status.startedAt);
      statusQ.refetch();
    },
    onError: (e: any) => toast.push(e.message || "Erreur", true),
  });

  const running = runStartedAt !== null;
  const applied = Boolean(status?.phase === "done" && !status.upToDate && status.finishedAt && !running);

  return (
    <section className="card" style={{ marginBottom: "var(--space-6)" }}>
      <div className="panel-head">
        <h2>Mise à jour de l'application 🚀</h2>
      </div>

      {unsupported ? (
        <p className="muted small">
          La mise à jour in-app n'est disponible que sur l'hébergement Node (VM Oracle).
        </p>
      ) : (
        <>
          <p className="muted" style={{ marginBottom: "var(--space-4)" }}>
            Récupère la dernière version depuis GitHub, reconstruit le site, puis redémarre le
            service. Équivalent du bouton « Mettre à jour » de Portfolio / Prospup.
            {commit && (
              <>
                {" "}Version en ligne&nbsp;: <code>{commit}</code>.
              </>
            )}
          </p>

          <div className="row gap-2 wrap" style={{ alignItems: "center" }}>
            <button className="btn btn-primary" onClick={() => update.mutate()} disabled={running || update.isPending}>
              {running ? "Mise à jour en cours…" : "Mettre à jour"}
            </button>
            {running && <Spinner />}
            {running && status?.step && <span className="muted small">{status.step}</span>}
            {applied && (
              <button className="btn btn-soft" onClick={() => window.location.reload()}>
                Recharger pour appliquer
              </button>
            )}
          </div>

          {status && (status.phase === "running" || status.phase === "error") && status.log.length > 0 && (
            <pre
              style={{
                marginTop: "var(--space-4)",
                maxHeight: 200,
                overflow: "auto",
                background: "var(--bg-2, rgba(0,0,0,.04))",
                borderRadius: "var(--radius, 10px)",
                padding: "var(--space-3)",
                fontSize: "0.74rem",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {status.log.slice(-40).join("\n")}
            </pre>
          )}

          {status?.phase === "error" && status.error && (
            <p className="small" style={{ color: "var(--danger)", marginTop: "var(--space-3)" }}>
              {status.error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [resetFor, setResetFor] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const onErr = (e: any) => toast.push(e.message || "Erreur", true);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const statsQ = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => api.adminStats(),
    enabled: user?.role === "admin",
  });

  const usersQ = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.adminUsers(),
    enabled: user?.role === "admin",
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.adminResetPassword(id, password),
    onSuccess: () => {
      toast.push("Mot de passe réinitialisé 🔑");
      setResetFor(null);
      setNewPassword("");
    },
    onError: onErr,
  });

  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "admin" | "member" }) => api.adminSetRole(id, role),
    onSuccess: () => {
      invalidate();
      toast.push("Rôle mis à jour ✨");
    },
    onError: onErr,
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.adminDeleteUser(id),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast.push("Utilisateur supprimé");
    },
    onError: onErr,
  });

  /* ── Garde d'accès ──────────────────────────────────────────────────── */
  if (user?.role !== "admin") {
    return <EmptyState emoji="🔒" title="Réservé à l'admin" hint="Tu n'as pas accès à cette section." />;
  }

  const stats = statsQ.data?.stats ?? {};
  const appName = statsQ.data?.app_name ?? "marienour";
  const users = (usersQ.data?.users ?? []) as unknown as AdminUser[];

  const askDelete = async (u: AdminUser) => {
    const ok = await confirm(`Supprimer définitivement ${u.display_name} (${u.email}) ? Cette action est irréversible.`);
    if (ok) deleteUser.mutate(u.id);
  };

  const submitReset = () => {
    if (!resetFor) return;
    if (newPassword.trim().length < 4) {
      toast.push("Choisis un mot de passe plus long", true);
      return;
    }
    resetPassword.mutate({ id: resetFor.id, password: newPassword });
  };

  // Ordonne les stats selon le catalogue connu, puis le reste.
  const statKeys = [
    ...Object.keys(STAT_LABELS).filter((k) => k in stats),
    ...Object.keys(stats).filter((k) => !(k in STAT_LABELS)),
  ];

  return (
    <div>
      <div className="page-head row wrap" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">{appName}</p>
          <h1>Administration 🛠️</h1>
          <p className="muted">Vue d'ensemble et gestion des comptes.</p>
        </div>
        <span className="chip chip-accent">Admin</span>
      </div>

      {/* ── Statistiques ─────────────────────────────────────────────── */}
      {statsQ.isLoading ? (
        <Spinner />
      ) : statKeys.length === 0 ? (
        <EmptyState emoji="📊" title="Aucune statistique" />
      ) : (
        <div className="grid-cards" style={{ marginBottom: "var(--space-6)" }}>
          {statKeys.map((k) => (
            <div key={k} className="card card-pad-sm">
              <div className="row gap-2" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: "1.4rem" }}>{STAT_EMOJI[k] ?? "🔹"}</span>
                <span className="muted small">{STAT_LABELS[k] ?? k}</span>
              </div>
              <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.8rem" }}>{stats[k]}</strong>
            </div>
          ))}
        </div>
      )}

      {/* ── Mise à jour de l'application ─────────────────────────────── */}
      <MaintenanceCard />

      {/* ── Utilisateurs ─────────────────────────────────────────────── */}
      <section className="card">
        <div className="panel-head">
          <h2>Utilisateurs {users.length > 0 && <span className="chip">{users.length}</span>}</h2>
        </div>

        {usersQ.isLoading ? (
          <Spinner />
        ) : users.length === 0 ? (
          <EmptyState emoji="👤" title="Aucun utilisateur" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "0.5rem", fontSize: "0.78rem", fontWeight: 700 }}>Email</th>
                  <th style={{ padding: "0.5rem", fontSize: "0.78rem", fontWeight: 700 }}>Nom</th>
                  <th style={{ padding: "0.5rem", fontSize: "0.78rem", fontWeight: 700 }}>Pseudo</th>
                  <th style={{ padding: "0.5rem", fontSize: "0.78rem", fontWeight: 700 }}>Rôle</th>
                  <th style={{ padding: "0.5rem", fontSize: "0.78rem", fontWeight: 700 }}>Créé le</th>
                  <th style={{ padding: "0.5rem", fontSize: "0.78rem", fontWeight: 700 }}>Contenu</th>
                  <th style={{ padding: "0.5rem", fontSize: "0.78rem", fontWeight: 700 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = u.id === user.id;
                  return (
                    <tr key={u.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.6rem 0.5rem" }}>{u.email}</td>
                      <td style={{ padding: "0.6rem 0.5rem" }}>{u.display_name}</td>
                      <td style={{ padding: "0.6rem 0.5rem" }} className="muted">{u.handle ? `@${u.handle}` : "—"}</td>
                      <td style={{ padding: "0.6rem 0.5rem" }}>
                        <span className="badge">{u.role === "admin" ? "Admin" : "Membre"}</span>
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem" }} className="muted small">{fmtDate(u.created_at)}</td>
                      <td style={{ padding: "0.6rem 0.5rem" }} className="muted small">
                        {`📝 ${u.notes ?? 0} · 🍳 ${u.recipes ?? 0} · ✈️ ${u.trips ?? 0}`}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem" }}>
                        <div className="row gap-2 wrap">
                          <button
                            className="btn btn-soft btn-sm"
                            onClick={() => { setResetFor(u); setNewPassword(""); }}
                          >
                            Réinitialiser le mot de passe
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setRole.mutate({ id: u.id, role: u.role === "admin" ? "member" : "admin" })}
                            disabled={setRole.isPending || isSelf}
                          >
                            {u.role === "admin" ? "Passer membre" : "Passer admin"}
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => askDelete(u)}
                            disabled={deleteUser.isPending || isSelf}
                            title={isSelf ? "Tu ne peux pas te supprimer toi-même" : undefined}
                          >
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Modal de réinitialisation ────────────────────────────────── */}
      {resetFor && (
        <Modal
          title={`Réinitialiser le mot de passe`}
          onClose={() => { setResetFor(null); setNewPassword(""); }}
          footer={
            <>
              <button className="btn btn-soft" onClick={() => { setResetFor(null); setNewPassword(""); }}>Annuler</button>
              <button className="btn btn-primary" onClick={submitReset} disabled={resetPassword.isPending}>
                {resetPassword.isPending ? "…" : "Réinitialiser"}
              </button>
            </>
          }
        >
          <p className="muted" style={{ marginBottom: "var(--space-4)" }}>
            Nouveau mot de passe pour <strong>{resetFor.display_name}</strong> ({resetFor.email}).
          </p>
          <Field label="Nouveau mot de passe">
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && submitReset()}
            />
          </Field>
        </Modal>
      )}

      {confirmNode}
    </div>
  );
}
