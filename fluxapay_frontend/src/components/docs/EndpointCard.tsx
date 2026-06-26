"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Play, Loader2 } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { useApiSandbox } from "./ApiSandboxContext";

interface EndpointParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface EndpointResponse {
  status: number;
  description: string;
  example?: string;
}

interface EndpointCardProps {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  title: string;
  description: string;
  params?: EndpointParam[];
  responses?: EndpointResponse[];
  tsExample?: string;
  pythonExample?: string;
}

const methodColors = {
  GET: "bg-green-100 text-green-700 border-green-200",
  POST: "bg-blue-100 text-blue-700 border-blue-200",
  PATCH: "bg-amber-100 text-amber-700 border-amber-200",
  DELETE: "bg-red-100 text-red-700 border-red-200",
};

export function EndpointCard({
  method,
  path,
  title,
  description,
  params = [],
  responses = [],
  tsExample,
  pythonExample,
}: EndpointCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"ts" | "python" | "sandbox">("ts");

  const { apiKey } = useApiSandbox();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxResponse, setSandboxResponse] = useState<{status: number, data: unknown} | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  const handleSandboxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey) {
      setSandboxError("Please enter your Sandbox API Key at the top of the page.");
      return;
    }
    
    setSandboxLoading(true);
    setSandboxError(null);
    setSandboxResponse(null);

    try {
      let finalPath = path;
      const queryParams = new URLSearchParams();
      let body: Record<string, unknown> | undefined = undefined;

      params.forEach((param) => {
        const val = formValues[param.name];
        if (val) {
          if (finalPath.includes(`:${param.name}`)) {
            finalPath = finalPath.replace(`:${param.name}`, val);
          } else if (method === "GET" || method === "DELETE") {
            queryParams.append(param.name, val);
          } else {
            if (!body) body = {};
            if (param.type === "number" || param.type === "integer") body[param.name] = Number(val);
            else if (param.type === "boolean") body[param.name] = val === "true";
            else if (param.type === "object" || param.type === "array") {
              try { body[param.name] = JSON.parse(val); } catch (err) { body[param.name] = val; }
            }
            else body[param.name] = val;
          }
        }
      });

      const url = `https://sandbox-api.fluxapay.com${finalPath}${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await res.json().catch(() => null);
      setSandboxResponse({ status: res.status, data });
    } catch (err: unknown) {
      setSandboxError(err instanceof Error ? err.message : "Failed to execute request");
    } finally {
      setSandboxLoading(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white overflow-hidden mb-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
        <span
          className={`px-2 py-0.5 text-xs font-bold rounded border ${methodColors[method]}`}
        >
          {method}
        </span>
        <code className="text-sm font-mono text-slate-700 flex-1">{path}</code>
        <span className="text-sm text-slate-500">{title}</span>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 p-4 space-y-4">
          {/* Description */}
          <p className="text-slate-600">{description}</p>

          {/* Parameters */}
          {params.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Parameters</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-3 font-medium text-slate-500">Name</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">Type</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">Required</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {params.map((param) => (
                      <tr key={param.name} className="border-b border-slate-100">
                        <td className="py-2 px-3 font-mono text-slate-700">{param.name}</td>
                        <td className="py-2 px-3 text-slate-500">{param.type}</td>
                        <td className="py-2 px-3">
                          {param.required ? (
                            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Required</span>
                          ) : (
                            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Optional</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{param.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Code Examples */}
          {(tsExample || pythonExample) && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => setActiveTab("ts")}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    activeTab === "ts"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  TypeScript
                </button>
                <button
                  onClick={() => setActiveTab("python")}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                    activeTab === "python"
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Python
                </button>
                <button
                  onClick={() => setActiveTab("sandbox")}
                  className={`px-3 py-1 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${
                    activeTab === "sandbox"
                      ? "bg-blue-600 text-white"
                      : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                  }`}
                >
                  <Play className="w-3.5 h-3.5" />
                  Sandbox
                </button>
              </div>
              {activeTab === "ts" && tsExample && (
                <CodeBlock code={tsExample} language="typescript" title="TypeScript Example" />
              )}
              {activeTab === "python" && pythonExample && (
                <CodeBlock code={pythonExample} language="python" title="Python Example" />
              )}
              {activeTab === "sandbox" && (
                <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <h4 className="text-sm font-semibold text-slate-900 mb-4">Interactive Sandbox</h4>
                  <form onSubmit={handleSandboxSubmit} className="space-y-4">
                    {params.length > 0 ? (
                      <div className="space-y-3">
                        {params.map(param => (
                          <div key={param.name}>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                              {param.name} {param.required && <span className="text-red-500">*</span>}
                              <span className="text-slate-400 ml-2 font-normal">({param.type})</span>
                            </label>
                            <input
                              type="text"
                              required={param.required}
                              value={formValues[param.name] || ""}
                              onChange={e => setFormValues({...formValues, [param.name]: e.target.value})}
                              placeholder={param.description}
                              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 mb-4">No parameters required for this endpoint.</p>
                    )}
                    
                    <button
                      type="submit"
                      disabled={sandboxLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {sandboxLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                      Try it out
                    </button>
                  </form>

                  {sandboxError && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                      {sandboxError}
                    </div>
                  )}

                  {sandboxResponse && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase">Response</span>
                        <span className={`text-xs font-mono font-medium px-2 py-0.5 rounded ${
                          sandboxResponse.status >= 200 && sandboxResponse.status < 300
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {sandboxResponse.status}
                        </span>
                      </div>
                      <CodeBlock 
                        code={sandboxResponse.data ? JSON.stringify(sandboxResponse.data, null, 2) : "No content"} 
                        language="json" 
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Responses */}
          {responses.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 mb-2">Responses</h4>
              <div className="space-y-2">
                {responses.map((response) => (
                  <div
                    key={response.status}
                    className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg"
                  >
                    <span
                      className={`text-sm font-mono font-medium ${
                        response.status >= 200 && response.status < 300
                          ? "text-green-600"
                          : response.status >= 400 && response.status < 500
                          ? "text-amber-600"
                          : "text-red-600"
                      }`}
                    >
                      {response.status}
                    </span>
                    <span className="text-sm text-slate-600">{response.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
