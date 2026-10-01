/* MarieNour · src/fx/index.ts : le point d'entrée de la couche d'effets.
   --------------------------------------------------------------------------
   Une couche POSÉE PAR-DESSUS l'app : `demarrerFx()` est appelée une fois
   par src/main.tsx, avant le premier rendu React. Retirer cette ligne rend
   l'app d'avant. Aucun fichier de src/pages ni de src/components n'importe
   src/fx : l'app ne connaît pas la couche, la couche ne connaît de l'app que
   son DOM et le contrat de docs/DESIGN-FX.md §4.

   Ordre d'installation, fixe : le cœur (écouteurs du geste frais), le
   montage (l'observateur unique), puis les modules, l'éclosion d'abord.
   Idempotent : StrictMode double les effets en développement et le
   rechargement à chaud réévalue les modules ; `window.__mnFx` garde
   l'instance, chaque module rend son arrêt. */

import "./fx.css";
import * as core from "./core";
import * as montage from "./montage";
import * as eclosion from "./eclosion";
import * as navigation from "./navigation";
import * as verre from "./verre";
import * as feuille from "./feuille";
import * as flux from "./flux";
import * as vivant from "./vivant";
import * as vol from "./vol";
import * as scene from "./scene";

interface ModuleFx {
  installer(): () => void;
  api?: Readonly<object>;
}

/** Les modules, dans leur ordre d'installation. */
export const MODULES: ReadonlyArray<readonly [string, ModuleFx]> = [
  ["eclosion", eclosion],
  ["navigation", navigation],
  ["verre", verre],
  ["feuille", feuille],
  ["flux", flux],
  ["vivant", vivant],
  ["vol", vol],
  ["scene", scene],
];

declare global {
  interface Window {
    /** L'instance installée de la couche (garde d'idempotence). */
    __mnFx?: { arreter: () => void };
    /** Le registre des objets publics des modules, figé (débogage, tests). */
    MnFx?: Readonly<Record<string, Readonly<object>>>;
  }
}

function avertir(nom: string, e: unknown) {
  if (typeof console !== "undefined") console.warn(`[fx] le module ${nom} n'a pas pu s'installer`, e);
}

/** Installe la couche d'effets, une seule fois. */
export function demarrerFx(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__mnFx) return;
  const arrets: Array<() => void> = [];
  const registre: Record<string, Readonly<object>> = {};
  const installer = (nom: string, m: ModuleFx) => {
    try {
      arrets.push(m.installer());
      registre[nom] = m.api ?? Object.freeze({});
    } catch (e) {
      // Un module qui casse ne casse ni l'app ni les autres modules.
      avertir(nom, e);
    }
  };
  installer("core", core);
  installer("montage", { installer: montage.installer, api: Object.freeze({ etat: montage.etat }) });
  for (const [nom, m] of MODULES) installer(nom, m);
  window.MnFx = Object.freeze(registre);
  window.__mnFx = {
    arreter() {
      // Dans l'ordre inverse : les modules d'abord, le cœur en dernier.
      for (const a of arrets.reverse()) {
        try {
          a();
        } catch {
          /* rien */
        }
      }
      delete window.MnFx;
      delete window.__mnFx;
    },
  };
}

/** Arrête la couche (rechargement à chaud, tests). */
export function arreterFx(): void {
  if (typeof window !== "undefined") window.__mnFx?.arreter();
}

// Rechargement à chaud : la couche se réinstalle avec le nouveau code, sans
// recharger la page (main.tsx n'est pas réévalué).
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data: { relancer?: boolean }) => {
    data.relancer = typeof window !== "undefined" && !!window.__mnFx;
    arreterFx();
  });
  if ((import.meta.hot.data as { relancer?: boolean }).relancer) demarrerFx();
}
