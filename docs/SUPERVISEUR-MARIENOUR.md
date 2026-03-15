# Superviseur — MarieNour (MNWork)

Ce document décrit comment faire tourner MNWork sous un superviseur pour redémarrage automatique après mise à jour et rollback en cas de crash loop.

## Comportement du serveur

- Après une mise à jour réussie (depuis la page Paramètres), le serveur appelle `_schedule_restart(delay)` puis quitte avec **code de sortie 42** après un délai (par défaut 10 s).
- Un superviseur doit interpréter le code 42 comme « redémarrage demandé » et relancer le processus.
- En cas de crash (autre code de sortie), le superviseur peut détecter un **crash loop** (plusieurs sorties anormales en peu de temps) et effectuer un rollback Git vers le commit sauvegardé dans `.last_commit_hash`.

## Variables d’environnement utiles

| Variable | Description | Exemple |
|----------|-------------|---------|
| `PORT` | Port du serveur | `3000` |
| `HOST` | Interface d’écoute | `127.0.0.1` |
| `MNWORK_DIR` | Racine du projet (pour le script superviseur) | `C:\...\MNWork` ou `/home/.../MNWork` |

## Health check

Après chaque démarrage, le superviseur peut vérifier que l’app répond :

- **GET** `http://127.0.0.1:PORT/api/health` → attendu : `{ "ok": true }`
- Timeout recommandé : 5–10 s, avec quelques tentatives (ex. 3) espacées de 2 s.

## Rollback en crash loop

1. Détecter un crash loop : par exemple 3 sorties avec code ≠ 42 en moins de 2 minutes.
2. Si le fichier `.last_commit_hash` existe à la racine du projet :  
   `git reset --hard $(cat .last_commit_hash)` (ou sous Windows : lire le fichier puis `git reset --hard <hash>`).
3. Relancer le serveur.

## Exemple de script (Python)

Le script `supervise_marienour.py` à la racine du projet :

- Répertoire de travail = racine MarieNour (variable `MNWORK_DIR` ou répertoire du script).
- Commande : `node server.js` (ou `npm start`).
- Code de sortie 42 → redémarrage normal (pas de rollback).
- Code ≠ 42 → incrémenter un compteur de crash ; si au-dessus d’un seuil (ex. 3) dans une fenêtre de temps (ex. 120 s), exécuter le rollback Git puis redémarrer.
- Après chaque démarrage : boucle de health check sur `http://127.0.0.1:PORT/api/health` avec timeout et nombre de tentatives.

Voir le script fourni `supervise_marienour.py` pour une implémentation de référence.

## Coexistence avec ProspUp

Sur la même machine, ProspUp et MarieNour peuvent tourner chacun avec leur propre superviseur : répertoire, port et URL différents (ex. ProspUp sur 3001, MarieNour sur 3000).
