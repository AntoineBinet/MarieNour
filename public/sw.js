/* Service worker « maison » de marienour — PWA installable + coquille hors-ligne.
   Fichier JS pur servi tel quel à /sw.js par les deux runtimes (Node VM + Pages).
   Ne pas le déplacer dans src/ : il n'est volontairement pas typé/bundlé par Vite.

   Stratégie de cache (runtime caching, sans manifest de précache) :
   - navigation  → network-first, repli sur la coquille en cache (hors-ligne) ;
   - assets      → stale-while-revalidate (réponse cache immédiate + revalidation) ;
   - /api/*      → jamais en cache (données multi-utilisateurs / médias, réseau seul). */

const VERSION = "v36";
const CACHE = "marienour-" + VERSION;
const SHELL = "/";
// Ressources clés précachées à l'installation (chacune indépendamment : un échec
// isolé — 404, réseau — n'empêche pas les autres d'être mises en cache).
const PRECACHE = [SHELL, "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  // Précache la coquille + les ressources clés pour l'ouverture hors-ligne.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))
      .catch(() => {}),
  );
  // Pas de skipWaiting() ici : on attend la confirmation utilisateur (bandeau MAJ).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      // Active la navigation preload si le navigateur la gère (le fetch réseau de
      // navigation démarre en parallèle du réveil du SW → 1re peinture plus rapide).
      .then(() => {
        if (self.registration.navigationPreload) {
          return self.registration.navigationPreload.enable().catch(() => {});
        }
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Uniquement le même domaine (on laisse les polices Google & co. au réseau).
  if (url.origin !== self.location.origin) return;
  // Les données passent toujours par le réseau (multi-utilisateurs, médias).
  if (url.pathname.startsWith("/api/")) return;

  // Navigation → network-first, repli sur la coquille en cache.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          // Réponse déjà pré-chargée par le navigateur (navigationPreload) si
          // disponible, sinon on va au réseau. `event.preloadResponse` résout à
          // undefined quand la fonctionnalité est absente/désactivée.
          const preload = await event.preloadResponse;
          const res = preload || (await fetch(req));
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL, copy)).catch(() => {});
          return res;
        } catch {
          // Hors-ligne / réseau KO → repli sur la coquille en cache.
          return (await caches.match(SHELL)) || (await caches.match(req));
        }
      })(),
    );
    return;
  }

  // Assets statiques (JS/CSS/images hashés) → stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

/* ── Notifications Web Push ──────────────────────────────────────────────────
   Le serveur envoie un payload JSON { title, body, url, tag }. On affiche une
   notification système ; un clic ouvre/focalise l'app sur l'URL ciblée. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: event.data ? event.data.text() : "marienour" };
  }
  const title = data.title || "marienour";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        // Réutilise un onglet marienour déjà ouvert.
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
