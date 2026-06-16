import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { Field } from "../ui";
import { Icon, type IconName } from "../components/Icon";

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "grid", title: "Un tableau de bord à toi", text: "Compose ton accueil avec des widgets que tu glisses et redimensionnes." },
  { icon: "wallet", title: "Tes finances maîtrisées", text: "Comptes, budgets, récurrents et objectifs d'épargne — seul ou à deux." },
  { icon: "compass", title: "Voyages & week-ends", text: "Planifie en groupe, vote les étapes, garde un œil sur le budget." },
  { icon: "expenses", title: "Dépenses partagées", text: "Façon Tricount : qui doit quoi, remboursements optimisés." },
  { icon: "lists", title: "Listes, notes & recettes", text: "Tout ce que tu veux garder à portée de main, joliment rangé." },
  { icon: "qr", title: "Invite d'un scan", text: "Un QR code pour ajouter tes proches — même pas encore inscrits." },
];

const REASONS: { icon: IconName; title: string; text: string }[] = [
  { icon: "lock", title: "Privé par défaut", text: "Tes données t'appartiennent. Tu choisis précisément ce que tu partages, et avec qui." },
  { icon: "users", title: "Mieux à plusieurs", text: "Partage un budget avec ton/ta partenaire, un voyage avec tes amis, sans prise de tête." },
  { icon: "sparkle", title: "Beau & rapide", text: "Une interface soignée, pensée mobile d'abord, qui va droit au but." },
];

function AuthCard({ initialMode, redirectTo }: { initialMode: "login" | "register"; redirectTo: string }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res =
        mode === "login" ? await api.login(email, password) : await api.register(email, password, name);
      setUser(res.user);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card card" id="auth">
      <div className="row gap-2" style={{ marginBottom: "var(--space-4)" }}>
        <button className={`btn grow ${mode === "login" ? "btn-primary" : "btn-soft"}`} onClick={() => setMode("login")} type="button">
          Connexion
        </button>
        <button className={`btn grow ${mode === "register" ? "btn-primary" : "btn-soft"}`} onClick={() => setMode("register")} type="button">
          Créer un compte
        </button>
      </div>

      <form onSubmit={submit}>
        {mode === "register" && (
          <Field label="Prénom ou pseudo">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Marie-Nour" required />
          </Field>
        )}
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@email.com" required autoComplete="email" />
        </Field>
        <Field label="Mot de passe">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </Field>

        {error && <p style={{ color: "var(--danger)", marginTop: "var(--space-3)" }} className="small">{error}</p>}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: "var(--space-5)" }}>
          {busy ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>
      <p className="muted small center" style={{ marginTop: "var(--space-4)" }}>
        <Icon name="lock" size={13} style={{ verticalAlign: "-2px" }} /> Gratuit, privé, sans pub.
      </p>
    </div>
  );
}

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const redirectTo = params.get("redirect") || (location.state as { from?: string } | null)?.from || "/";
  const initialMode: "login" | "register" = params.get("mode") === "register" ? "register" : "login";

  if (user) navigate(redirectTo, { replace: true });

  const goAuth = () => document.getElementById("auth")?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand">
          <img src="/favicon.svg" alt="" className="brand-logo" />
          <span className="brand-name">marienour</span>
        </div>
        <button className="btn btn-soft btn-sm landing-nav-cta" onClick={goAuth}>Se connecter</button>
      </header>

      <section className="landing-hero">
        <div className="landing-pitch">
          <span className="landing-eyebrow"><Icon name="sparkle" size={14} /> Ton atelier personnel</span>
          <h1 className="landing-title">Tout garder, planifier et partager — au même endroit.</h1>
          <p className="landing-sub">
            Budget, voyages, listes, recettes, photos et dépenses entre amis. Une seule app, élégante et privée,
            pensée d'abord pour <strong>toi</strong> — et pour les moments partagés.
          </p>
          <ul className="landing-bullets">
            {FEATURES.slice(0, 4).map((f) => (
              <li key={f.title}><span className="landing-bullet-ic"><Icon name={f.icon} size={16} /></span>{f.title}</li>
            ))}
          </ul>
          <div className="row gap-2 wrap">
            <button className="btn btn-primary" onClick={goAuth}><Icon name="rocket" size={16} /> Créer mon compte</button>
            <a className="btn btn-ghost" href="#features">Découvrir</a>
          </div>
        </div>

        <div className="landing-authwrap">
          <AuthCard initialMode={initialMode} redirectTo={redirectTo} />
        </div>
      </section>

      <section className="landing-features" id="features">
        <h2 className="center landing-section-title">Une app, tous tes essentiels</h2>
        <div className="landing-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing-feature card">
              <span className="landing-feature-ic"><Icon name={f.icon} size={22} /></span>
              <strong>{f.title}</strong>
              <p className="muted small">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-why">
        <h2 className="center landing-section-title">Pourquoi s'inscrire&nbsp;?</h2>
        <div className="landing-grid landing-grid-3">
          {REASONS.map((r) => (
            <div key={r.title} className="landing-why-card">
              <span className="landing-feature-ic"><Icon name={r.icon} size={22} /></span>
              <strong>{r.title}</strong>
              <p className="muted small">{r.text}</p>
            </div>
          ))}
        </div>
        <div className="center" style={{ marginTop: "var(--space-6)" }}>
          <button className="btn btn-primary" onClick={goAuth}><Icon name="rocket" size={16} /> Commencer gratuitement</button>
        </div>
      </section>

      <footer className="muted small center landing-footer">
        Site créé par Antoine Binet, sous la micro-société AB&nbsp;Azur&nbsp;Tech.
        <div style={{ marginTop: 4 }}>
          <Link to="/mentions-legales">Mentions légales</Link>
          <span style={{ opacity: 0.5, margin: "0 6px" }}>·</span>
          <Link to="/confidentialite">Confidentialité</Link>
          <span style={{ opacity: 0.5, margin: "0 6px" }}>·</span>
          <a href="mailto:binet.antoine2@gmail.com">binet.antoine2@gmail.com</a>
        </div>
      </footer>
    </div>
  );
}
