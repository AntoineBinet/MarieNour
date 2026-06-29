import { Link } from "react-router-dom";
import type { ReactNode } from "react";

const CONTACT = "binet.antoine2@gmail.com";

type LegalPage = "mentions" | "cgu" | "confidentialite";

const LEGAL_LINKS: { key: LegalPage; to: string; label: string }[] = [
  { key: "mentions", to: "/mentions-legales", label: "Mentions légales" },
  { key: "cgu", to: "/cgu", label: "Conditions d'utilisation" },
  { key: "confidentialite", to: "/confidentialite", label: "Confidentialité" },
];

function LegalNav({ current }: { current: LegalPage }) {
  return (
    <nav className="legal-nav" aria-label="Documents légaux">
      {LEGAL_LINKS.map((l) =>
        l.key === current ? (
          <span key={l.key} className="legal-nav-current" aria-current="page">{l.label}</span>
        ) : (
          <Link key={l.key} to={l.to}>{l.label}</Link>
        )
      )}
    </nav>
  );
}

function LegalShell({
  eyebrow,
  title,
  current,
  children,
}: {
  eyebrow: string;
  title: string;
  current: LegalPage;
  children: ReactNode;
}) {
  return (
    <div className="auth-wrap" style={{ alignItems: "start", padding: "var(--space-6) var(--space-4)" }}>
      <div className="card" style={{ width: "100%", maxWidth: 720 }}>
        <div className="center" style={{ marginBottom: "var(--space-5)" }}>
          <p className="muted small" style={{ letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 600 }}>
            {eyebrow}
          </p>
          <h1 style={{ marginTop: "var(--space-2)" }}>{title}</h1>
          <p className="muted small">Dernière mise à jour&nbsp;: juin 2026.</p>
        </div>

        <LegalNav current={current} />

        {children}

        <LegalNav current={current} />

        <div className="center" style={{ marginTop: "var(--space-5)" }}>
          <Link className="btn btn-soft" to="/">← Retour à l'application</Link>
        </div>
        <p className="muted small center" style={{ marginTop: "var(--space-4)" }}>
          MarieNour est un service de <strong>AB&nbsp;Azur&nbsp;Tech</strong>, micro-entreprise d'Antoine Binet.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: "var(--space-5)" }}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-2)" }}>{title}</h2>
      <div className="muted" style={{ lineHeight: 1.65 }}>{children}</div>
    </section>
  );
}

export function Mentions() {
  return (
    <LegalShell eyebrow="Informations légales" title="Mentions légales" current="mentions">
      <Section title="Éditeur du site">
        Le site et l'application <strong>MarieNour</strong> (marienour.work) sont créés et édités par{" "}
        <strong>Antoine Binet</strong>, entrepreneur individuel exerçant{" "}
        <strong>en micro-entreprise</strong> sous le nom commercial «&nbsp;AB&nbsp;Azur&nbsp;Tech&nbsp;».<br />
        Forme juridique&nbsp;: Entreprise individuelle — micro-entreprise.<br />
        Siège social&nbsp;: communiqué sur simple demande à{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.<br />
        SIREN&nbsp;: 106&nbsp;050&nbsp;313 · 106&nbsp;050&nbsp;313 R.C.S. Lyon (immatriculé le 09/06/2026).<br />
        TVA&nbsp;: TVA non applicable — article 293&nbsp;B du CGI (franchise en base).<br />
        Directeur de la publication&nbsp;: Antoine Binet.<br />
        Contact&nbsp;: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </Section>

      <Section title="Lien avec AB Azur Tech">
        MarieNour fait partie des applications conçues et publiées par{" "}
        <strong>AB&nbsp;Azur&nbsp;Tech</strong>, le nom commercial sous lequel Antoine Binet développe ses
        services (voir aussi le portfolio <a href="https://ab-azurtech.com" target="_blank" rel="noopener noreferrer">ab-azurtech.com</a>).
        Il s'agit d'une <strong>application personnelle et gratuite</strong>, indépendante&nbsp;: AB&nbsp;Azur&nbsp;Tech
        en est l'éditeur, le responsable de traitement et le seul interlocuteur. Aucune autre société n'est
        impliquée dans l'exploitation du service.
      </Section>

      <Section title="Hébergement">
        Le site est hébergé sur <strong>Oracle Cloud Infrastructure</strong> (Oracle Corporation —
        infrastructure cloud, région de l'Union européenne) et servi via le réseau{" "}
        <strong>Cloudflare,&nbsp;Inc.</strong> (101 Townsend Street, San Francisco, CA 94107, USA) pour le
        chiffrement TLS et la diffusion. Le serveur applicatif et la base de données ne sont jamais exposés
        directement à Internet.
      </Section>

      <Section title="Propriété intellectuelle">
        L'interface, le code, le nom et les visuels de MarieNour sont, sauf mention contraire, la propriété
        d'Antoine Binet (AB Azur Tech). Les contenus que vous publiez (textes, photos, listes, etc.) restent
        votre propriété&nbsp;; vous nous accordez uniquement le droit de les héberger et de les afficher pour
        faire fonctionner le service. Toute reproduction non autorisée de l'application est interdite.
      </Section>

      <Section title="Conditions d'utilisation & données personnelles">
        L'usage de MarieNour est régi par nos{" "}
        <Link to="/cgu">conditions générales d'utilisation</Link>. Le traitement de vos données est décrit
        dans notre <Link to="/confidentialite">politique de confidentialité</Link>.
      </Section>

      <Section title="Signalement">
        Pour signaler un contenu illicite, un abus ou tout problème, écrivez à{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </Section>
    </LegalShell>
  );
}

export function CGU() {
  return (
    <LegalShell eyebrow="Conditions d'utilisation" title="Conditions générales d'utilisation" current="cgu">
      <p className="muted" style={{ lineHeight: 1.65 }}>
        Les présentes conditions générales d'utilisation (les «&nbsp;CGU&nbsp;») encadrent l'accès et
        l'usage de l'application <strong>MarieNour</strong>. En créant un compte ou en utilisant le service,
        vous acceptez ces CGU. Si vous ne les acceptez pas, n'utilisez pas l'application.
      </p>

      <Section title="1. Objet & éditeur">
        MarieNour est un <strong>hub personnel</strong> permettant d'organiser et de partager des contenus
        (listes, notes, voyages, recettes, inspirations, photos, dépenses partagées, etc.). Le service est
        édité par <strong>Antoine Binet</strong>, micro-entreprise exerçant sous le nom{" "}
        <strong>AB&nbsp;Azur&nbsp;Tech</strong> (voir les{" "}
        <Link to="/mentions-legales">mentions légales</Link>).
      </Section>

      <Section title="2. Une application 100 % gratuite, fournie « en l'état »">
        MarieNour est et restera une <strong>application gratuite</strong>&nbsp;: aucun paiement, aucun
        abonnement, aucune publicité, aucune revente de vos données. En contrepartie, le service est fourni{" "}
        <strong>«&nbsp;en l'état&nbsp;»</strong> et «&nbsp;selon disponibilité&nbsp;», sans garantie de
        résultat, de disponibilité continue ni d'absence d'erreur. Il s'agit d'un projet personnel&nbsp;:
        l'éditeur peut le faire évoluer, le suspendre ou l'arrêter à tout moment, en vous informant dans la
        mesure du possible. <strong>Pensez à exporter vos contenus importants</strong>&nbsp;: aucune
        obligation de sauvegarde ou de restauration n'est garantie.
      </Section>

      <Section title="3. Compte & accès">
        L'accès nécessite la création d'un compte avec une adresse e-mail valide et un mot de passe. Vous
        vous engagez à fournir des informations exactes, à garder votre mot de passe confidentiel et à nous
        signaler tout usage non autorisé. Vous êtes responsable de l'activité réalisée depuis votre compte.
        Le service s'adresse à des personnes <strong>âgées d'au moins 15&nbsp;ans</strong>&nbsp;; en deçà,
        l'accord d'un titulaire de l'autorité parentale est requis.
      </Section>

      <Section title="4. Vos contenus">
        Vous restez <strong>propriétaire</strong> des contenus que vous publiez. Vous nous accordez
        seulement une licence limitée, non exclusive et gratuite, le temps de votre utilisation, pour les{" "}
        <strong>stocker, traiter et afficher</strong> dans le seul but de faire fonctionner le service
        (y compris auprès des membres avec qui vous choisissez de partager). Vous êtes seul responsable de
        ce que vous publiez et garantissez disposer des droits nécessaires.
      </Section>

      <Section title="5. Photos & droit à l'image">
        Lorsque vous importez des <strong>photos ou médias</strong>, vous garantissez en détenir les droits
        et avoir recueilli, le cas échéant, le <strong>consentement des personnes représentées</strong>
        {" "}(droit à l'image). N'importez pas de photos de tiers — en particulier de mineurs — sans leur
        accord. Les photos sont stockées sur une infrastructure dédiée et non exposée publiquement&nbsp;;
        elles ne sont visibles que par vous et par les membres avec qui vous les partagez explicitement.
        Nous ne procédons à <strong>aucune reconnaissance faciale</strong> et n'utilisons jamais vos médias
        pour entraîner des modèles d'intelligence artificielle. Voir la{" "}
        <Link to="/confidentialite">politique de confidentialité</Link>.
      </Section>

      <Section title="6. Règles d'usage">
        Vous vous engagez à ne pas&nbsp;: (a) publier de contenu illicite, haineux, diffamatoire,
        harcelant, violent ou portant atteinte aux droits d'autrui&nbsp;; (b) usurper l'identité d'un tiers
        ou collecter ses données sans son accord&nbsp;; (c) tenter de contourner la sécurité, surcharger,
        copier massivement (scraping) ou perturber le service&nbsp;; (d) utiliser MarieNour à des fins
        commerciales, de spam ou frauduleuses. Tout manquement peut entraîner la suspension du compte.
      </Section>

      <Section title="7. Partage & dimension sociale">
        MarieNour est semi-social&nbsp;: vous pouvez relier des amis, partager des voyages, des dépenses ou
        un profil public. Les contenus que vous <strong>choisissez de partager</strong> deviennent visibles
        par les membres concernés. Vous gardez la maîtrise de ce que vous partagez et avec qui&nbsp;;
        respectez en retour la vie privée des autres membres.
      </Section>

      <Section title="8. Disponibilité, maintenance & évolutions">
        Le service peut être interrompu pour maintenance, mise à jour ou raison technique, sans préavis.
        Les fonctionnalités peuvent évoluer, apparaître ou disparaître. Étant gratuit, MarieNour n'offre
        aucun engagement de niveau de service (SLA) ni de support garanti.
      </Section>

      <Section title="9. Responsabilité">
        Dans les limites permises par la loi, et compte tenu du caractère <strong>gratuit</strong> du
        service, la responsabilité de l'éditeur ne saurait être engagée pour les dommages indirects, la
        perte de données, l'indisponibilité du service ou l'usage que vous faites des contenus. Vous
        utilisez MarieNour sous votre propre responsabilité. Rien dans ces CGU n'exclut la responsabilité
        qui ne peut l'être en droit français (notamment en cas de faute lourde ou dolosive).
      </Section>

      <Section title="10. Suspension & résiliation">
        Vous pouvez cesser d'utiliser le service et <strong>supprimer votre compte</strong> à tout moment
        (depuis votre profil ou sur demande à <a href={`mailto:${CONTACT}`}>{CONTACT}</a>)&nbsp;; vos
        données personnelles sont alors supprimées comme décrit dans la politique de confidentialité.
        L'éditeur peut suspendre ou fermer un compte en cas de violation des présentes CGU ou d'arrêt du
        service.
      </Section>

      <Section title="11. Données personnelles">
        Le traitement de vos données personnelles est détaillé dans notre{" "}
        <Link to="/confidentialite">politique de confidentialité</Link>, conforme au RGPD.
      </Section>

      <Section title="12. Modification des CGU">
        Ces CGU peuvent être mises à jour pour suivre l'évolution du service ou de la réglementation. La
        version applicable est celle publiée sur cette page&nbsp;; la date de dernière mise à jour figure en
        en-tête. En continuant à utiliser le service, vous acceptez la version en vigueur.
      </Section>

      <Section title="13. Droit applicable & litiges">
        Les présentes CGU sont régies par le <strong>droit français</strong>. En cas de différend, une
        solution amiable sera recherchée en priorité (contact&nbsp;:{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>). À défaut, les tribunaux français sont compétents. Un
        consommateur peut également recourir à un médiateur de la consommation ou saisir la plateforme
        européenne de règlement en ligne des litiges.
      </Section>
    </LegalShell>
  );
}

export function Confidentialite() {
  return (
    <LegalShell eyebrow="Vie privée" title="Politique de confidentialité" current="confidentialite">
      <p className="muted" style={{ lineHeight: 1.65 }}>
        MarieNour accorde une grande importance à la protection de vos données. Cette page, conforme au{" "}
        <strong>Règlement général sur la protection des données (RGPD)</strong>, explique quelles données
        sont traitées, pourquoi, combien de temps, avec qui, et comment exercer vos droits.
      </p>

      <Section title="Responsable du traitement">
        <strong>Antoine Binet</strong> — entrepreneur individuel (micro-entreprise) exerçant sous le nom
        commercial «&nbsp;AB&nbsp;Azur&nbsp;Tech&nbsp;», SIREN&nbsp;106&nbsp;050&nbsp;313. Contact pour toute
        question relative à vos données&nbsp;: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </Section>

      <Section title="Données que nous traitons">
        <ul style={{ margin: 0, paddingLeft: "1.2em", display: "grid", gap: 4 }}>
          <li><strong>Compte</strong>&nbsp;: adresse e-mail et mot de passe (stocké uniquement sous forme chiffrée / haché, jamais en clair).</li>
          <li><strong>Profil</strong>&nbsp;: nom affiché, identifiant public (handle), avatar éventuel.</li>
          <li><strong>Vos contenus</strong>&nbsp;: listes, notes, voyages, recettes, inspirations, dépenses, et <strong>photos / médias</strong> que vous importez.</li>
          <li><strong>Relations</strong>&nbsp;: liens d'amitié, membres de vos voyages ou groupes de dépenses, éléments partagés.</li>
          <li><strong>Données techniques</strong>&nbsp;: un cookie de session strictement nécessaire (httpOnly) et des journaux techniques minimaux pour la sécurité et le bon fonctionnement.</li>
        </ul>
        Nous ne demandons aucune donnée que le service ne nécessite pas, et il n'y a ni traceur publicitaire
        ni outil d'analyse comportementale.
      </Section>

      <Section title="Photos & médias">
        Vos photos et médias sont stockés sur une <strong>infrastructure dédiée et non exposée
        publiquement</strong> (Oracle Cloud, région UE). Ils ne sont accessibles qu'à vous et aux membres
        avec qui vous les partagez explicitement. Nous&nbsp;: <strong>ne pratiquons aucune reconnaissance
        faciale</strong>, <strong>n'analysons pas le contenu de vos images</strong>, <strong>ne les
        utilisons jamais pour entraîner une intelligence artificielle</strong> et ne les revendons ni ne les
        cédons à des tiers. Les fichiers peuvent contenir des métadonnées (EXIF&nbsp;: date, parfois
        géolocalisation) que vous intégrez vous-même&nbsp;; pensez-y avant de partager. En important une
        photo, vous confirmez disposer des droits et du consentement des personnes représentées (voir les{" "}
        <Link to="/cgu">CGU</Link>).
      </Section>

      <Section title="Finalités & base légale">
        Vos données servent uniquement à <strong>faire fonctionner votre hub</strong> (créer votre compte,
        afficher vos contenus, permettre le partage que vous décidez) et à assurer la sécurité du service.
        La base légale est l'<strong>exécution du service</strong> que vous demandez (contrat) et, pour les
        partages sociaux, votre <strong>consentement</strong>. Vos données ne sont ni revendues ni utilisées
        à des fins publicitaires.
      </Section>

      <Section title="Cookies & traceurs">
        MarieNour utilise un seul <strong>cookie de session</strong>, strictement nécessaire pour vous
        garder connecté (httpOnly, sécurisé). Aucun cookie publicitaire, aucun pisteur tiers, aucun outil de
        statistiques&nbsp;: aucune bannière de consentement n'est donc requise.
      </Section>

      <Section title="Destinataires & sous-traitants">
        Vos données ne sont partagées qu'avec les <strong>membres que vous choisissez</strong> et avec nos
        prestataires techniques d'hébergement&nbsp;: <strong>Oracle Cloud Infrastructure</strong> (serveurs
        et stockage, région de l'Union européenne) et <strong>Cloudflare,&nbsp;Inc.</strong> (chiffrement
        TLS et diffusion). Ces prestataires agissent comme sous-traitants et n'utilisent pas vos données pour
        leur propre compte. Aucune autre cession à des tiers n'a lieu.
      </Section>

      <Section title="Durée de conservation">
        Vos données sont conservées <strong>tant que votre compte est actif</strong>. Elles sont supprimées
        sur votre demande, à la suppression de votre compte, ou après une période prolongée d'inactivité.
        Certaines informations techniques minimales peuvent être conservées brièvement pour des raisons de
        sécurité.
      </Section>

      <Section title="Sécurité">
        Les échanges sont chiffrés (TLS), les mots de passe sont stockés <strong>hachés</strong> (PBKDF2),
        les sessions reposent sur un cookie httpOnly, et la base de données comme les médias sont hébergés
        sur une infrastructure <strong>non exposée publiquement</strong>. Nous appliquons des mesures
        raisonnables pour protéger vos données, sans qu'une sécurité absolue puisse être garantie.
      </Section>

      <Section title="Vos droits (RGPD)">
        Vous disposez d'un droit d'<strong>accès</strong>, de <strong>rectification</strong>,
        d'<strong>effacement</strong>, de <strong>portabilité</strong> (export de vos données),
        d'<strong>opposition</strong> et de <strong>limitation</strong> du traitement. Depuis votre{" "}
        <strong>profil</strong>, vous pouvez directement <strong>exporter toutes vos données</strong> (JSON) et{" "}
        <strong>supprimer définitivement votre compte</strong>. Pour toute autre demande, écrivez à{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Vous pouvez aussi introduire une réclamation auprès de
        la <strong>CNIL</strong> (<a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">cnil.fr</a>).
      </Section>

      <Section title="Mineurs">
        Le service s'adresse aux personnes d'au moins 15&nbsp;ans. Si vous pensez qu'un mineur nous a
        transmis des données sans l'accord requis, contactez-nous pour leur suppression.
      </Section>

      <Section title="Modifications">
        Cette politique peut être mise à jour pour refléter une évolution du service ou de la
        réglementation&nbsp;; la date de dernière mise à jour figure en en-tête de cette page.
      </Section>
    </LegalShell>
  );
}
