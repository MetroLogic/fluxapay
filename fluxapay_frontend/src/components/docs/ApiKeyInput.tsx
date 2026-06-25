"use client";

import React, { useState } from "react";
import { useApiSandbox } from "./ApiSandboxContext";
import { Key, Eye, EyeOff, CheckCircle2 } from "lucide-react";

export function ApiKeyInput() {
  const { apiKey, setApiKey } = useApiSandbox();
  const [showKey, setShowKey] = useState(false);
  const [inputValue, setInputValue] = useState(apiKey);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    setApiKey(inputValue);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-8">
      <div className="flex items-center gap-2 mb-2">
        <Key className="w-5 h-5 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">Sandbox API Key</h3>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Enter your sandbox API key to enable the interactive API runner. Your key is stored locally and never sent anywhere except the FluxaPay sandbox server.
      </p>
      
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type={showKey ? "text" : "password"}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="sk_test_..."
            className="w-full pl-3 pr-10 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono text-slate-700"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
          >
            {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {isSaved ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              Saved
            </>
          ) : (
            "Save Key"
          )}
        </button>
      </div>
    </div>
  );
}
