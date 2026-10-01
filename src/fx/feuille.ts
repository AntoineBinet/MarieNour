/* MarieNour · src/fx/feuille.ts : BOUCHON posé par le socle (lot F1).
   --------------------------------------------------------------------------
   Le lot E4 remplace ce fichier. Les feuilles iOS (l'app qui recule, le glissé pour fermer, la sortie par fantôme), les modales, les popovers et l'île des toasts (contrat §5.5).

   Le contrat d'un module (docs/DESIGN-FX.md §3) : il exporte `installer()`,
   qui pose ses observateurs et écouteurs et rend l'arrêt, et `api`, son
   objet public figé exposé en `window.MnFx.feuille` (débogage et tests,
   jamais appelé par l'app). Il importe sa feuille `./feuille.css` et lit
   l'arbitre `reduit()` (ou `peut()`) de `./core` à chaque geste. */

import { reduit } from "./core";
import "./feuille.css";

/** Objet public du module. `bouchon` disparaît quand le lot E4 le remplit. */
export const api = Object.freeze({ bouchon: true as const });

export function installer(): () => void {
  // Le bouchon ne pose rien ; le vrai module relit l'arbitre à chaque geste.
  void reduit;
  return () => {};
}
