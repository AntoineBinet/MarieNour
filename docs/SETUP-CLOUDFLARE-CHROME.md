# Runbook « Claude dans Chrome » — déployer marienour sur Cloudflare

Ce document est un **script d'automatisation navigateur** : donne-le tel quel à
Claude dans Chrome pour qu'il configure le déploiement Cloudflare Pages tout seul.

> ⚠️ Avant de lancer l'agent, **remplace** `<<MOT_DE_PASSE_ADMIN>>` et
> `<<SESSION_SECRET>>` plus bas par tes vraies valeurs (ne les commite jamais).

---

## Contexte déjà en place (ne pas refaire)

- Base **D1 `marienour`** créée — `database_id = da427d20-5e7c-4e01-a8e5-aaec2ad48fed` (région WEUR), **schéma déjà appliqué**.
- Bucket **R2 `marienour-media`** créé.
- Le repo contient un `wrangler.toml` qui **déclare déjà** les bindings et variables :
  - binding D1 `DB` → base `marienour`
  - binding R2 `MEDIA` → bucket `marienour-media`
  - variables `ADMIN_EMAIL = binet.antoine215@yahoo.com`, `APP_NAME = marienour`
  - flag `nodejs_compat`, `pages_build_output_dir = dist`
  → Cloudflare Pages lit ce fichier : **ne PAS recréer ces bindings à la main.**
- Le code est sur `main` (repo GitHub **AntoineBinet/MarieNour**).
- **Seuls les secrets** (`ADMIN_PASSWORD`, `SESSION_SECRET`) ne sont pas dans le repo : c'est la seule chose à saisir, plus la connexion du repo et le domaine.

---

## Valeurs à utiliser

| Champ | Valeur |
| --- | --- |
| Repo GitHub | `AntoineBinet/MarieNour` |
| Branche de production | `main` |
| Nom du projet Pages | `marienour` |
| Preset framework | `None` (aucun) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(laisser vide / racine)* |
| Variable de build (si demandée) | `NODE_VERSION` = `20` |
| Secret 1 (chiffré) | `ADMIN_PASSWORD` = `<<MOT_DE_PASSE_ADMIN>>` |
| Secret 2 (chiffré) | `SESSION_SECRET` = `<<SESSION_SECRET>>` |
| Domaines | `marienour.work` **et** `www.marienour.work` |

---

## PROMPT À COLLER DANS CLAUDE (CHROME)

```
Tu pilotes le dashboard Cloudflare dans le navigateur pour déployer le projet
"marienour" (Cloudflare Pages connecté à GitHub). Je suis déjà connecté à
Cloudflare et à GitHub. Avance étape par étape, vérifie chaque écran avant de
cliquer, et si un libellé diffère de ce script, adapte-toi à l'intention (les
noms d'onglets du dashboard changent parfois). Ne saisis JAMAIS les secrets
ailleurs que dans les champs prévus, et marque-les bien comme chiffrés/"Secret".
NE recrée PAS les bindings D1/R2 ni les variables : ils sont déjà déclarés dans
le wrangler.toml du repo et Cloudflare les applique automatiquement.

ÉTAPE 1 — Créer le projet Pages connecté à Git
1. Va sur https://dash.cloudflare.com puis ouvre "Workers & Pages"
   (peut s'appeler "Compute" ou "Workers et Pages").
2. Clique "Create" / "Créer", choisis l'onglet "Pages", puis
   "Connect to Git" / "Se connecter à Git".
3. Autorise/installe l'app GitHub de Cloudflare si demandé, et donne-lui accès
   au dépôt "AntoineBinet/MarieNour". Sélectionne ce dépôt, puis "Begin setup".
4. Renseigne la configuration de build :
   - Project name : marienour
   - Production branch : main
   - Framework preset : None
   - Build command : npm run build
   - Build output directory : dist
   - (Si une section "Environment variables (build)" existe, ajoute
     NODE_VERSION = 20.)
5. Clique "Save and Deploy" / "Enregistrer et déployer".
6. Attends la fin du premier build (statut "Success"). S'il échoue, ouvre les
   logs de build, lis l'erreur, et signale-la-moi (ne devine pas un correctif
   qui modifierait le code).

POINT DE CONTRÔLE : le déploiement est "Success" et une URL *.pages.dev existe.

ÉTAPE 2 — Vérifier les bindings (ne pas les créer)
7. Ouvre le projet "marienour" → "Settings" → section
   "Functions" / "Bindings" / "Variables and Secrets".
8. Vérifie que ces éléments sont présents (issus du wrangler.toml) :
   - D1 binding "DB" → base "marienour"
   - R2 binding "MEDIA" → bucket "marienour-media"
   - Variables "ADMIN_EMAIL" et "APP_NAME"
   Si le dashboard indique que la config vient d'un fichier (wrangler.toml),
   c'est normal : ne modifie rien ici.
   Si — et seulement si — un binding manque ET que le dashboard te laisse
   l'ajouter, ajoute-le pour l'environnement Production :
   D1 "DB" → "marienour" ; R2 "MEDIA" → "marienour-media".

ÉTAPE 3 — Ajouter les 2 secrets (Production)
9. Dans "Variables and Secrets" (environnement Production), ajoute deux entrées
   de type "Secret" (chiffré / "Encrypt") :
   - Nom : ADMIN_PASSWORD   Valeur : <<MOT_DE_PASSE_ADMIN>>
   - Nom : SESSION_SECRET   Valeur : <<SESSION_SECRET>>
   Enregistre. (Si le dashboard refuse car la config vient d'un fichier,
   indique-le-moi : je les poserai via la CLI `wrangler pages secret put`.)

ÉTAPE 4 — Redéployer pour appliquer secrets + bindings
10. Va dans "Deployments", ouvre le dernier déploiement de production et clique
    "Retry deployment" / "Redeploy" (ou pousse un commit). Attends "Success".

ÉTAPE 5 — Rattacher le domaine
11. Projet "marienour" → onglet "Custom domains" → "Set up a custom domain".
12. Ajoute "marienour.work". Comme le domaine est déjà géré par Cloudflare,
    accepte la configuration DNS automatique (CNAME) et active le domaine.
13. Répète pour "www.marienour.work".
14. Attends que les deux domaines passent à "Active".

ÉTAPE 6 — Vérification finale
15. Ouvre https://marienour.work dans un nouvel onglet. L'écran de connexion
    "marienour" doit s'afficher.
16. Clique "Créer un compte" OU "Connexion" et entre :
    - Email : binet.antoine215@yahoo.com
    - Mot de passe : <<MOT_DE_PASSE_ADMIN>>
    Le premier login avec cet email crée automatiquement le compte ADMIN.
17. Confirme que le tableau de bord s'affiche et qu'un lien "Administration"
    apparaît dans le menu (preuve que le rôle admin est actif).

Rends-moi un compte rendu : URL de prod, statut des domaines, et capture du
tableau de bord connecté. Signale tout écran inattendu plutôt que de forcer.
```

---

## Repli CLI (si le dashboard verrouille la saisie des secrets)

Avec un `CLOUDFLARE_API_TOKEN` (permissions Pages) dans le terminal :

```bash
npx wrangler pages secret put ADMIN_PASSWORD   --project-name marienour
npx wrangler pages secret put SESSION_SECRET   --project-name marienour
# puis redéployer :
npm run deploy
```

## Dépannage rapide

- **Build échoue sur la version de Node** → ajouter la variable de build `NODE_VERSION=20`.
- **500 sur /api/** après déploiement → vérifier que les bindings `DB` et `MEDIA`
  apparaissent bien sur l'environnement *Production*, et qu'un **redéploiement** a
  eu lieu après l'ajout des secrets.
- **Le domaine reste "inactive"** → vérifier dans l'onglet DNS de la zone
  `marienour.work` qu'un enregistrement CNAME vers `marienour.pages.dev` existe.
