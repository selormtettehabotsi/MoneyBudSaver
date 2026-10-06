import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { registerServerStatusListener } from "../api/client";

export type BackendConnectionStatus = "operational" | "warming" | "error" | "offline";

interface ServerStatusContextType {
  isWarming: boolean;
  retryCount: number;
  serverStatus: BackendConnectionStatus;
  lastError: string | null;
  lastChecked: Date | null;
  latencyMs: number | null;
  isChecking: boolean;
  checkBackendHealth: () => Promise<void>;
  dismissError: () => void;
}

const ServerStatusContext = createContext<ServerStatusContextType>({
  isWarming: false,
  retryCount: 0,
  serverStatus: "operational",
  lastError: null,
  lastChecked: null,
  latencyMs: null,
  isChecking: false,
  checkBackendHealth: async () => {},
  dismissError: () => {},
});

export const ServerStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isWarming, setIsWarming] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<BackendConnectionStatus>("operational");
  const [lastChecked, setLastChecked] = useState<Date | null>(new Date());
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const checkBackendHealth = useCallback(async () => {
    setIsChecking(true);
    const start = performance.now();
    try {
      const res = await fetch("/health", { credentials: "include" });
      const elapsed = Math.round(performance.now() - start);
      setLatencyMs(elapsed);
      setLastChecked(new Date());

      if (res.ok) {
        setServerStatus("operational");
        setLastError(null);
        setIsWarming(false);
        setRetryCount(0);
      } else {
        setServerStatus("error");
        setLastError(`Server responded with HTTP ${res.status}`);
      }
    } catch (err: any) {
      setServerStatus("error");
      setLastError(err?.message || "Cannot establish connection with backend server");
      setLastChecked(new Date());
    } finally {
      setIsChecking(false);
    }
  }, []);

  const dismissError = useCallback(() => {
    setLastError(null);
    if (serverStatus === "error") {
      setServerStatus("operational");
    }
  }, [serverStatus]);

  useEffect(() => {
    registerServerStatusListener((warming, count, error) => {
      setIsWarming(warming);
      setRetryCount(count);
      if (warming) {
        setServerStatus("warming");
      } else if (error) {
        setServerStatus("error");
        setLastError(error);
      } else {
        setServerStatus("operational");
        setLastError(null);
      }
    });

    // Check health on initial mount
    checkBackendHealth();
  }, [checkBackendHealth]);

  return (
    <ServerStatusContext.Provider
      value={{
        isWarming,
        retryCount,
        serverStatus,
        lastError,
        lastChecked,
        latencyMs,
        isChecking,
        checkBackendHealth,
        dismissError,
      }}
    >
      {children}
    </ServerStatusContext.Provider>
  );
};

export const useServerStatus = () => useContext(ServerStatusContext);

