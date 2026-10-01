/* MarieNour · src/fx/verre.ts : BOUCHON posé par le socle (lot F1).
   --------------------------------------------------------------------------
   Le lot E3 remplace ce fichier. La capsule de verre du bas et sa lentille, la barre du haut en verre, le « + » qui tourne, l'indicateur de la barre latérale (contrat §5.4).

   Le contrat d'un module (docs/DESIGN-FX.md §3) : il exporte `installer()`,
   qui pose ses observateurs et écouteurs et rend l'arrêt, et `api`, son
   objet public figé exposé en `window.MnFx.verre` (débogage et tests,
   jamais appelé par l'app). Il importe sa feuille `./verre.css` et lit
   l'arbitre `reduit()` (ou `peut()`) de `./core` à chaque geste. */

import { reduit } from "./core";
import "./verre.css";

/** Objet public du module. `bouchon` disparaît quand le lot E3 le remplit. */
export const api = Object.freeze({ bouchon: true as const });

export function installer(): () => void {
  // Le bouchon ne pose rien ; le vrai module relit l'arbitre à chaque geste.
  void reduit;
  return () => {};
}
