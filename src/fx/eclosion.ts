/* MarieNour · src/fx/eclosion.ts : BOUCHON posé par le socle (lot F1).
   --------------------------------------------------------------------------
   Le lot E1 remplace ce fichier. L'éclosion, l'effet signature (contrat §7) : la fleur du logo qui éclot au lancement, au tirer pour rafraîchir, au chargement, à la célébration et sur le « + ».

   Le contrat d'un module (docs/DESIGN-FX.md §3) : il exporte `installer()`,
   qui pose ses observateurs et écouteurs et rend l'arrêt, et `api`, son
   objet public figé exposé en `window.MnFx.eclosion` (débogage et tests,
   jamais appelé par l'app). Il importe sa feuille `./eclosion.css` et lit
   l'arbitre `reduit()` (ou `peut()`) de `./core` à chaque geste. */

import { reduit } from "./core";
import "./eclosion.css";

/** Objet public du module. `bouchon` disparaît quand le lot E1 le remplit. */
export const api = Object.freeze({ bouchon: true as const });

export function installer(): () => void {
  // Le bouchon ne pose rien ; le vrai module relit l'arbitre à chaque geste.
  void reduit;
  return () => {};
}
