import { useEffect, useState, type ReactNode } from "react";
import { Modal, useToast } from "../ui";
import { Icon, type IconName } from "./Icon";
import { canInstall, isStandalone, onInstallChange, promptInstall } from "../pwa";

/** Une étape du tuto : badge d'icône + titre + explication. */
function Step({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <div className="row gap-3" style={{ alignItems: "flex-start" }}>
      <span className="empty-icon" style={{ flex: "0 0 auto" }}><Icon name={icon} size={20} /></span>
      <div className="col" style={{ gap: 2 }}>
        <strong style={{ fontWeight: 600 }}>{title}</strong>
        <span className="muted small">{children}</span>
      </div>
    </div>
  );
}

/** Bouton « Installer » (à côté de Sombre/Déconnexion) ouvrant un rapide tuto pour
    ajouter marienour à l'écran d'accueil (PWA). Masqué si l'app est déjà installée. */
export default function InstallApp() {
  const [open, setOpen] = useState(false);
  const [installable, setInstallable] = useState(canInstall());
  const toast = useToast();

  useEffect(() => onInstallChange(() => setInstallable(canInstall())), []);

  // Déjà ouverte en mode installé : pas besoin de proposer l'installation.
  if (isStandalone()) return null;

  const install = async () => {
    const ok = await promptInstall();
    setOpen(false);
    if (ok) toast.push("C'est parti, MarieNour s'installe ✓");
  };

  return (
    <>
      <button className="btn btn-soft btn-sm grow" onClick={() => setOpen(true)}>
        <Icon name="download" size={15} /> Installer
      </button>

      {open && (
        <Modal title="Installer l'app" onClose={() => setOpen(false)}>
          <div className="col gap-4">
            <p className="muted" style={{ margin: 0 }}>
              Ajoute MarieNour à ton écran d'accueil pour l'ouvrir comme une vraie
              application — en plein écran, et même hors-ligne. C'est gratuit et ça
              ne passe par aucun store.
            </p>

            {installable && (
              <button className="btn btn-primary btn-block" onClick={install}>
                <Icon name="download" size={16} /> Installer maintenant
              </button>
            )}

            <div className="col gap-4">
              <Step icon="share" title="Sur iPhone / iPad (Safari)">
                Touche l'icône <strong>Partager</strong> (le carré avec une flèche
                vers le haut), puis <strong>« Sur l'écran d'accueil »</strong>.
              </Step>
              <Step icon="dots" title="Sur Android (Chrome)">
                Ouvre le menu <strong>⋮</strong> en haut à droite, puis{" "}
                <strong>« Installer l'application »</strong>.
              </Step>
              <Step icon="download" title="Sur ordinateur (Chrome / Edge)">
                Clique sur l'icône <strong>d'installation</strong> à droite de la
                barre d'adresse.
              </Step>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
