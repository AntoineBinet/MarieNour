# Runbook « Claude dans Chrome » — visibilité de marienour sur les moteurs

Ce document est un **script d'automatisation navigateur** (comme
[SETUP-CLOUDFLARE-CHROME.md](SETUP-CLOUDFLARE-CHROME.md)). Tu ouvres les onglets
indiqués (déjà connectés) et tu colles le **PROMPT** correspondant à *Claude dans
Chrome*, qui pilote les pages pour toi.

> 🧭 **Contexte.** marienour est un hub **personnel derrière authentification** :
> seule la page d'accueil est réellement indexable. Les leviers utiles sont donc
> (1) faire **connaître le site à Google** (Search Console + sitemap) et
> (2) garantir que **l'aperçu de lien** (Open Graph) est correct au partage.
>
> ⚠️ **Prérequis : la PR #22 doit être mergée ET déployée en prod**
> (`/admin` → « Mettre à jour », ou `deployment/update.sh`). Avant ça,
> `robots.txt`, `sitemap.xml` et les balises Open Graph ne sont pas servis, et
> tous les outils ci-dessous échoueront. Vérifie d'abord que ces 3 URL répondent :
> `https://marienour.work/robots.txt`, `https://marienour.work/sitemap.xml`,
> `https://marienour.work/og-image.png`.

---

## A. Google Search Console + sitemap (onglets : Google + Cloudflare)

> 🧭 **Onglets à ouvrir :**
> 1. **Google Search Console** — <https://search.google.com/search-console>
>    (connecté au compte Google qui suivra le site).
> 2. **Cloudflare** — <https://dash.cloudflare.com> → zone **marienour.work** →
>    **DNS** (pour la vérification par enregistrement TXT).

### PROMPT À COLLER DANS CLAUDE (CHROME)

```
Tu pilotes DEUX onglets déjà ouverts et connectés pour référencer le site
"marienour.work" dans Google Search Console :
  • Onglet A = Google Search Console (search.google.com/search-console)
  • Onglet B = Cloudflare (dash.cloudflare.com), zone marienour.work, page DNS
Avance étape par étape, vérifie chaque écran avant de cliquer, et si un libellé
diffère, adapte-toi à l'intention (les dashboards changent souvent de mots). Si
tu es bloqué sur un écran inattendu, arrête-toi et demande-moi plutôt que de
forcer.

DOMAINE = marienour.work

ÉTAPE 1 (Onglet A — Search Console) — Ajouter la propriété
1. En haut à gauche, ouvre le sélecteur de propriété → "Ajouter une propriété".
2. Choisis le type "Domaine" (couvre http/https, www et non-www d'un coup).
   Saisis : marienour.work  → Continuer.
3. Google affiche un enregistrement TXT de vérification à ajouter au DNS.
   COPIE la valeur complète (du type "google-site-verification=....").

ÉTAPE 2 (Onglet B — Cloudflare) — Créer l'enregistrement TXT
4. Va dans la zone marienour.work → DNS → Records → "Add record".
5. Type = TXT ; Name = @ (la racine) ; Content = colle la valeur copiée ;
   TTL = Auto. Enregistre. (Un TXT n'est jamais proxifié, c'est normal.)

ÉTAPE 3 (Onglet A — Search Console) — Vérifier
6. Reviens dans Search Console et clique "Vérifier". Si ça échoue, attends 1–2
   minutes (propagation DNS) puis réessaie. Cloudflare propage en général vite.

POINT DE CONTRÔLE : la propriété marienour.work est "validée".

ÉTAPE 4 (Onglet A) — Soumettre le sitemap
7. Menu de gauche → "Sitemaps". Dans "Ajouter un sitemap", saisis :
      sitemap.xml
   (l'URL complète sera https://marienour.work/sitemap.xml) → Envoyer.
8. Attends que l'état passe à "Réussite" (peut rester "En attente" un moment).

ÉTAPE 5 (Onglet A) — Forcer une 1re exploration
9. En haut, colle https://marienour.work/ dans "Inspection de l'URL" → Entrée.
10. Clique "Demander une indexation". (Si Google dit que l'URL n'est pas encore
    indexée, c'est normal pour un site neuf.)

Rends-moi un compte rendu : propriété validée (oui/non), état du sitemap, et
tout avertissement affiché. Ne touche à AUCUN autre enregistrement DNS.
```

---

## B. Vérifier et rafraîchir l'aperçu de lien (Open Graph)

> 🧭 **Onglets à ouvrir** (selon ce que tu utilises pour partager) :
> 1. **Facebook Sharing Debugger** — <https://developers.facebook.com/tools/debug/>
>    (force le rafraîchissement du cache de Facebook **et** WhatsApp/Messenger).
> 2. **LinkedIn Post Inspector** — <https://www.linkedin.com/post-inspector/>
> 3. *(sans connexion)* **OpenGraph.xyz** — <https://www.opengraph.xyz/>

### PROMPT À COLLER DANS CLAUDE (CHROME)

```
Tu vérifies l'aperçu de lien (Open Graph) de https://marienour.work/ et tu forces
le rafraîchissement des caches. Avance outil par outil ; pour chacun, saisis
l'URL https://marienour.work/ et lance l'analyse.

1. Facebook Sharing Debugger (developers.facebook.com/tools/debug) :
   - Colle l'URL, clique "Déboguer", puis clique "Scrape Again" / "Récupérer à
     nouveau" pour purger le cache.
   - Vérifie que s'affichent : un titre, une description et une IMAGE (la
     bannière 1200×630). Note tout avertissement (ex. og:image manquante).

2. LinkedIn Post Inspector (linkedin.com/post-inspector) :
   - Colle l'URL, lance l'inspection (ça rafraîchit aussi le cache LinkedIn).
   - Vérifie l'aperçu (titre + description + image).

3. OpenGraph.xyz (opengraph.xyz) :
   - Colle l'URL et confirme l'aperçu multi-plateformes (Facebook, X, LinkedIn,
     iMessage, etc.).

Rends-moi pour chaque outil : l'aperçu obtenu (titre / description / image OK ?)
et la liste des éventuels avertissements. Si l'image n'apparaît pas, dis-le-moi
(souvent : déploiement pas encore fait, ou cache à re-purger).
```

---

## C. (Optionnel) Bing / autres moteurs

> 🧭 **Onglet :** **Bing Webmaster Tools** — <https://www.bing.com/webmasters>

### PROMPT À COLLER DANS CLAUDE (CHROME)

```
Tu ajoutes marienour.work à Bing Webmaster Tools (bing.com/webmasters).
1. Connecte-toi, puis "Ajouter un site".
2. Si l'option "Importer depuis Google Search Console" est proposée, utilise-la
   (vérification automatique, le plus simple — il faut que la propriété GSC
   existe déjà, cf. runbook section A).
3. Sinon : ajoute https://marienour.work/ et vérifie via l'enregistrement DNS
   (onglet Cloudflare → zone marienour.work → DNS → TXT, même principe que GSC).
4. Une fois vérifié, soumets le sitemap : https://marienour.work/sitemap.xml

Rends-moi : site vérifié (oui/non) et état du sitemap.
```

---

## À savoir / limites

- **Tout est derrière login** : Google n'indexera réellement que la page
  d'accueil. C'est voulu — le `robots.txt` autorise l'indexation, bloque `/api/`,
  et la balise `<link rel="canonical">` consolide les routes de l'app vers
  l'accueil.
- **L'indexation prend des jours/semaines** : soumettre le sitemap accélère la
  découverte, mais le classement dépend surtout du fait que des gens **cherchent
  et cliquent** « marienour ». Pour un hub perso partagé entre proches, l'aperçu
  de lien (section B) a plus d'impact au quotidien que le rang Google.
- **Rafraîchir l'image après chaque changement** : si tu modifies `og-image.png`
  ou les balises, repasse par le Facebook Debugger (« Scrape Again ») sinon
  l'ancien aperçu reste en cache plusieurs jours.
