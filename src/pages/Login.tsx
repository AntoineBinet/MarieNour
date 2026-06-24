import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { Field } from "../ui";
import { Icon, type IconName } from "../components/Icon";
import type { Gender } from "@shared/types";

// Réponses proposées à la question (optionnelle) du sexe. Sert uniquement à
// proposer un style d'interface de départ adapté — jamais affiché ensuite.
const GENDERS: { key: Gender; label: string }[] = [
  { key: "female", label: "Femme" },
  { key: "male", label: "Homme" },
  { key: "other", label: "Autre" },
];

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

function AuthCard({
  initialMode,
  redirectTo,
  initialNotice = "",
  initialError = "",
}: {
  initialMode: "login" | "register";
  redirectTo: string;
  initialNotice?: string;
  initialError?: string;
}) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState(initialNotice);
  const [busy, setBusy] = useState(false);
  // Compte créé en attente d'activation (membre) → on affiche l'écran « vérifie ta boîte mail ».
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  // E-mail pour lequel proposer un renvoi du lien (échec de connexion « non activé »).
  const [resendFor, setResendFor] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const resend = async (target: string) => {
    setResending(true);
    setError("");
    try {
      await api.resendVerification(target);
    } catch {
      /* réponse volontairement opaque (anti-énumération) */
    } finally {
      setResending(false);
      setNotice("E-mail de confirmation renvoyé. Pense à vérifier tes spams (courrier indésirable).");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setResendFor(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const res = await api.login(email, password);
        setUser(res.user);
        navigate(redirectTo, { replace: true });
      } else {
        const res = await api.register(email, password, name, gender || undefined);
        if (res.user) {
          // Cas admin : vérifié d'emblée et connecté.
          setUser(res.user);
          navigate(redirectTo, { replace: true });
        } else {
          // Cas membre : e-mail d'activation envoyé, compte en attente.
          setPendingEmail(email);
        }
      }
    } catch (err) {
      const ae = err instanceof ApiError ? err : null;
      // 403 à la connexion = compte non activé → proposer le renvoi du lien.
      if (ae && ae.status === 403 && mode === "login") setResendFor(email);
      setError(ae ? ae.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  };

  // Écran de confirmation post-inscription (compte membre en attente d'activation).
  if (pendingEmail) {
    return (
      <div className="auth-card card" id="auth">
        <h3 style={{ marginTop: 0, marginBottom: "var(--space-2)" }}>Vérifie ta boîte mail 📬</h3>
        <p className="small">
          On a envoyé un lien d'activation à <strong>{pendingEmail}</strong>. Clique dessus pour activer ton compte, puis connecte-toi.
        </p>
        <p className="small" style={{ color: "var(--accent, #c06b4f)", fontWeight: 600 }}>
          Pas reçu&nbsp;? Pense à regarder tes spams / courrier indésirable — les e-mails automatiques y atterrissent souvent.
        </p>
        {notice && <p className="small" style={{ color: "var(--ok, #2f855a)" }}>{notice}</p>}
        <div className="row gap-2" style={{ marginTop: "var(--space-4)" }}>
          <button className="btn btn-soft grow" type="button" disabled={resending} onClick={() => resend(pendingEmail)}>
            {resending ? "…" : "Renvoyer l'e-mail"}
          </button>
          <button
            className="btn btn-primary grow"
            type="button"
            onClick={() => {
              setPendingEmail(null);
              setMode("login");
              setNotice("");
              setError("");
            }}
          >
            J'ai activé → me connecter
          </button>
        </div>
      </div>
    );
  }

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
        {mode === "register" && (
          <div className="field">
            <label className="label">Tu es…</label>
            <div className="seg seg-gender" role="group" aria-label="Sexe">
              {GENDERS.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={`seg-item${gender === g.key ? " active" : ""}`}
                  aria-pressed={gender === g.key}
                  onClick={() => setGender((cur) => (cur === g.key ? "" : g.key))}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <p className="muted small" style={{ marginTop: 4 }}>
              Facultatif&nbsp;: ça nous aide à choisir un style de départ. Tout reste personnalisable ensuite.
            </p>
          </div>
        )}
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@email.com" required autoComplete="email" />
        </Field>
        <Field label="Mot de passe">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete={mode === "login" ? "current-password" : "new-password"} />
        </Field>

        {notice && <p style={{ color: "var(--ok, #2f855a)", marginTop: "var(--space-3)" }} className="small">{notice}</p>}
        {error && <p style={{ color: "var(--danger)", marginTop: "var(--space-3)" }} className="small">{error}</p>}

        {resendFor && (
          <button
            className="btn btn-soft btn-block"
            type="button"
            disabled={resending}
            style={{ marginTop: "var(--space-3)" }}
            onClick={() => resend(resendFor)}
          >
            {resending ? "…" : "Renvoyer l'e-mail de confirmation"}
          </button>
        )}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy} style={{ marginTop: "var(--space-5)" }}>
          {busy ? "…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>
      <p className="muted small center" style={{ marginTop: "var(--space-4)" }}>
        <Icon name="lock" size={13} style={{ verticalAlign: "-2px" }} /> Gratuit, privé, sans pub.
      </p>
      {mode === "register" && (
        <p className="muted small center" style={{ marginTop: "var(--space-2)" }}>
          En créant un compte, tu acceptes les{" "}
          <Link to="/cgu">conditions d'utilisation</Link> et la{" "}
          <Link to="/confidentialite">politique de confidentialité</Link>.
        </p>
      )}
    </div>
  );
}

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const redirectTo = params.get("redirect") || (location.state as { from?: string } | null)?.from || "/";
  const verified = params.get("verified") === "1";
  const verifyError = params.get("error") === "invalid_token";
  // Après un clic sur le lien d'activation, on force l'onglet « Connexion ».
  const initialMode: "login" | "register" = !verified && params.get("mode") === "register" ? "register" : "login";
  const initialNotice = verified ? "E-mail vérifié ✓ Tu peux maintenant te connecter." : "";
  const initialError = verifyError ? "Lien de vérification invalide ou expiré. Connecte-toi pour en recevoir un nouveau." : "";

  if (user) navigate(redirectTo, { replace: true });

  const goAuth = () => document.getElementById("auth")?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand">
          <img src="/favicon.svg" alt="" className="brand-logo" />
          <span className="brand-name">MarieNour</span>
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
          <AuthCard initialMode={initialMode} redirectTo={redirectTo} initialNotice={initialNotice} initialError={initialError} />
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
          <Link to="/cgu">Conditions d'utilisation</Link>
          <span style={{ opacity: 0.5, margin: "0 6px" }}>·</span>
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
