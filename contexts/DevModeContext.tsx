'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface DevConfig {
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
}

interface DebugData {
  latency?: number;
  requestBody?: Record<string, unknown>;
  responseBody?: Record<string, unknown>;
  timestamp?: number;
}

interface DevModeContextType {
  isDevMode: boolean;
  setIsDevMode: (value: boolean) => void;
  config: DevConfig;
  setConfig: (config: DevConfig) => void;
  debugData: DebugData[];
  addDebugData: (data: DebugData) => void;
  clearDebugData: () => void;
}

const DevModeContext = createContext<DevModeContextType | undefined>(undefined);

export function DevModeProvider({ children }: { children: ReactNode }) {
  const [isDevMode, setIsDevMode] = useState(false);
  const [config, setConfig] = useState<DevConfig>({
    temperature: 0.9,
    maxTokens: 500,
  });
  const [debugData, setDebugData] = useState<DebugData[]>([]);

  const addDebugData = (data: DebugData) => {
    setDebugData((prev) => [
      { ...data, timestamp: Date.now() },
      ...prev.slice(0, 49), // 최대 50개만 유지
    ]);
  };

  const clearDebugData = () => {
    setDebugData([]);
  };

  return (
    <DevModeContext.Provider
      value={{
        isDevMode,
        setIsDevMode,
        config,
        setConfig,
        debugData,
        addDebugData,
        clearDebugData,
      }}
    >
      {children}
    </DevModeContext.Provider>
  );
}

export function useDevMode() {
  const context = useContext(DevModeContext);
  if (context === undefined) {
    throw new Error('useDevMode must be used within a DevModeProvider');
  }
  return context;
}


