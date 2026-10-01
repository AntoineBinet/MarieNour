/* MarieNour · src/fx/navigation.ts : BOUCHON posé par le socle (lot F1).
   --------------------------------------------------------------------------
   Le lot E2 remplace ce fichier. Les transitions de page (onglet et détail), le grand titre qui se replie dans la barre, la barre de progression d'une page qui charge (contrat §5.3).

   Le contrat d'un module (docs/DESIGN-FX.md §3) : il exporte `installer()`,
   qui pose ses observateurs et écouteurs et rend l'arrêt, et `api`, son
   objet public figé exposé en `window.MnFx.navigation` (débogage et tests,
   jamais appelé par l'app). Il importe sa feuille `./navigation.css` et lit
   l'arbitre `reduit()` (ou `peut()`) de `./core` à chaque geste. */

import { reduit } from "./core";
import "./navigation.css";

/** Objet public du module. `bouchon` disparaît quand le lot E2 le remplit. */
export const api = Object.freeze({ bouchon: true as const });

export function installer(): () => void {
  // Le bouchon ne pose rien ; le vrai module relit l'arbitre à chaque geste.
  void reduit;
  return () => {};
}
