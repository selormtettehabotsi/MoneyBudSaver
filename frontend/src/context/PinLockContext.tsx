import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import { getSecuritySettings, saveSecuritySettings, SecuritySettingsRecord } from "../services/db";
import { hashPin, verifyPin } from "../services/crypto";

interface PinLockContextType {
  isLocked: boolean;
  isPinSet: boolean;
  encryptOffline: boolean;
  autoLockMinutes: number;
  setupPin: (pin: string, encryptOffline: boolean, autoLockMinutes?: number) => Promise<void>;
  unlock: (pin: string) => Promise<boolean>;
  removePin: () => Promise<void>;
  lockNow: () => void;
}

const PinLockContext = createContext<PinLockContextType | null>(null);

export const PinLockProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id || "";

  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [isPinSet, setIsPinSet] = useState<boolean>(false);
  const [encryptOffline, setEncryptOffline] = useState<boolean>(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(5);

  const securityRecordRef = useRef<SecuritySettingsRecord | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Load user security settings from IndexedDB
  useEffect(() => {
    if (!userId) {
      setIsLocked(false);
      setIsPinSet(false);
      securityRecordRef.current = null;
      return;
    }

    getSecuritySettings(userId).then((rec) => {
      securityRecordRef.current = rec;
      if (rec && rec.pin_hash && rec.pin_salt) {
        setIsPinSet(true);
        setEncryptOffline(rec.encrypt_offline || false);
        setAutoLockMinutes(rec.auto_lock_minutes || 5);
        // Lock initially on app load/switch if PIN is configured
        setIsLocked(true);
      } else {
        setIsPinSet(false);
        setIsLocked(false);
      }
    });
  }, [userId]);

  // Idle Timer Activity Tracker
  useEffect(() => {
    if (!isPinSet || isLocked) return;

    const resetIdleTimer = () => {
      lastActivityRef.current = Date.now();
    };

    const checkIdle = () => {
      if (isLocked || !isPinSet) return;
      const elapsed = Date.now() - lastActivityRef.current;
      const timeoutMs = autoLockMinutes * 60 * 1000;
      if (elapsed >= timeoutMs) {
        setIsLocked(true);
      }
    };

    const events = ["mousedown", "mousemove", "keydown", "touchstart", "pointerdown", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, resetIdleTimer, { passive: true }));

    const interval = window.setInterval(checkIdle, 10000); // Check every 10s

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
      clearInterval(interval);
    };
  }, [isPinSet, isLocked, autoLockMinutes]);

  const unlock = useCallback(
    async (pin: string): Promise<boolean> => {
      const rec = securityRecordRef.current;
      if (!rec || !rec.pin_hash || !rec.pin_salt) {
        setIsLocked(false);
        return true;
      }

      const isValid = await verifyPin(pin, rec.pin_hash, rec.pin_salt);
      if (isValid) {
        setIsLocked(false);
        lastActivityRef.current = Date.now();
        return true;
      }
      return false;
    },
    []
  );

  const setupPin = useCallback(
    async (pin: string, encrypt: boolean, minutes: number = 5): Promise<void> => {
      if (!userId) return;
      const { hashHex, saltHex } = await hashPin(pin);

      const record: SecuritySettingsRecord = {
        userId,
        pin_hash: hashHex,
        pin_salt: saltHex,
        encrypt_offline: encrypt,
        auto_lock_minutes: minutes,
      };

      await saveSecuritySettings(userId, record);
      securityRecordRef.current = record;
      setIsPinSet(true);
      setEncryptOffline(encrypt);
      setAutoLockMinutes(minutes);
      setIsLocked(false);
      lastActivityRef.current = Date.now();
    },
    [userId]
  );

  const removePin = useCallback(async (): Promise<void> => {
    if (!userId) return;
    const record: SecuritySettingsRecord = {
      userId,
      pin_hash: null,
      pin_salt: null,
      encrypt_offline: false,
      auto_lock_minutes: 5,
    };
    await saveSecuritySettings(userId, record);
    securityRecordRef.current = record;
    setIsPinSet(false);
    setIsLocked(false);
    setEncryptOffline(false);
  }, [userId]);

  const lockNow = useCallback(() => {
    if (isPinSet) {
      setIsLocked(true);
    }
  }, [isPinSet]);

  return (
    <PinLockContext.Provider
      value={{
        isLocked,
        isPinSet,
        encryptOffline,
        autoLockMinutes,
        setupPin,
        unlock,
        removePin,
        lockNow,
      }}
    >
      {children}
    </PinLockContext.Provider>
  );
};

export const usePinLock = () => {
  const context = useContext(PinLockContext);
  if (!context) {
    throw new Error("usePinLock must be used within a PinLockProvider");
  }
  return context;
};
