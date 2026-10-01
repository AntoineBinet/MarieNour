import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./auth";
import { ToastProvider } from "./ui";
import { initAppearance } from "./theme";
import "./styles.css";
// Après styles.css : les feuilles de fx gagnent à spécificité égale.
import { demarrerFx } from "./fx";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

// Apparence (thème, couleur, typo, densité…) : repose la dernière apparence
// connue pour éviter tout flash, puis la session utilisateur la confirmera.
initAppearance();

// La couche d'effets (src/fx), posée PAR-DESSUS l'app avant le premier rendu :
// elle observe le DOM, l'app ne l'appelle jamais. Retirer cette ligne rend
// l'app d'avant.
demarrerFx();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
