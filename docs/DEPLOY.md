# Déploiement — MNWork

## Lancer en local

```bash
npm install
npm start
```

L’app est disponible sur **http://localhost:3000**. Le front (HTML/CSS/JS) et l’API (Express) tournent ensemble.

## Déploiement en production

L’application est un serveur Node (Express) qui sert les fichiers statiques et expose une API (profil, documents, SQLite). Pour déployer :

1. **Serveur Node (VPS, Railway, Render, etc.)**
   - Cloner le repo, `npm install --production`, `npm start`.
   - Configurer le port via la variable d’environnement si besoin (adapter `PORT` dans `server.js` ou lire `process.env.PORT`).
   - Exposer le serveur en HTTPS (reverse proxy Nginx/Caddy, ou TLS du PaaS).

2. **Variable d’environnement**
   - Le client appelle `API_BASE = "http://127.0.0.1:3000"` (défini dans `app.js`). En production, remplacer par l’URL réelle de l’API (ex. `https://mnwork.example.com`) ou utiliser un proxy pour que le front et l’API soient sur le même domaine.

3. **Données**
   - Le dossier `data/` (SQLite, uploads, exports) est créé au démarrage. En production, le monter sur un volume persistant et faire des sauvegardes régulières.

## Version mobile

La version responsive (drawer, topbar compact, footer court) est active pour les écrans ≤ 760px. Aucune configuration supplémentaire : ouvrir l’app sur un smartphone ou redimensionner la fenêtre pour tester.
