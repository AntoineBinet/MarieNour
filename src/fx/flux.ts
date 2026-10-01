/* MarieNour · src/fx/flux.ts : BOUCHON posé par le socle (lot F1).
   --------------------------------------------------------------------------
   Le lot E5 remplace ce fichier. Les listes : cascade d'entrée, FLIP au tri et au filtre, sortie d'un élément et resserrement des voisins (contrat §5.6).

   Le contrat d'un module (docs/DESIGN-FX.md §3) : il exporte `installer()`,
   qui pose ses observateurs et écouteurs et rend l'arrêt, et `api`, son
   objet public figé exposé en `window.MnFx.flux` (débogage et tests,
   jamais appelé par l'app). Il importe sa feuille `./flux.css` et lit
   l'arbitre `reduit()` (ou `peut()`) de `./core` à chaque geste. */

import { reduit } from "./core";
import "./flux.css";

/** Objet public du module. `bouchon` disparaît quand le lot E5 le remplit. */
export const api = Object.freeze({ bouchon: true as const });

export function installer(): () => void {
  // Le bouchon ne pose rien ; le vrai module relit l'arbitre à chaque geste.
  void reduit;
  return () => {};
}
