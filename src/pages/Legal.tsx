import { Link } from "react-router-dom";
import type { ReactNode } from "react";

const CONTACT = "binet.antoine2@gmail.com";

function LegalShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="auth-wrap" style={{ alignItems: "start", padding: "var(--space-6) var(--space-4)" }}>
      <div className="card" style={{ width: "100%", maxWidth: 720 }}>
        <div className="center" style={{ marginBottom: "var(--space-5)" }}>
          <p className="muted small" style={{ letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 600 }}>
            {eyebrow}
          </p>
          <h1 style={{ marginTop: "var(--space-2)" }}>{title}</h1>
          <p className="muted small">Dernière mise à jour&nbsp;: 2026.</p>
        </div>

        {children}

        <div className="center" style={{ marginTop: "var(--space-5)" }}>
          <Link className="btn btn-soft" to="/login">← Retour</Link>
        </div>
        <p className="muted small center" style={{ marginTop: "var(--space-4)" }}>
          Site créé par Antoine Binet, sous la micro-société AB&nbsp;Azur&nbsp;Tech.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: "var(--space-5)" }}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "var(--space-2)" }}>{title}</h2>
      <p className="muted" style={{ lineHeight: 1.65 }}>{children}</p>
    </section>
  );
}

export function Mentions() {
  return (
    <LegalShell eyebrow="Informations légales" title="Mentions légales">
      <Section title="Éditeur du site">
        Le site <strong>marienour</strong> (marienour.work) est créé et édité par{" "}
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

      <Section title="Hébergement">
        Le site est hébergé sur <strong>Oracle Cloud Infrastructure</strong> (infrastructure cloud,
        Union européenne) et servi via le réseau <strong>Cloudflare, Inc.</strong> (101 Townsend
        Street, San Francisco, CA 94107, USA) pour le chiffrement TLS et la diffusion. Le port
        applicatif n'est jamais exposé directement à Internet.
      </Section>

      <Section title="Propriété intellectuelle">
        L'interface, le code et les visuels du site sont, sauf mention contraire, la propriété
        d'Antoine Binet (AB Azur Tech). Les contenus publiés par les utilisateurs restent leur
        propriété. Toute reproduction non autorisée est interdite.
      </Section>

      <Section title="Données personnelles">
        marienour est un espace personnel accessible après création de compte. Le traitement des
        données est décrit dans notre{" "}
        <Link to="/confidentialite">politique de confidentialité</Link>.
      </Section>
    </LegalShell>
  );
}

export function Confidentialite() {
  return (
    <LegalShell eyebrow="Vie privée" title="Politique de confidentialité">
      <p className="muted" style={{ lineHeight: 1.65 }}>
        marienour accorde de l'importance à la protection de vos données. Cette page explique
        quelles données sont traitées, pourquoi, et comment exercer vos droits.
      </p>

      <Section title="Responsable du traitement">
        <strong>Antoine Binet</strong> — entrepreneur individuel (micro-entreprise) exerçant sous le
        nom commercial «&nbsp;AB&nbsp;Azur&nbsp;Tech&nbsp;», SIREN 106&nbsp;050&nbsp;313. Contact&nbsp;:{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </Section>

      <Section title="Données traitées et finalité">
        À la création de votre compte, nous traitons votre <strong>e-mail</strong> et un{" "}
        <strong>mot de passe</strong> (stocké chiffré). Au sein de votre espace, vous pouvez
        enregistrer des <strong>contenus personnels</strong> (listes, notes, voyages, recettes,
        inspirations, photos) et des <strong>liens d'amitié</strong> avec d'autres membres. Ces
        données servent uniquement à faire fonctionner votre hub&nbsp;; elles ne sont ni revendues
        ni utilisées à des fins publicitaires.
      </Section>

      <Section title="Dimension sociale">
        marienour est semi-social&nbsp;: certains contenus que vous choisissez de partager (profil
        public, éléments partagés avec vos amis, fil d'activité) deviennent visibles par les membres
        concernés. Vous gardez la maîtrise de ce que vous partagez.
      </Section>

      <Section title="Base légale, conservation et sécurité">
        Le traitement repose sur l'exécution du service et sur votre consentement. Vos données sont
        conservées tant que votre compte est actif, puis supprimées sur demande ou après une période
        d'inactivité. Les échanges sont chiffrés (TLS) et les médias sont stockés sur une
        infrastructure dédiée, non exposée publiquement.
      </Section>

      <Section title="Vos droits">
        Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement,
        d'opposition et de portabilité de vos données. Pour les exercer, écrivez à{" "}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Vous pouvez également introduire une réclamation
        auprès de la CNIL.
      </Section>
    </LegalShell>
  );
}
