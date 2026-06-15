import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { PublicUser } from "@shared/types";
import { api } from "./api";

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
    // appliquer l'accent stocké tôt
  }, []);

  // Applique l'accent de l'utilisateur sur <html>.
  useEffect(() => {
    if (user?.accent) document.documentElement.setAttribute("data-accent", user.accent);
  }, [user?.accent]);

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, setUser, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
