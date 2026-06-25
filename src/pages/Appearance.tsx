// Page « Personnalisation » — centre de contrôle de l'apparence et de la façon
// dont l'app s'adresse à toi. Tout s'applique EN DIRECT (aperçu immédiat sur
// toute l'app) et se synchronise sur tous tes appareils (enregistrement auto).
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Field, Spinner, useToast, useConfirm } from "../ui";
import { Icon, type IconName } from "../components/Icon";
import { applyAppearance } from "../theme";
import { buildGreeting } from "../greeting";
import type {
  BackgroundStyle,
  DensityStyle,
  DesignStyle,
  FontChoice,
  GreetingStyle,
  RadiusStyle,
  ThemeMode,
  UserPrefs,
} from "@shared/types";

/* ── Données des options ──────────────────────────────────────────────────── */
const ACCENTS: { key: string; label: string; color: string }[] = [
  { key: "terracotta", label: "Terracotta", color: "#c8694b" },
  { key: "coral", label: "Corail", color: "#d56a52" },
  { key: "rose", label: "Rose", color: "#c4577f" },
  { key: "berry", label: "Baie", color: "#b04a63" },
  { key: "plum", label: "Prune", color: "#8a5a7e" },
  { key: "indigo", label: "Indigo", color: "#5b5fc0" },
  { key: "ocean", label: "Océan", color: "#3f7d8a" },
  { key: "teal", label: "Lagon", color: "#2f8c80" },
  { key: "sage", label: "Sauge", color: "#6f8a5f" },
  { key: "forest", label: "Forêt", color: "#4a7a4e" },
  { key: "amber", label: "Ambre", color: "#c2871f" },
  { key: "slate", label: "Ardoise", color: "#5a6b7a" },
];

// Styles d'interface coordonnés (« packs »). Noms volontairement neutres : ce
// sont des ambiances, sans aucune notion de genre. Chaque pack affiche une
// pastille d'aperçu (3 teintes : fond, surface, accent indicatif).
const DESIGNS: { key: DesignStyle; label: string; desc: string; swatch: [string, string, string] }[] = [
  { key: "default", label: "Atelier", desc: "Chaleureux et tout en douceur", swatch: ["#f6efe7", "#fffdfa", "#c8694b"] },
  { key: "graphite", label: "Graphite", desc: "Net, profond et structuré", swatch: ["#0e1116", "#1f2632", "#7f93a6"] },
  { key: "editorial", label: "Encre", desc: "Minimal, contrasté, typographique", swatch: ["#f4f2ee", "#ffffff", "#1a1814"] },
];

const THEMES: { key: ThemeMode; label: string; desc: string; icon: IconName }[] = [
  { key: "system", label: "Système", desc: "Suit ton appareil", icon: "settings" },
  { key: "light", label: "Clair", desc: "Toujours clair", icon: "sun" },
  { key: "dark", label: "Sombre", desc: "Toujours sombre", icon: "moon" },
];

const BACKGROUNDS: { key: BackgroundStyle; label: string; desc: string }[] = [
  { key: "default", label: "Sobre", desc: "Fond uni doux" },
  { key: "warm", label: "Chaleureux", desc: "Halo couleur d'accent" },
  { key: "cool", label: "Frais", desc: "Halo bleuté" },
  { key: "dawn", label: "Aurore", desc: "Dégradé tendre" },
  { key: "mesh", label: "Pastel", desc: "Taches colorées" },
  { key: "plain", label: "Minimal", desc: "Aplat neutre" },
];

const RADII: { key: RadiusStyle; label: string; desc: string }[] = [
  { key: "sharp", label: "Net", desc: "Coins peu arrondis" },
  { key: "soft", label: "Doux", desc: "Arrondi équilibré" },
  { key: "round", label: "Rond", desc: "Très arrondi" },
];

const DENSITIES: { key: DensityStyle; label: string; desc: string }[] = [
  { key: "compact", label: "Compact", desc: "Plus d'infos à l'écran" },
  { key: "cozy", label: "Confort", desc: "Équilibre par défaut" },
  { key: "comfortable", label: "Aéré", desc: "Beaucoup d'espace" },
];

const FONTS: { key: FontChoice; label: string }[] = [
  { key: "default", label: "Défaut" },
  { key: "serif", label: "Élégante" },
  { key: "sans", label: "Moderne" },
  { key: "rounded", label: "Arrondie" },
  { key: "humanist", label: "Classique" },
  { key: "mono", label: "Mécanique" },
];

const GREETINGS: { key: GreetingStyle; label: string; desc: string }[] = [
  { key: "time", label: "Selon l'heure", desc: "« Bonjour », « Bonne soirée »…" },
  { key: "simple", label: "Simple", desc: "« Bonjour, <prénom> »" },
  { key: "custom", label: "Personnalisé", desc: "Ton propre message" },
  { key: "none", label: "Juste le prénom", desc: "Sans formule" },
];

const EMOJIS = ["", "👋", "✨", "☀️", "🌙", "🌸", "🌿", "☕️", "💛", "🚀", "🪐", "🔥", "🌈", "🦋", "🍃"];

const CLEARED: Record<string, null> = {
  nickname: null, design: null, theme_mode: null, accent_custom: null, font_scale: null,
  radius: null, density: null, font_display: null, font_body: null,
  contrast: null, reduce_motion: null, background: null,
  greeting_style: null, greeting_custom: null, greeting_emoji: null,
};

/* ── Petits composants ────────────────────────────────────────────────────── */
function Opt({
  selected, title, desc, icon, onClick,
}: { selected: boolean; title: string; desc?: string; icon?: IconName; onClick: () => void }) {
  return (
    <button type="button" className={`appr-opt${selected ? " sel" : ""}`} onClick={onClick} aria-pressed={selected}>
      <span className="appr-opt-title">
        {icon && <Icon name={icon} size={15} />} {title}
        {selected && <Icon name="check" size={13} />}
      </span>
      {desc && <span className="appr-opt-desc">{desc}</span>}
    </button>
  );
}

function Switch({ checked, onChange, label, hint, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; id: string }) {
  return (
    <div className="appr-toggle">
      <label htmlFor={id} className="col" style={{ gap: 2, cursor: "pointer" }}>
        <strong style={{ fontWeight: 600, fontSize: "0.92rem" }}>{label}</strong>
        {hint && <span className="muted small">{hint}</span>}
      </label>
      <span className="switch">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} role="switch" aria-checked={checked} />
        <span className="switch-track" />
      </span>
    </div>
  );
}

function SectionHead({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  return (
    <div className="appr-section-head">
      <span className="appr-section-ic"><Icon name={icon} size={20} /></span>
      <div className="col" style={{ gap: 2 }}>
        <h2>{title}</h2>
        <span className="muted small">{sub}</span>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function Appearance() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [accent, setAccent] = useState(user?.accent || "terracotta");
  const [prefs, setPrefs] = useState<UserPrefs>(user?.prefs || {});
  // Les réglages fins (fond, typo, formes, accessibilité) sont repliés : on ne
  // présente d'emblée que l'essentiel (style, accueil, thème, couleur).
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Applique l'apparence en direct sur toute l'app à chaque changement.
  useEffect(() => {
    applyAppearance({ accent, prefs });
  }, [accent, JSON.stringify(prefs)]);

  // Enregistrement automatique (debounce), avec flush à la sortie de la page.
  const latest = useRef({ accent, prefs });
  latest.current = { accent, prefs };
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = (payload: { accent?: string; prefs: UserPrefs | Record<string, null> }) => {
    api
      .updateMe(payload as any)
      .then((res) => setUser(res.user))
      .catch((e: any) => toast.push(e?.message || "Enregistrement impossible", true));
  };
  const schedule = () => {
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dirty.current = false;
      persist({ accent: latest.current.accent, prefs: latest.current.prefs });
    }, 450);
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (dirty.current) persist({ accent: latest.current.accent, prefs: latest.current.prefs });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return <Spinner />;

  /* Helpers de modification */
  const set = (patch: Partial<UserPrefs>) => { setPrefs((p) => ({ ...p, ...patch })); schedule(); };
  const pickAccent = (key: string) => { setAccent(key); schedule(); };
  const pickCustom = (hex: string) => { setAccent("custom"); setPrefs((p) => ({ ...p, accent_custom: hex })); schedule(); };

  const reset = async () => {
    const ok = await confirm("Remettre toute l'apparence à zéro (thème, couleur, typo, accueil…) ?");
    if (!ok) return;
    setAccent("terracotta");
    setPrefs({});
    if (timer.current) clearTimeout(timer.current);
    dirty.current = false;
    persist({ accent: "terracotta", prefs: CLEARED });
    toast.push("Apparence réinitialisée");
  };

  const scale = prefs.font_scale ?? 1;
  const greetStyle = prefs.greeting_style ?? "time";
  const previewGreeting = buildGreeting({ display_name: user.display_name, prefs });

  return (
    <div>
      <div className="page-head">
        <p className="eyebrow">À ton image</p>
        <h1 className="row gap-2">Personnalisation <Icon name="palette" size={22} /></h1>
        <p className="muted">Habille l'app à ton goût et choisis comment elle s'adresse à toi. Tout est appliqué et enregistré automatiquement.</p>
      </div>

      <div className="appr-layout">
        <div>
          {/* ── Style d'interface (pack coordonné) ────────────────────────── */}
          <section className="card appr-section">
            <SectionHead icon="sparkle" title="Style d'interface" sub="Une ambiance coordonnée, à changer quand tu veux." />
            <div className="appr-opts appr-designs">
              {DESIGNS.map((d) => {
                const selected = (prefs.design ?? "default") === d.key;
                return (
                  <button
                    key={d.key}
                    type="button"
                    className={`appr-opt appr-design${selected ? " sel" : ""}`}
                    onClick={() => set({ design: d.key })}
                    aria-pressed={selected}
                  >
                    <span className="appr-design-swatch" aria-hidden="true">
                      {d.swatch.map((c, i) => (
                        <span key={i} style={{ background: c }} />
                      ))}
                    </span>
                    <span className="appr-opt-title">
                      {d.label}
                      {selected && <Icon name="check" size={13} />}
                    </span>
                    <span className="appr-opt-desc">{d.desc}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Accueil & prénom ─────────────────────────────────────────── */}
          <section className="card appr-section">
            <SectionHead icon="chat" title="Comment je t'appelle" sub="Le prénom et le message qui t'accueillent." />

            <Field label="Ton prénom d'accueil">
              <input
                className="input"
                value={prefs.nickname ?? ""}
                maxLength={40}
                onChange={(e) => set({ nickname: e.target.value })}
                placeholder={user.display_name}
              />
              <p className="muted small" style={{ marginTop: 4 }}>
                C'est le prénom (ou surnom) par lequel l'app te parle. Laisse vide pour utiliser ton nom affiché.
              </p>
            </Field>

            <div className="field">
              <label className="label">Message d'accueil</label>
              <div className="appr-opts">
                {GREETINGS.map((g) => (
                  <Opt key={g.key} selected={greetStyle === g.key} title={g.label} desc={g.desc} onClick={() => set({ greeting_style: g.key })} />
                ))}
              </div>
            </div>

            {greetStyle === "custom" && (
              <Field label="Ton message">
                <input
                  className="input"
                  value={prefs.greeting_custom ?? ""}
                  maxLength={120}
                  onChange={(e) => set({ greeting_custom: e.target.value })}
                  placeholder="Hello {prenom}, prêt·e à avancer ?"
                />
                <p className="muted small" style={{ marginTop: 4 }}>
                  Astuce&nbsp;: écris <strong>{"{prenom}"}</strong> là où ton prénom doit apparaître.
                </p>
              </Field>
            )}

            <div className="field">
              <label className="label">Petit emoji d'accueil</label>
              <div className="appr-opts" style={{ gap: "var(--space-2)" }}>
                {EMOJIS.map((e, i) => {
                  const selected = (prefs.greeting_emoji ?? "") === e;
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`appr-opt${selected ? " sel" : ""}`}
                      style={{ minWidth: 0, padding: "0.5rem 0.7rem", fontSize: "1.1rem" }}
                      onClick={() => set({ greeting_emoji: e })}
                      aria-pressed={selected}
                      aria-label={e || "Aucun"}
                    >
                      {e || "—"}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── Thème ────────────────────────────────────────────────────── */}
          <section className="card appr-section">
            <SectionHead icon="sun" title="Thème" sub="Clair, sombre, ou au rythme de ton appareil." />
            <div className="appr-opts">
              {THEMES.map((t) => (
                <Opt key={t.key} selected={(prefs.theme_mode ?? "system") === t.key} title={t.label} desc={t.desc} icon={t.icon} onClick={() => set({ theme_mode: t.key })} />
              ))}
            </div>
          </section>

          {/* ── Couleur d'accent ─────────────────────────────────────────── */}
          <section className="card appr-section">
            <SectionHead icon="palette" title="Couleur d'accent" sub="La couleur des boutons, liens et touches de l'app." />
            <div className="appr-accents">
              {ACCENTS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className={`appr-accent${accent === a.key ? " sel" : ""}`}
                  style={{ background: a.color }}
                  onClick={() => pickAccent(a.key)}
                  aria-pressed={accent === a.key}
                  aria-label={a.label}
                  title={a.label}
                >
                  {accent === a.key && <Icon name="check" size={16} />}
                </button>
              ))}
              <label
                className={`appr-accent appr-accent-custom${accent === "custom" ? " sel" : ""}`}
                title="Couleur personnalisée"
                style={{ cursor: "pointer" }}
              >
                {accent === "custom" && <Icon name="check" size={16} />}
                <input
                  type="color"
                  value={prefs.accent_custom || "#c8694b"}
                  onChange={(e) => pickCustom(e.target.value)}
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
                  aria-label="Choisir une couleur personnalisée"
                />
              </label>
            </div>
            {accent === "custom" && (
              <p className="muted small" style={{ marginTop: "var(--space-3)" }}>
                Couleur libre&nbsp;: <strong>{(prefs.accent_custom || "#c8694b").toUpperCase()}</strong>. Les variantes claires et sombres sont calculées automatiquement.
              </p>
            )}
          </section>

          {/* ── Réglages avancés (repliés par défaut) ────────────────────── */}
          <div className="appr-section">
            <button
              type="button"
              className="disclosure-toggle"
              style={{ fontSize: "var(--text-base)" }}
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
            >
              <span className={`chev${showAdvanced ? " open" : ""}`}><Icon name="arrowRight" size={15} /></span>
              {showAdvanced ? "Masquer les réglages avancés" : "Réglages avancés (fond, typo, formes, accessibilité)"}
            </button>
          </div>

          {showAdvanced && (
          <div className="disclosure-body">
          {/* ── Ambiance / fond ──────────────────────────────────────────── */}
          <section className="card appr-section">
            <SectionHead icon="image" title="Ambiance de fond" sub="Un décor discret derrière toute l'app." />
            <div className="appr-opts">
              {BACKGROUNDS.map((b) => (
                <Opt key={b.key} selected={(prefs.background ?? "default") === b.key} title={b.label} desc={b.desc} onClick={() => set({ background: b.key })} />
              ))}
            </div>
          </section>

          {/* ── Typographie ──────────────────────────────────────────────── */}
          <section className="card appr-section">
            <SectionHead icon="notes" title="Typographie" sub="Le style et la taille du texte." />
            <div className="field">
              <label className="label">Police des titres</label>
              <div className="appr-opts">
                {FONTS.map((f) => (
                  <Opt key={f.key} selected={(prefs.font_display ?? "default") === f.key} title={f.label} onClick={() => set({ font_display: f.key })} />
                ))}
              </div>
            </div>
            <div className="field">
              <label className="label">Police du texte</label>
              <div className="appr-opts">
                {FONTS.map((f) => (
                  <Opt key={f.key} selected={(prefs.font_body ?? "default") === f.key} title={f.label} onClick={() => set({ font_body: f.key })} />
                ))}
              </div>
            </div>
            <div className="field">
              <label className="label">Taille du texte</label>
              <div className="appr-range">
                <Icon name="notes" size={13} />
                <input
                  type="range"
                  min={0.85}
                  max={1.3}
                  step={0.05}
                  value={scale}
                  onChange={(e) => set({ font_scale: Number(e.target.value) })}
                  aria-label="Taille du texte"
                />
                <Icon name="notes" size={20} />
                <span className="appr-range-val">{Math.round(scale * 100)}%</span>
              </div>
            </div>
          </section>

          {/* ── Forme & espace ───────────────────────────────────────────── */}
          <section className="card appr-section">
            <SectionHead icon="grid" title="Forme & espace" sub="L'arrondi des éléments et la densité de l'interface." />
            <div className="field">
              <label className="label">Arrondi des coins</label>
              <div className="appr-opts">
                {RADII.map((r) => (
                  <Opt key={r.key} selected={(prefs.radius ?? "soft") === r.key} title={r.label} desc={r.desc} onClick={() => set({ radius: r.key })} />
                ))}
              </div>
            </div>
            <div className="field">
              <label className="label">Densité</label>
              <div className="appr-opts">
                {DENSITIES.map((d) => (
                  <Opt key={d.key} selected={(prefs.density ?? "cozy") === d.key} title={d.label} desc={d.desc} onClick={() => set({ density: d.key })} />
                ))}
              </div>
            </div>
          </section>

          {/* ── Accessibilité ────────────────────────────────────────────── */}
          <section className="card appr-section">
            <SectionHead icon="eye" title="Confort & accessibilité" sub="Pour une lecture plus agréable." />
            <Switch
              id="sw-contrast"
              checked={!!prefs.contrast}
              onChange={(v) => set({ contrast: v })}
              label="Contraste renforcé"
              hint="Bordures et textes secondaires plus marqués."
            />
            <Switch
              id="sw-motion"
              checked={!!prefs.reduce_motion}
              onChange={(v) => set({ reduce_motion: v })}
              label="Réduire les animations"
              hint="Limite les transitions et effets de mouvement."
            />
          </section>
          </div>
          )}

          <div className="row wrap" style={{ justifyContent: "space-between", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
            <p className="muted small" style={{ margin: 0, maxWidth: "44ch" }}>
              Tes réglages sont enregistrés automatiquement et te suivent sur tous tes appareils. Besoin d'aide&nbsp;?{" "}
              <Link to="/aide">Voir le centre d'aide</Link>.
            </p>
            <button className="btn btn-soft btn-sm" onClick={reset}>
              <Icon name="repeat" size={15} /> Tout réinitialiser
            </button>
          </div>
        </div>

        {/* ── Aperçu en direct ───────────────────────────────────────────── */}
        <aside className="appr-preview">
          <div className="card">
            <p className="eyebrow" style={{ color: "var(--accent-ink)", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Aperçu en direct
            </p>
            <p className="appr-preview-greeting" style={{ margin: "var(--space-2) 0 var(--space-1)" }}>
              {previewGreeting.text}{previewGreeting.emoji ? ` ${previewGreeting.emoji}` : ""}
            </p>
            <p className="muted small" style={{ marginBottom: "var(--space-4)" }}>Tout ce que tu gardes, au même endroit.</p>

            <div className="row gap-2 wrap" style={{ marginBottom: "var(--space-3)" }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={(e) => e.preventDefault()}>Action</button>
              <button type="button" className="btn btn-soft btn-sm" onClick={(e) => e.preventDefault()}>Secondaire</button>
              <span className="chip chip-accent">Étiquette</span>
            </div>

            <input className="input" placeholder="Champ de saisie" readOnly style={{ marginBottom: "var(--space-3)" }} />

            <div className="li-row">
              <span className="check done"><Icon name="check" size={13} /></span>
              <span className="li-text">Un élément coché</span>
            </div>
            <div className="li-row">
              <span className="check" />
              <span className="li-text">Un élément à faire</span>
            </div>

            <div className="bar" style={{ marginTop: "var(--space-3)" }}><span style={{ width: "62%" }} /></div>
          </div>
        </aside>
      </div>
      {confirmNode}
    </div>
  );
}
