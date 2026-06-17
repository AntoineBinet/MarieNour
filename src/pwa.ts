/* Enregistrement du service worker + gestion de la mise à jour.
   Voir public/sw.js pour la stratégie de cache. Branché depuis
   src/components/PwaUpdatePrompt.tsx (uniquement en build de production). */

type UpdateCallback = () => void;

let waitingWorker: ServiceWorker | null = null;

/** Enregistre /sw.js et appelle `onUpdate` quand une nouvelle version est prête. */
export function registerServiceWorker(onUpdate: UpdateCallback): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      // updateViaCache:"none" → le navigateur ne sert jamais un sw.js périmé
      // depuis son cache HTTP, sans qu'on ait à toucher aux en-têtes serveur.
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        // Une version est déjà installée et en attente (onglet rouvert).
        if (reg.waiting && navigator.serviceWorker.controller) {
          waitingWorker = reg.waiting;
          onUpdate();
        }
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            // "installed" + un contrôleur existant = mise à jour (pas 1re install).
            if (next.state === "installed" && navigator.serviceWorker.controller) {
              waitingWorker = next;
              onUpdate();
            }
          });
        });
      })
      .catch(() => {});
  });
}

/** Active la version en attente puis recharge la page. */
export function applyUpdateAndReload(): void {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  waitingWorker.postMessage("SKIP_WAITING");
}
