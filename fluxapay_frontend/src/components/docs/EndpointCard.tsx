"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { CodeBlock } from "./CodeBlock";

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
  const [copiedPath, setCopiedPath] = useState(false);
  const [activeTab, setActiveTab] = useState<"ts" | "python">("ts");

  const handleCopyPath = async () => {
    await navigator.clipboard.writeText(path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
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
              </div>
              {activeTab === "ts" && tsExample && (
                <CodeBlock code={tsExample} language="typescript" title="TypeScript Example" />
              )}
              {activeTab === "python" && pythonExample && (
                <CodeBlock code={pythonExample} language="python" title="Python Example" />
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
