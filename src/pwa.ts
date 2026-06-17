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

/* ── Invite d'installation native (Chrome / Edge / Android) ─────────────────── */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const notify = () => installListeners.forEach((cb) => cb());

if (typeof window !== "undefined") {
  // Le navigateur signale que l'app est installable : on garde l'évènement
  // sous le coude pour déclencher l'invite au moment choisi par l'utilisateur.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

/** Vrai si l'app tourne déjà en mode installé (écran d'accueil / standalone). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Vrai si une invite d'installation native est disponible (Chrome/Edge/Android). */
export function canInstall(): boolean {
  return deferredPrompt !== null;
}

/** S'abonne aux changements de disponibilité de l'invite. Retourne un désabonnement. */
export function onInstallChange(cb: () => void): () => void {
  installListeners.add(cb);
  return () => {
    installListeners.delete(cb);
  };
}

/** Déclenche l'invite native d'installation. Retourne true si l'utilisateur accepte. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const evt = deferredPrompt;
  deferredPrompt = null;
  await evt.prompt();
  const choice = await evt.userChoice;
  notify();
  return choice.outcome === "accepted";
}
