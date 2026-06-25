// Parcours « premiers pas » — version interactive et vérifiée EN DIRECT.
// Chaque étape connaît une condition réelle (a-t-on déjà une note ? un compte ?
// un événement ?) calculée depuis l'API. Dès que l'utilisateur réalise l'action
// quelque part dans l'app, l'étape se coche toute seule au retour (react-query
// rafraîchit), sans rien à valider manuellement.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";
import type { IconName } from "./components/Icon";

export interface FirstStep {
  key: string;
  title: string;
  desc: string;
  icon: IconName;
  to: string;
  done: boolean;
  /** Étape « engageante » (compte bancaire, ami, événement) : repliée par défaut
   *  sous « Pour aller plus loin » pour ne pas alourdir la première lecture. */
  advanced?: boolean;
}

export interface FirstStepsState {
  steps: FirstStep[];
  doneCount: number;
  total: number;
  allDone: boolean;
  loading: boolean;
}

export function useFirstSteps(): FirstStepsState {
  const { user } = useAuth();

  // Réutilise les mêmes clés de cache que les pages → pas de requête en double,
  // et coche en direct quand l'action est faite ailleurs.
  const widgetsQ = useQuery({ queryKey: ["widgets"], queryFn: () => api.widgets() });
  const notesQ = useQuery({ queryKey: ["notes", ""], queryFn: () => api.notes() });
  const listsQ = useQuery({ queryKey: ["lists"], queryFn: () => api.lists() });
  const accountsQ = useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api.financeAccounts() });
  const eventsQ = useQuery({ queryKey: ["events"], queryFn: () => api.events() });
  const friendsQ = useQuery({ queryKey: ["friends"], queryFn: () => api.friends() });

  const loading =
    widgetsQ.isLoading ||
    notesQ.isLoading ||
    listsQ.isLoading ||
    accountsQ.isLoading ||
    eventsQ.isLoading ||
    friendsQ.isLoading;

  const steps = useMemo<FirstStep[]>(() => {
    const profileDone = !!(user?.avatar_url || (user?.bio && user.bio.trim()));
    // Du plus léger (10 s) au plus engageant : les trois derniers sont marqués
    // « advanced » → repliés par défaut dans la carte « Premiers pas ».
    return [
      {
        key: "profile",
        title: "Personnalise ton profil",
        desc: "Une photo, une bio, ta couleur — pour que ce soit vraiment chez toi.",
        icon: "profile",
        to: "/profil",
        done: profileDone,
      },
      {
        key: "note",
        title: "Capture une idée",
        desc: "Écris ta première note — l'app te proposera quoi en faire.",
        icon: "notes",
        to: "/notes",
        done: (notesQ.data?.notes.length ?? 0) > 0,
      },
      {
        key: "list",
        title: "Crée une liste",
        desc: "Courses, à faire, idées cadeaux… coche au fil de l'eau.",
        icon: "lists",
        to: "/listes",
        done: (listsQ.data?.lists.length ?? 0) > 0,
      },
      {
        key: "widget",
        title: "Compose ton accueil",
        desc: "Ajoute un premier widget à ton tableau de bord.",
        icon: "grid",
        to: "/",
        done: (widgetsQ.data?.widgets.length ?? 0) > 0,
      },
      {
        key: "finance",
        title: "Ouvre ton portefeuille",
        desc: "Ajoute un compte pour suivre ton budget et tes dépenses.",
        icon: "wallet",
        to: "/finances",
        done: (accountsQ.data?.accounts.length ?? 0) > 0,
        advanced: true,
      },
      {
        key: "event",
        title: "Planifie une activité",
        desc: "Soirée, week-end, anniv… trouve la date et invite tes proches.",
        icon: "confetti",
        to: "/evenements",
        done: (eventsQ.data?.events.length ?? 0) > 0,
        advanced: true,
      },
      {
        key: "friend",
        title: "Ajoute un ami",
        desc: "Partage listes, voyages et dépenses — d'un simple scan.",
        icon: "friends",
        to: "/amis",
        done: (friendsQ.data?.friends.length ?? 0) > 0,
        advanced: true,
      },
    ];
  }, [
    user?.avatar_url,
    user?.bio,
    widgetsQ.data,
    notesQ.data,
    listsQ.data,
    accountsQ.data,
    eventsQ.data,
    friendsQ.data,
  ]);

  const doneCount = steps.filter((s) => s.done).length;
  return { steps, doneCount, total: steps.length, allDone: doneCount === steps.length, loading };
}
