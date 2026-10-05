import React, { createContext, useContext, useState, useEffect } from "react";
import { registerServerStatusListener } from "../api/client";

interface ServerStatusContextType {
  isWarming: boolean;
  retryCount: number;
}

const ServerStatusContext = createContext<ServerStatusContextType>({
  isWarming: false,
  retryCount: 0,
});

export const ServerStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isWarming, setIsWarming] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);

  useEffect(() => {
    registerServerStatusListener((warming, count) => {
      setIsWarming(warming);
      setRetryCount(count);
    });
  }, []);

  return (
    <ServerStatusContext.Provider value={{ isWarming, retryCount }}>
      {children}
    </ServerStatusContext.Provider>
  );
};

export const useServerStatus = () => useContext(ServerStatusContext);
