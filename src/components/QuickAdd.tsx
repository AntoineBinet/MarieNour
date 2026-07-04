import { useNavigate } from "react-router-dom";
import { Modal } from "../ui";
import { Icon, type IconName } from "./Icon";

// Feuille d'actions « Créer rapidement » ouverte par le bouton central « + » de
// la barre inférieure (mobile). Chaque tuile navigue vers la page concernée avec
// ?new=1 : la page ouvre alors directement son formulaire de création. Ici on se
// contente de naviguer puis de fermer la feuille — la logique ?new=1 vit dans
// chaque page.

interface QuickAction {
  to: string;
  label: string;
  ic: IconName;
}

const ACTIONS: QuickAction[] = [
  { to: "/notes?new=1", label: "Note", ic: "notes" },
  { to: "/listes?new=1", label: "Liste", ic: "lists" },
  { to: "/depenses?new=1", label: "Dépense partagée", ic: "expenses" },
  { to: "/finances?new=1", label: "Transaction", ic: "coins" },
  { to: "/fil?new=1", label: "Souvenir", ic: "memories" },
  { to: "/voyages?new=1", label: "Voyage", ic: "trips" },
  { to: "/evenements?new=1", label: "Événement", ic: "confetti" },
];

export default function QuickAdd({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <Modal title="Créer rapidement" onClose={onClose}>
      <div className="quickadd-grid">
        {ACTIONS.map((a) => (
          <button key={a.to} type="button" className="quickadd-item" onClick={() => go(a.to)}>
            <span className="quickadd-item-ic"><Icon name={a.ic} size={24} /></span>
            <span className="quickadd-item-label">{a.label}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
