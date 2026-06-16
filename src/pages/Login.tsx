import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { Field } from "../ui";

export default function Login() {
  const { setUser, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) {
    navigate("/", { replace: true });
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await api.login(email, password)
          : await api.register(email, password, name);
      setUser(res.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Une erreur est survenue");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <div className="center" style={{ marginBottom: "var(--space-5)" }}>
          <img src="/favicon.svg" alt="" style={{ width: 52, height: 52, borderRadius: 15 }} />
          <h1 style={{ marginTop: "var(--space-3)" }}>marienour</h1>
          <p className="muted">Ton atelier pour tout garder, planifier et partager.</p>
        </div>

        <div className="row gap-2" style={{ marginBottom: "var(--space-4)" }}>
          <button
            className={`btn grow ${mode === "login" ? "btn-primary" : "btn-soft"}`}
            onClick={() => setMode("login")}
            type="button"
          >
            Connexion
          </button>
          <button
            className={`btn grow ${mode === "register" ? "btn-primary" : "btn-soft"}`}
            onClick={() => setMode("register")}
            type="button"
          >
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
      </div>

      <footer className="muted small center" style={{ marginTop: "var(--space-5)", lineHeight: 1.7 }}>
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
