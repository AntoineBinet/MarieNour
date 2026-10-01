/* MarieNour · src/fx/vol.ts : BOUCHON posé par le socle (lot F1).
   --------------------------------------------------------------------------
   Le lot E7 remplace ce fichier. L'élément partagé qui vole de sa vignette à sa destination, et la lumière de l'image (contrat §5.8).

   Le contrat d'un module (docs/DESIGN-FX.md §3) : il exporte `installer()`,
   qui pose ses observateurs et écouteurs et rend l'arrêt, et `api`, son
   objet public figé exposé en `window.MnFx.vol` (débogage et tests,
   jamais appelé par l'app). Il importe sa feuille `./vol.css` et lit
   l'arbitre `reduit()` (ou `peut()`) de `./core` à chaque geste. */

import { reduit } from "./core";
import "./vol.css";

/** Objet public du module. `bouchon` disparaît quand le lot E7 le remplit. */
export const api = Object.freeze({ bouchon: true as const });

export function installer(): () => void {
  // Le bouchon ne pose rien ; le vrai module relit l'arbitre à chaque geste.
  void reduit;
  return () => {};
}
