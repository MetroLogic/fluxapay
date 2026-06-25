"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface ApiSandboxContextType {
  apiKey: string;
  setApiKey: (key: string) => void;
}

const ApiSandboxContext = createContext<ApiSandboxContextType | undefined>(undefined);

export function ApiSandboxProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKey] = useState("");

  return (
    <ApiSandboxContext.Provider value={{ apiKey, setApiKey }}>
      {children}
    </ApiSandboxContext.Provider>
  );
}

export function useApiSandbox() {
  const context = useContext(ApiSandboxContext);
  if (context === undefined) {
    throw new Error("useApiSandbox must be used within an ApiSandboxProvider");
  }
  return context;
}
