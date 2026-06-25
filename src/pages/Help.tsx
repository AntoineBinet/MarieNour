// Centre d'aide — page complète, dynamique et interactive.
//
// Recherche en temps réel, filtres par catégorie (contrôle segmenté) et
// rubriques dépliables (accordéon). Tout est piloté par les données ci-dessous
// (CATS + TOPICS) pour rester simple à enrichir. Aucune dépendance réseau : la
// page fonctionne hors-ligne, comme le reste de l'app en mode PWA.
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { EmptyState } from "../ui";

const CONTACT = "binet.antoine2@gmail.com";

type CatId = "start" | "daily" | "share" | "account" | "faq";

interface Cat {
  id: CatId | "all";
  label: string;
  icon: IconName;
}

interface Topic {
  id: string;
  cat: CatId;
  icon: IconName;
  title: string;
  summary: string;
  keywords?: string;
  to?: string;
  cta?: string;
  body: ReactNode;
}

const CATS: Cat[] = [
  { id: "all", label: "Tout", icon: "grid" },
  { id: "start", label: "Premiers pas", icon: "rocket" },
  { id: "daily", label: "Mon quotidien", icon: "home" },
  { id: "share", label: "Partager", icon: "share" },
  { id: "account", label: "Compte & vie privée", icon: "lock" },
  { id: "faq", label: "Questions fréquentes", icon: "chat" },
];

const TOPICS: Topic[] = [
  /* ── Premiers pas ─────────────────────────────────────────────────────── */
  {
    id: "dashboard",
    cat: "start",
    icon: "grid",
    title: "Tableau de bord & widgets",
    summary: "Compose ta page d'accueil avec des widgets déplaçables.",
    keywords: "accueil dashboard tableau de bord widget personnaliser glisser réorganiser taille",
    to: "/",
    cta: "Ouvrir l'accueil",
    body: (
      <>
        <p className="muted">Ton accueil est un atelier sur mesure : tu choisis ce qui s'affiche et dans quel ordre.</p>
        <ul>
          <li>Touche <strong>Personnaliser</strong>, puis <strong>Ajouter</strong> pour choisir tes widgets (listes, prochain voyage, dépenses, photos…).</li>
          <li>Glisse un widget par sa poignée pour le réordonner.</li>
          <li>Change sa taille <strong>S / M / L</strong> pendant l'édition, puis touche <strong>Terminé</strong>.</li>
          <li>Pas d'idée pour démarrer&nbsp;? <strong>Démarrer mon espace</strong> te prépare un atelier complet en un clic.</li>
        </ul>
      </>
    ),
  },
  {
    id: "install",
    cat: "start",
    icon: "rocket",
    title: "Installer l'application sur ton téléphone",
    summary: "Ajoute MarieNour à ton écran d'accueil, comme une vraie app.",
    keywords: "installer pwa application téléphone écran accueil hors-ligne offline ajouter android iphone ios",
    body: (
      <>
        <p className="muted">MarieNour est une application installable (PWA) : un accès plein écran, rapide, et qui fonctionne même hors connexion.</p>
        <ul>
          <li><strong>iPhone / iPad (Safari)</strong> : touche le bouton Partager, puis « Sur l'écran d'accueil ».</li>
          <li><strong>Android (Chrome)</strong> : utilise le bouton <strong>Installer</strong> de la barre latérale, ou le menu ⋮ → « Installer l'application ».</li>
          <li>Une fois installée, elle se met à jour toute seule&nbsp;: un bandeau t'avertit quand une nouvelle version est prête.</li>
        </ul>
      </>
    ),
  },
  {
    id: "invite",
    cat: "start",
    icon: "qr",
    title: "Inviter & partager (QR code ou lien)",
    summary: "Ajoute quelqu'un en un scan — même sans compte.",
    keywords: "inviter invitation qr code lien partager ami voyage groupe dépenses scan",
    body: (
      <>
        <p className="muted">Partout où c'est utile, un bouton <strong>Inviter</strong> génère un QR code ou un lien à copier.</p>
        <ul>
          <li>Fais scanner le QR (ou envoie le lien) pour ajouter quelqu'un en <strong>ami</strong>, à un <strong>voyage</strong> ou à un <strong>groupe de dépenses</strong>.</li>
          <li>Pour les voyages et les dépenses, tu peux même inclure des proches <strong>pas encore inscrits</strong>.</li>
          <li>Les liens d'invitation sont personnels&nbsp;: ne les partage qu'avec les personnes concernées.</li>
        </ul>
      </>
    ),
  },
  {
    id: "theme",
    cat: "start",
    icon: "palette",
    title: "Personnaliser l'apparence (couleurs, thème, typo…)",
    summary: "Rends l'app totalement à ton image, en quelques secondes.",
    keywords: "thème theme clair sombre dark mode couleur accent palette personnaliser apparence police typographie taille texte arrondi densité fond ambiance contraste animation accessibilité personnalisation",
    to: "/personnalisation",
    cta: "Ouvrir la personnalisation",
    body: (
      <>
        <p className="muted">
          La page <strong>Personnalisation</strong> (dans la barre latérale, ou via <strong>Mon profil</strong>) réunit tous les réglages d'apparence.
          Chaque changement s'applique <strong>en direct</strong>, avec un aperçu, et se mémorise sur tous tes appareils.
        </p>
        <ul>
          <li><strong>Thème</strong> : Clair, Sombre, ou « Système » (suit ton appareil). Bascule aussi en un geste depuis la barre latérale.</li>
          <li><strong>Couleur d'accent</strong> : 12 teintes prêtes à l'emploi (Terracotta, Rose, Océan, Forêt, Ambre…) ou une <strong>couleur 100&nbsp;% libre</strong> grâce au sélecteur de couleur.</li>
          <li><strong>Ambiance de fond</strong> : sobre, chaleureux, frais, aurore, pastel ou minimal.</li>
          <li><strong>Typographie</strong> : choisis la police des titres et du texte, et règle la <strong>taille du texte</strong> au curseur.</li>
          <li><strong>Forme &amp; espace</strong> : arrondi des coins (net / doux / rond) et densité (compact / confort / aéré).</li>
          <li><strong>Confort</strong> : contraste renforcé et réduction des animations pour plus de lisibilité.</li>
          <li>Un bouton <strong>Réinitialiser</strong> remet tout à zéro à tout moment.</li>
        </ul>
      </>
    ),
  },
  {
    id: "nickname",
    cat: "start",
    icon: "chat",
    title: "Choisir comment l'app t'appelle",
    summary: "Ton prénom d'accueil et ton message de bienvenue.",
    keywords: "prénom prenom surnom nom accueil bienvenue message salutation bonjour appeler adresse tutoiement personnaliser",
    to: "/personnalisation",
    cta: "Régler mon accueil",
    body: (
      <>
        <p className="muted">
          Dans <strong>Personnalisation → « Comment je t'appelle »</strong>, décide du prénom et du ton de l'accueil.
        </p>
        <ul>
          <li><strong>Prénom d'accueil</strong> : le prénom ou surnom par lequel l'app te parle (sur l'accueil, les messages de bienvenue…). Différent de ton nom public.</li>
          <li><strong>Message d'accueil</strong> : « selon l'heure » (Bonjour / Bonne soirée…), « simple », « juste le prénom », ou un <strong>message personnalisé</strong> où tu écris <strong>{"{prenom}"}</strong> à l'endroit voulu.</li>
          <li>Ajoute un petit <strong>emoji</strong> d'accueil si tu aimes 👋.</li>
        </ul>
      </>
    ),
  },

  /* ── Mon quotidien ────────────────────────────────────────────────────── */
  {
    id: "finances",
    cat: "daily",
    icon: "wallet",
    title: "Mes finances",
    summary: "Comptes, budgets, récurrences et objectifs d'épargne.",
    keywords: "finances budget compte argent dépenses revenus épargne objectif récurrent reste à vivre catégorie",
    to: "/finances",
    cta: "Ouvrir mes finances",
    body: (
      <>
        <p className="muted">Un tableau de bord clair pour piloter ton argent, seul·e ou à deux.</p>
        <ul>
          <li>Crée tes <strong>comptes</strong> et saisis tes opérations par <strong>catégorie</strong>.</li>
          <li>Fixe des <strong>budgets</strong> et suis ton <strong>reste-à-vivre</strong> en un coup d'œil.</li>
          <li>Automatise les <strong>opérations récurrentes</strong> (loyer, abonnements…) et fixe des <strong>objectifs d'épargne</strong>.</li>
          <li>Si tu le souhaites, partage le suivi avec ton/ta partenaire.</li>
        </ul>
      </>
    ),
  },
  {
    id: "lists",
    cat: "daily",
    icon: "lists",
    title: "Listes & checklists",
    summary: "Courses, tâches, valises… coche au fur et à mesure.",
    keywords: "listes checklist courses tâches todo valise cocher case",
    to: "/listes",
    cta: "Ouvrir mes listes",
    body: (
      <>
        <p className="muted">Des listes simples et efficaces pour ne rien oublier.</p>
        <ul>
          <li>Crée une liste, ajoute des éléments et <strong>coche-les</strong> au fil de l'eau.</li>
          <li>Donne une <strong>couleur</strong> à chaque liste pour t'y retrouver.</li>
          <li>Épingle une liste sur ton accueil grâce au widget dédié.</li>
        </ul>
      </>
    ),
  },
  {
    id: "notes",
    cat: "daily",
    icon: "notes",
    title: "Notes & idées",
    summary: "Capture une idée, une adresse, une pensée — en couleurs.",
    keywords: "notes idées mémo pense-bête couleur écrire texte",
    to: "/notes",
    cta: "Ouvrir mes notes",
    body: (
      <>
        <p className="muted">Un carnet toujours à portée de main pour tes idées qui passent.</p>
        <ul>
          <li>Note tout ce qui compte&nbsp;: pensées, adresses, listes d'envies.</li>
          <li>Colore tes notes pour les organiser visuellement.</li>
          <li>Retrouve-les instantanément depuis l'accueil.</li>
        </ul>
      </>
    ),
  },
  {
    id: "trips",
    cat: "daily",
    icon: "trips",
    title: "Voyages",
    summary: "Planifie un week-end ou un road trip, à plusieurs.",
    keywords: "voyage voyages trip week-end road trip étapes itinéraire vote planifier vacances",
    to: "/voyages",
    cta: "Ouvrir mes voyages",
    body: (
      <>
        <p className="muted">De l'idée au départ : prépare ton voyage et embarque tes compagnons de route.</p>
        <ul>
          <li>Crée un voyage, ajoute des <strong>étapes</strong> et des idées d'activités.</li>
          <li>Invite des participants (QR / lien) et <strong>votez ensemble</strong> les meilleures options.</li>
          <li>Relie un <strong>groupe de dépenses</strong> pour partager les frais sur place.</li>
        </ul>
      </>
    ),
  },
  {
    id: "events",
    cat: "daily",
    icon: "confetti",
    title: "Événements",
    summary: "RSVP, sondage de dates, tâches, programme, qui apporte quoi.",
    keywords: "événement événements fête anniversaire rsvp invités sondage date tâches programme apporter planification",
    to: "/evenements",
    cta: "Ouvrir mes événements",
    body: (
      <>
        <p className="muted">Tout pour organiser un moment à plusieurs, sans fil de discussion interminable.</p>
        <ul>
          <li>Recueille les <strong>présences (RSVP)</strong> et trouve la bonne date avec un <strong>sondage</strong>.</li>
          <li>Répartis les <strong>tâches</strong> et construis le <strong>programme</strong> ensemble.</li>
          <li>Coordonne le « <strong>qui apporte quoi</strong> » pour éviter les doublons.</li>
        </ul>
      </>
    ),
  },
  {
    id: "recipes",
    cat: "daily",
    icon: "recipes",
    title: "Recettes",
    summary: "Garde tes recettes préférées au même endroit.",
    keywords: "recettes recette cuisine ingrédients plats repas",
    to: "/recettes",
    cta: "Ouvrir mes recettes",
    body: (
      <>
        <p className="muted">Ton carnet de cuisine personnel, toujours sous la main.</p>
        <ul>
          <li>Enregistre tes recettes avec ingrédients et étapes.</li>
          <li>Retrouve-les facilement au moment de cuisiner.</li>
        </ul>
      </>
    ),
  },
  {
    id: "inspiration",
    cat: "daily",
    icon: "inspiration",
    title: "Inspiration",
    summary: "Collectionne idées, envies et trouvailles.",
    keywords: "inspiration idées envies moodboard trouvailles favoris collection",
    to: "/inspiration",
    cta: "Ouvrir l'inspiration",
    body: (
      <>
        <p className="muted">Un espace pour rassembler ce qui te plaît et nourrir tes projets.</p>
        <ul>
          <li>Ajoute des idées, des liens ou des envies dans ta collection.</li>
          <li>Pioche dedans quand vient le moment de passer à l'action.</li>
        </ul>
      </>
    ),
  },
  {
    id: "photos",
    cat: "daily",
    icon: "photos",
    title: "Photos & albums partagés",
    summary: "Envoie tes photos (tous formats) et partage des albums.",
    keywords: "photos photo album albums image média importer envoyer upload partager privé jpeg png heic iphone glisser déposer qr lien",
    to: "/photos",
    cta: "Ouvrir mes photos",
    body: (
      <>
        <p className="muted">Tes souvenirs, sur une infrastructure dédiée et jamais exposée publiquement.</p>
        <ul>
          <li><strong>Envoi direct</strong> depuis ton appareil : glisse-dépose ou touche <strong>Importer</strong>. Tous les formats sont acceptés (JPEG, PNG, GIF, WebP, et le <strong>HEIC des iPhones</strong>), jusqu'à 25 Mo par photo.</li>
          <li>Onglet <strong>Albums</strong> : regroupe tes photos en albums, choisis une <strong>couverture</strong> et une visibilité (Privé / Amis / Public).</li>
          <li><strong>Partage un album</strong> à un ami précis, ou via un <strong>QR code / lien</strong> — il apparaît alors dans son onglet « Partagé avec moi ». Même une photo privée devient visible aux destinataires de l'album, sans changer sa visibilité ailleurs.</li>
          <li>Tes photos ne sont visibles que par toi et les personnes que tu choisis. Aucune reconnaissance faciale, aucun usage pour entraîner une IA.</li>
        </ul>
      </>
    ),
  },

  /* ── Partager ─────────────────────────────────────────────────────────── */
  {
    id: "expenses",
    cat: "share",
    icon: "expenses",
    title: "Dépenses partagées (façon Tricount)",
    summary: "Règle les comptes à plusieurs, sans prise de tête.",
    keywords: "dépenses partagées tricount groupe partage remboursement solde qui doit quoi équilibrer",
    to: "/depenses",
    cta: "Ouvrir les dépenses",
    body: (
      <>
        <p className="muted">Qui a payé quoi&nbsp;? Qui doit combien&nbsp;? MarieNour calcule tout pour toi.</p>
        <ul>
          <li>Crée un <strong>groupe</strong> et ajoute les participants (même non-inscrits, via QR / lien).</li>
          <li>Saisis les dépenses&nbsp;: les <strong>soldes</strong> se mettent à jour automatiquement.</li>
          <li>Obtiens le <strong>remboursement optimal</strong> pour équilibrer en un minimum de virements.</li>
        </ul>
      </>
    ),
  },
  {
    id: "feed",
    cat: "share",
    icon: "feed",
    title: "Le fil",
    summary: "Reste au courant de l'activité de tes proches.",
    keywords: "fil feed actualité activité amis publications social partage",
    to: "/feed",
    cta: "Ouvrir le fil",
    body: (
      <>
        <p className="muted">Une petite dose de social, à ton rythme et sans pression.</p>
        <ul>
          <li>Suis ce que partagent tes amis et réagis-y.</li>
          <li>Tu gardes la maîtrise de ce que tu publies et avec qui.</li>
        </ul>
      </>
    ),
  },
  {
    id: "friends",
    cat: "share",
    icon: "friends",
    title: "Amis & sondages",
    summary: "Relie tes proches et décidez ensemble.",
    keywords: "amis ami contacts sondage vote décision groupe relation inviter",
    to: "/amis",
    cta: "Ouvrir mes amis",
    body: (
      <>
        <p className="muted">Le cœur semi-social de MarieNour : tes proches, et des décisions prises à plusieurs.</p>
        <ul>
          <li>Ajoute des amis (QR / lien) et gère tes invitations.</li>
          <li>Lance un <strong>sondage</strong> pour trancher un choix de groupe en un instant.</li>
        </ul>
      </>
    ),
  },

  /* ── Compte & vie privée ──────────────────────────────────────────────── */
  {
    id: "profile",
    cat: "account",
    icon: "profile",
    title: "Mon profil & mon compte",
    summary: "Nom affiché, bio, avatar, couleur du thème.",
    keywords: "profil compte nom avatar bio pseudo handle email couleur accent",
    to: "/profil",
    cta: "Ouvrir mon profil",
    body: (
      <>
        <p className="muted">Personnalise la façon dont les autres te voient.</p>
        <ul>
          <li>Modifie ton <strong>nom affiché</strong>, ta <strong>bio</strong> et ta <strong>photo de profil</strong> (envoi direct depuis ton appareil — JPEG, PNG, HEIC…).</li>
          <li>Ton <strong>pseudo</strong> (@handle) sert à te retrouver et à te mentionner.</li>
          <li>Pour les <strong>couleurs, le thème et tout le reste</strong>, ouvre la page <strong>Personnalisation</strong> (lien en bas de ta fiche profil).</li>
        </ul>
      </>
    ),
  },
  {
    id: "privacy",
    cat: "account",
    icon: "lock",
    title: "Confidentialité & sécurité",
    summary: "Tes données t'appartiennent — sans pub, sans revente.",
    keywords: "confidentialité vie privée sécurité données rgpd cookie mot de passe chiffrement supprimer compte",
    to: "/confidentialite",
    cta: "Lire la politique",
    body: (
      <>
        <p className="muted">MarieNour est gratuit, sans publicité et ne revend jamais tes données.</p>
        <ul>
          <li>Mots de passe <strong>hachés</strong> (PBKDF2), échanges chiffrés (TLS), un seul cookie de session.</li>
          <li>Tu choisis précisément ce que tu partages et avec qui.</li>
          <li>Tu peux exporter ou <strong>supprimer ton compte et tes données</strong> à tout moment (écris à <a href={`mailto:${CONTACT}`}>{CONTACT}</a>).</li>
        </ul>
      </>
    ),
  },

  /* ── Questions fréquentes ─────────────────────────────────────────────── */
  {
    id: "faq-free",
    cat: "faq",
    icon: "heart",
    title: "MarieNour est-il vraiment gratuit ?",
    summary: "Oui, et ça le restera.",
    keywords: "gratuit prix payant abonnement publicité pub",
    body: (
      <p className="muted">
        Oui. MarieNour est et restera <strong>100&nbsp;% gratuit</strong>&nbsp;: aucun abonnement, aucune publicité,
        aucune revente de données. C'est un projet personnel d'AB&nbsp;Azur&nbsp;Tech, fourni « en l'état ».
        Pense simplement à exporter tes contenus importants de temps en temps.
      </p>
    ),
  },
  {
    id: "faq-account",
    cat: "faq",
    icon: "users",
    title: "Mes proches doivent-ils créer un compte ?",
    summary: "Pas toujours — un QR ou un lien suffit.",
    keywords: "compte invités amis sans inscription qr lien voyage dépenses",
    body: (
      <p className="muted">
        Pour les <strong>voyages</strong> et les <strong>dépenses partagées</strong>, tu peux inclure des proches
        <strong> pas encore inscrits</strong>. Pour devenir ami ou interagir dans le fil, un compte (gratuit) reste
        nécessaire. Dans tous les cas, l'ajout se fait en un scan de QR code ou via un lien.
      </p>
    ),
  },
  {
    id: "faq-offline",
    cat: "faq",
    icon: "download",
    title: "Puis-je l'utiliser hors connexion ?",
    summary: "Oui, en installant l'app sur ton appareil.",
    keywords: "hors-ligne offline pwa installer connexion internet avion",
    body: (
      <p className="muted">
        Installée sur ton écran d'accueil (PWA), MarieNour s'ouvre et reste consultable même <strong>sans
        connexion</strong>. Tes modifications se synchronisent dès que le réseau revient.
      </p>
    ),
  },
  {
    id: "faq-data",
    cat: "faq",
    icon: "eye",
    title: "Qui peut voir mes contenus ?",
    summary: "Toi, et uniquement les personnes que tu choisis.",
    keywords: "confidentialité privé visible partage voir contenus photos données",
    to: "/confidentialite",
    cta: "En savoir plus",
    body: (
      <p className="muted">
        Par défaut, tes contenus sont <strong>privés</strong>. Ils ne deviennent visibles par d'autres membres que
        lorsque tu décides explicitement de les partager (un voyage, un groupe de dépenses, ton profil public…).
        Tes photos sont stockées sur une infrastructure non exposée publiquement.
      </p>
    ),
  },
  {
    id: "faq-delete",
    cat: "faq",
    icon: "trash",
    title: "Comment supprimer mon compte ?",
    summary: "À tout moment, sur simple demande.",
    keywords: "supprimer compte effacer données départ résiliation",
    body: (
      <p className="muted">
        Tu peux quitter MarieNour quand tu veux. Écris à <a href={`mailto:${CONTACT}`}>{CONTACT}</a> pour demander la
        suppression de ton compte&nbsp;: tes données personnelles sont alors effacées, comme décrit dans la politique
        de confidentialité.
      </p>
    ),
  },
];

export default function Help() {
  const [query, setQuery] = useState("");
  // On ouvre sur « Premiers pas » : un nouveau venu voit d'abord l'essentiel,
  // pas les 19 rubriques d'un coup (« Tout » reste à portée d'onglet).
  const [cat, setCat] = useState<Cat["id"]>("start");
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();

  const toggle = (id: string) =>
    setOpenSet((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const visible = useMemo(
    () =>
      TOPICS.filter((t) => {
        if (cat !== "all" && t.cat !== cat) return false;
        if (!q) return true;
        return `${t.title} ${t.summary} ${t.keywords ?? ""}`.toLowerCase().includes(q);
      }),
    [cat, q]
  );

  const groups = CATS.filter((c) => c.id !== "all").map((c) => ({
    cat: c,
    items: visible.filter((t) => t.cat === c.id),
  }));

  const replayIntro = () => {
    try {
      localStorage.removeItem("mn_hide_intro");
    } catch {
      /* stockage indisponible */
    }
    // Rejoue le mot de bienvenue sans recharger la page (l'IntroTour, monté en
    // permanence, écoute cet événement).
    window.dispatchEvent(new Event("mn:replay-intro"));
  };

  const renderTopic = (t: Topic) => {
    const open = q ? true : openSet.has(t.id);
    return (
      <article className={`help-topic card${open ? " open" : ""}`} key={t.id}>
        <button className="help-topic-head" onClick={() => toggle(t.id)} aria-expanded={open}>
          <span className="help-topic-ic"><Icon name={t.icon} size={20} /></span>
          <span className="grow col" style={{ gap: 2 }}>
            <span className="help-topic-title">{t.title}</span>
            <span className="muted small">{t.summary}</span>
          </span>
          <span className={`help-chevron${open ? " open" : ""}`}><Icon name="arrowRight" size={18} /></span>
        </button>
        {open && (
          <div className="help-topic-body">
            <div className="help-topic-inner">
              {t.body}
              {t.to && (
                <div style={{ marginTop: "var(--space-3)" }}>
                  <Link to={t.to} className="btn btn-soft btn-sm">
                    {t.cta ?? "Ouvrir"} <Icon name="arrowRight" size={14} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <div>
      <div className="help-hero">
        <span className="help-hero-icon"><Icon name="lightbulb" size={34} strokeWidth={1.5} /></span>
        <span className="landing-eyebrow"><Icon name="sparkle" size={13} /> Centre d'aide</span>
        <h1 style={{ marginTop: "var(--space-3)" }}>Comment pouvons-nous t'aider&nbsp;?</h1>
        <p className="muted">Tout ce qu'il faut savoir pour tirer le meilleur de MarieNour.</p>

        <div className="help-search">
          <span className="help-search-ic"><Icon name="search" size={18} /></span>
          <input
            className="input"
            type="search"
            placeholder="Rechercher une fonctionnalité, une question…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher dans l'aide"
          />
          {query && (
            <button className="help-search-clear" onClick={() => setQuery("")} aria-label="Effacer la recherche">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="help-body">
        <div className="seg seg-scroll help-cats" role="tablist" aria-label="Catégories d'aide">
          {CATS.map((c) => (
            <button
              key={c.id}
              className={`seg-item${cat === c.id ? " active" : ""}`}
              onClick={() => setCat(c.id)}
              role="tab"
              aria-selected={cat === c.id}
            >
              <Icon name={c.icon} size={15} /> {c.label}
            </button>
          ))}
        </div>

        {q && (
          <p className="muted small center" style={{ marginBottom: "var(--space-4)" }}>
            {visible.length === 0
              ? "Aucun résultat"
              : `${visible.length} résultat${visible.length > 1 ? "s" : ""} pour « ${query.trim()} »`}
          </p>
        )}

        {visible.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="search"
              title="Aucune réponse trouvée"
              hint="Essaie d'autres mots-clés, ou écris-nous : on se fera un plaisir de t'aider."
              action={
                <a className="btn btn-primary" href={`mailto:${CONTACT}`}>
                  <Icon name="chat" size={16} /> Nous écrire
                </a>
              }
            />
          </div>
        ) : (
          groups.map(
            ({ cat: c, items }) =>
              items.length > 0 && (
                <section className="help-section" key={c.id}>
                  <h2 className="help-section-title">
                    <Icon name={c.icon} size={14} /> {c.label}
                  </h2>
                  <div className="help-topics">{items.map(renderTopic)}</div>
                </section>
              )
          )
        )}

        <div className="card help-contact">
          <span className="help-hero-icon" style={{ width: 60, height: 60, borderRadius: 18 }}>
            <Icon name="chat" size={28} strokeWidth={1.5} />
          </span>
          <h3 style={{ marginBottom: 4 }}>Encore une question&nbsp;?</h3>
          <p className="muted">Une suggestion, un souci, une idée&nbsp;? Écris-nous, on répond avec plaisir.</p>
          <div className="row gap-2 wrap" style={{ justifyContent: "center", marginTop: "var(--space-4)" }}>
            <a className="btn btn-primary" href={`mailto:${CONTACT}`}>
              <Icon name="chat" size={16} /> Nous écrire
            </a>
            <button className="btn btn-soft" onClick={replayIntro}>
              <Icon name="sparkle" size={16} /> Revoir l'introduction
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
