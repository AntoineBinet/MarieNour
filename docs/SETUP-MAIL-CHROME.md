# Runbook « Claude dans Chrome » — activer les e-mails (notification d'inscription)

Ce document est un **script d'automatisation navigateur**. Tu ouvres **deux
onglets** (déjà connectés) et tu colles le **PROMPT** plus bas à *Claude dans
Chrome* : il génère un **mot de passe d'application Gmail**, puis le pose sur la
VM pour que marienour t'envoie un e-mail **à chaque nouvelle inscription**
(expéditeur **et** destinataire : `binet.antoine2@gmail.com`, déjà câblés ; tu
n'as donc que le **mot de passe d'application** à poser).

```
Nouvelle inscription → server/routes/auth.ts → server/mailer.ts
   → SMTP (nodemailer, server/adapters/smtp.ts) → Gmail → ta boîte
```

> 🧭 **Les deux onglets à ouvrir :**
> 1. **Google** — <https://myaccount.google.com> (connecté au compte
>    **binet.antoine2@gmail.com** qui **enverra ET recevra** les notifications).
> 2. **Oracle Cloud** — <https://cloud.oracle.com> (pour ouvrir une *Cloud Shell*
>    et se connecter en SSH à la VM `marienour`).
>
> ⚠️ Avant de lancer l'agent, **remplace** dans le PROMPT les `<<...>>` par tes
> vraies valeurs. Le **mot de passe d'application** est un secret : il ne doit
> finir QUE dans le fichier d'env de la VM (jamais commité, jamais collé ailleurs).

---

## Pré-requis

- La VM Oracle est déjà en ligne (cf. [SETUP-CLOUDFLARE-CHROME.md](SETUP-CLOUDFLARE-CHROME.md)),
  avec la clé SSH `~/.ssh/marienour` dans la Cloud Shell et l'IP publique connue.
- Le compte Gmail expéditeur a (ou peut activer) la **validation en 2 étapes** —
  c'est obligatoire pour créer un « mot de passe d'application ».

## Valeurs à utiliser

| Champ | Valeur |
| --- | --- |
| Compte Gmail expéditeur (déjà câblé) | `binet.antoine2@gmail.com` (= `SMTP_USER`) |
| IP publique de la VM | `<<IP_PUBLIQUE_VM>>` |
| Destinataire (déjà câblé) | `binet.antoine2@gmail.com` (= `NOTIFY_EMAIL`) |
| Fichier d'env (VM) | `/etc/marienour/marienour.env` (600 root:root) |

---

## PROMPT À COLLER DANS CLAUDE (CHROME)

```
Tu pilotes DEUX onglets déjà ouverts et connectés pour activer l'envoi d'e-mails
de mon app "marienour" (une notification à chaque nouvelle inscription) via le
SMTP de Gmail :
  • Onglet A = Google (myaccount.google.com), connecté au compte binet.antoine2@gmail.com (expéditeur ET destinataire)
  • Onglet B = Oracle Cloud (cloud.oracle.com) — pour la Cloud Shell et le SSH vers ma VM

Avance étape par étape, vérifie chaque écran avant d'agir, et adapte-toi si un
libellé diffère (les pages Google changent souvent de mots). Ne saisis JAMAIS un
secret hors du champ prévu. Le "mot de passe d'application" est sensible : ne
l'écris nulle part ailleurs que dans le fichier d'env de la VM (ÉTAPE 3). Si tu
es bloqué sur un écran inattendu, arrête-toi et demande-moi plutôt que de forcer.

Valeurs :
  GMAIL = binet.antoine2@gmail.com     (expéditeur, déjà câblé comme SMTP_USER par défaut)
  VM_IP = <<IP_PUBLIQUE_VM>>

────────────────────────────────────────────────────────────────────────
ÉTAPE 0 (Onglet B — VM) — Mettre l'app à jour (récupère le code d'envoi SMTP)
1. Va sur l'onglet Oracle, clique l'icône "Cloud Shell" (un terminal s'ouvre).
2. Connecte-toi à la VM (remplace l'IP) :
      ssh -o StrictHostKeyChecking=accept-new -i ~/.ssh/marienour ubuntu@<<IP_PUBLIQUE_VM>>
3. Mets l'app à jour (git pull + npm ci + build + restart) :
      cd /opt/marienour/app && bash deployment/update.sh
   Attends "marienour à jour et en ligne". C'est CETTE version qui sait envoyer
   par SMTP — ne saute pas cette étape.

ÉTAPE 1 (Onglet A — Google) — Vérifier la validation en 2 étapes
4. Ouvre https://myaccount.google.com/security
5. Trouve "Validation en 2 étapes" : elle doit être ACTIVÉE. Si elle est
   désactivée, les "mots de passe d'application" n'existent pas : active-la
   d'abord (elle réclame un numéro de téléphone) PUIS reviens. Si tu ne peux pas
   (besoin du téléphone), arrête-toi et préviens-moi.

ÉTAPE 2 (Onglet A — Google) — Créer un mot de passe d'application
6. Ouvre https://myaccount.google.com/apppasswords  (reconnecte-toi si demandé).
7. Dans le champ "Nom de l'application", saisis :  marienour   puis clique "Créer".
8. Google affiche un code de 16 lettres (4 blocs de 4). COPIE-le et RETIRE LES
   ESPACES → tu obtiens 16 caractères collés (ex. abcdefghijklmnop). Garde-le
   pour l'ÉTAPE 3. ⚠️ Il ne sera PLUS réaffiché : ne ferme pas cette fenêtre
   avant d'avoir fini l'ÉTAPE 3.

ÉTAPE 3 (Onglet B — VM) — Écrire le mot de passe SMTP
9. Reviens à la Cloud Shell (session SSH sur la VM). L'expéditeur
   (SMTP_USER=binet.antoine2@gmail.com) est DÉJÀ le défaut du code : il ne reste
   qu'à poser le mot de passe d'application. Exécute (MDP_APP_16 = le code de
   l'ÉTAPE 2 sans espaces) :
      sudo sed -i '/^[# ]*SMTP_PASS=/d' /etc/marienour/marienour.env
      printf 'SMTP_PASS=%s\n' "MDP_APP_16" \
        | sudo tee -a /etc/marienour/marienour.env >/dev/null
      sudo chmod 600 /etc/marienour/marienour.env
   (Si tu veux un AUTRE compte expéditeur que binet.antoine2@gmail.com, ajoute
   aussi une ligne SMTP_USER=ton.adresse@gmail.com.)
10. Redémarre et vérifie que les e-mails NE sont PLUS désactivés :
      sudo systemctl restart marienour
      sleep 2 && journalctl -u marienour -n 20 --no-pager
    Tu NE dois PLUS voir la ligne "e-mails désactivés (SMTP_USER/SMTP_PASS absents)" :
    SMTP_USER étant déjà câblé, seul SMTP_PASS te manquait.
    Le service doit être "active (running)" et l'API répondre.

ÉTAPE 4 — Test réel de bout en bout
11. Ouvre https://marienour.work dans un nouvel onglet → écran de connexion →
    "Créer un compte". Inscris un compte de TEST (une adresse à toi, différente
    de l'admin). Valide l'inscription.
12. Vérifie que la boîte binet.antoine2@gmail.com a reçu un e-mail intitulé
    "Nouvelle inscription sur MarieNour : ...". Regarde AUSSI les spams/indésirables.
13. (Optionnel) Supprime ce compte de test depuis /admin.

Rends-moi un compte rendu : update OK ?, validation 2 étapes active ?, mot de
passe d'application créé ?, les dernières lignes du journal après restart (sans
recopier le secret), et si l'e-mail de test est bien arrivé. Signale tout écran
inattendu plutôt que de forcer.
```

---

## Notes & dépannage

- **Pourquoi un « mot de passe d'application » ?** Gmail refuse le mot de passe
  normal du compte en SMTP. Le mot de passe d'application (16 lettres) n'est
  utilisable que pour ça et se révoque indépendamment depuis
  <https://myaccount.google.com/apppasswords>.
- **Expéditeur affiché** : par défaut, l'e-mail part de `binet.antoine2@gmail.com`.
  Pour un nom plus joli, ajoute une ligne `MAIL_FROM=MarieNour <binet.antoine2@gmail.com>`
  dans le fichier d'env (Gmail force de toute façon l'adresse authentifiée).
- **L'e-mail n'arrive pas** :
  - `journalctl -u marienour -n 50 --no-pager` → cherche `[mail] échec d'envoi SMTP`.
    Un `Invalid login` = mauvais mot de passe d'application ou 2FA non activée.
  - Vérifie les **spams** côté Gmail (binet.antoine2@gmail.com), et que `SMTP_PASS`
    est bien dans `/etc/marienour/marienour.env` (sans espaces parasites).
  - Réseau VM → Gmail : le port **465** sortant doit être autorisé (par défaut
    rien ne le bloque côté Oracle pour le trafic sortant).
- **Autre fournisseur SMTP** (pas Gmail) : ajoute aussi `SMTP_HOST=...` et
  `SMTP_PORT=...` dans le fichier d'env (cf. `deployment/marienour.env.example`).
- **Rien ne casse si tu n'actives pas** : sans `SMTP_USER`/`SMTP_PASS`, les
  inscriptions fonctionnent normalement, l'e-mail est juste ignoré.
```
