import { useEffect, useState } from "react";
import { applyUpdateAndReload, registerServiceWorker } from "../pwa";

/** Bandeau « Nouvelle version disponible » de la PWA. Apparaît quand le service
    worker a téléchargé une mise à jour ; le clic l'active et recharge la page.
    Le service worker n'est enregistré qu'en build de production. */
export default function PwaUpdatePrompt() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    registerServiceWorker(() => setAvailable(true));
  }, []);

  if (!available) return null;

  return (
    <div className="pwa-update" role="status">
      <span>Nouvelle version disponible</span>
      <button className="btn btn-primary btn-sm" onClick={applyUpdateAndReload}>
        Recharger
      </button>
    </div>
  );
}
