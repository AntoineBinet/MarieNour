/* MarieNour · src/fx/scene.ts : BOUCHON posé par le socle (lot F1).
   --------------------------------------------------------------------------
   Le lot E8 remplace ce fichier. L'arrivée une fois par séance, la révélation au défilement, l'appui en ressort, l'haptique et « Animations : toujours » (contrat §5.9).

   Le contrat d'un module (docs/DESIGN-FX.md §3) : il exporte `installer()`,
   qui pose ses observateurs et écouteurs et rend l'arrêt, et `api`, son
   objet public figé exposé en `window.MnFx.scene` (débogage et tests,
   jamais appelé par l'app). Il importe sa feuille `./scene.css` et lit
   l'arbitre `reduit()` (ou `peut()`) de `./core` à chaque geste. */

import { reduit } from "./core";
import "./scene.css";

/** Objet public du module. `bouchon` disparaît quand le lot E8 le remplit. */
export const api = Object.freeze({ bouchon: true as const });

export function installer(): () => void {
  // Le bouchon ne pose rien ; le vrai module relit l'arbitre à chaque geste.
  void reduit;
  return () => {};
}
