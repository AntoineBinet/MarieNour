import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicUser } from "@shared/types";
import { api } from "./api";
import { appearanceFromUser, applyAppearance } from "./theme";

interface AuthCtx {
  user: PublicUser | null;
  loading: boolean;
  setUser: (u: PublicUser | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  // Applique l'apparence complète de l'utilisateur (thème, couleur, typo…) dès
  // qu'elle change. On dépend du JSON des prefs + de l'accent pour réagir à
  // toute modification (y compris depuis la page Personnalisation).
  useEffect(() => {
    if (user) applyAppearance(appearanceFromUser(user));
  }, [user?.accent, JSON.stringify(user?.prefs)]);

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, setUser, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
