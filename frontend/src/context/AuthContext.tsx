import React, { createContext, useContext, useState, useEffect } from "react";
import { User, UserSettings } from "../types/auth";
import { authApi } from "../api/auth";
import { useCurrency } from "./CurrencyContext";

import { clearUserData } from "../services/db";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, invite_code?: string, currency?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateSettings: (currency?: string, settings?: UserSettings) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const { setCurrency } = useCurrency();

  const refreshUser = async () => {
    try {
      const profile = await authApi.getProfile();
      setUser(profile);
      if (profile.currency) {
        setCurrency(profile.currency);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, password: string) => {
    const loggedIn = await authApi.login(email, password);
    setUser(loggedIn);
    if (loggedIn.currency) {
      setCurrency(loggedIn.currency);
    }
  };

  const register = async (email: string, password: string, invite_code?: string, currency?: string) => {
    const registered = await authApi.register(email, password, invite_code, currency);
    setUser(registered);
    if (registered.currency) {
      setCurrency(registered.currency);
    }
  };

  const logout = async () => {
    const currentUserId = user?.id;
    if (currentUserId) {
      try {
        await clearUserData(currentUserId);
      } catch {
        // Ignore IndexedDB clean error
      }
    }

    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  };

  const updateSettings = async (currency?: string, settings?: UserSettings) => {
    const updated = await authApi.updateSettings(currency, settings);
    setUser(updated);
    if (currency) {
      setCurrency(currency);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, updateSettings, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
