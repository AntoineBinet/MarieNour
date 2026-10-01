/* MarieNour · src/fx/vivant.ts : BOUCHON posé par le socle (lot F1).
   --------------------------------------------------------------------------
   Le lot E6 remplace ce fichier. Les données qui vivent : entiers qui comptent, montants qui roulent, jauges, coches, cœurs, célébration (contrat §5.7).

   Le contrat d'un module (docs/DESIGN-FX.md §3) : il exporte `installer()`,
   qui pose ses observateurs et écouteurs et rend l'arrêt, et `api`, son
   objet public figé exposé en `window.MnFx.vivant` (débogage et tests,
   jamais appelé par l'app). Il importe sa feuille `./vivant.css` et lit
   l'arbitre `reduit()` (ou `peut()`) de `./core` à chaque geste. */

import { reduit } from "./core";
import "./vivant.css";

/** Objet public du module. `bouchon` disparaît quand le lot E6 le remplit. */
export const api = Object.freeze({ bouchon: true as const });

export function installer(): () => void {
  // Le bouchon ne pose rien ; le vrai module relit l'arbitre à chaque geste.
  void reduit;
  return () => {};
}
